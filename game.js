(function(){
  "use strict";
  var el = function(id){ return document.getElementById(id); };
  var stage = el('stage'), field = el('field'), overlay = el('overlay'),
      ovBig = el('ovBig'), ovText = el('ovText'), ovSmall = el('ovSmall'),
      results = el('results'), clock = el('clock'), timeEl = el('time'),
      livesBox = el('lives'), kbwrap = el('kbwrap'),
      startBtn = el('start'), pauseBtn = el('pause');

  var K = window.KIBER, SESSION = K.session, fmt = K.fmtTime;

  /* ---------- сложность ----------
     keys        — какие буквы падают
     fallSec     — за сколько секунд буква долетает до низа в начале раунда
     spawnSec    — пауза между новыми буквами в начале раунда
     maxOnScreen — сколько букв падает одновременно
     hint        — показывать клавиатуру с подсветкой ближайшей буквы
     К концу раунда буквы падают и появляются в RAMP раз быстрее. */
  var MODES = {
    easy:   { name:'Лёгкий',  keys:'фывапролдж', fallSec:7, spawnSec:1.6, maxOnScreen:3, hint:true,
              about:'Только средний ряд: Ф Ы В А П Р О Л Д Ж. Внизу подсвечена клавиша для ближайшей буквы.' },
    medium: { name:'Средний', keys:'фывапролджйцукенгшщз', fallSec:5, spawnSec:1.1, maxOnScreen:4, hint:false,
              about:'Средний и верхний ряды. Подсказки нет.' },
    hard:   { name:'Сложный', keys:'йцукенгшщзхъфывапролджэячсмитьбюё', fallSec:3.6, spawnSec:0.75, maxOnScreen:6, hint:false,
              about:'Все буквы, включая Ё, Ъ и Э. Подсказки нет.' }
  };
  var ROUND_SEC = 90, LIVES = 3, RAMP = 1.6;
  var LETTER_PX = 58;          // размер плашки с буквой, как в styles.css

  var modeId = 'easy', mode = MODES[modeId];
  var phase = 'idle';          // idle | countdown | playing | paused | over
  var targets = [];            // { ch, lane, y: 0..1, speed: доля высоты в секунду, node }
  var lives, caught, wrong, streak, bestStreak, elapsed, spawnIn, lanes, lastCh, shownSec;
  var fieldH = 0, lastTs = 0, raf = 0, countdownTimer = null;

  var keyMap = K.buildKeyboard(el('keyboard'));
  var hintKey = null, lowNode = null;

  /* ---------- рекорд сессии: отдельно для каждой сложности ---------- */
  function plural(n, one, few, many){
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function letters(n){ return n + ' ' + plural(n, 'буква', 'буквы', 'букв'); }

  function renderRecord(){
    var line = el('recordLine');
    var r = SESSION.game && SESSION.game[modeId];
    if (r && r.caught){
      line.innerHTML = '🏆 Рекорд сессии (' + mode.name.toLowerCase() + '): <b>' + letters(r.caught) +
        '</b> · точность <b>' + r.acc + '%</b>' + (r.won ? ' · раунд пройден' : '');
    } else {
      line.textContent = '🏆 Рекорд сессии на этой сложности ещё не установлен.';
    }
  }

  /* ---------- заставка поверх поля ---------- */
  function showOverlay(big, text, small){
    ovBig.textContent = big;
    ovText.textContent = text;
    ovSmall.textContent = small || '';
    overlay.classList.remove('hidden');
  }
  function syncButtons(){
    startBtn.textContent = phase === 'paused' ? '▶️ Продолжить' : '▶️ Старт';
    startBtn.hidden = phase !== 'idle' && phase !== 'paused';
    var paused = phase === 'paused';
    pauseBtn.textContent = paused ? '▶️' : '⏸️';
    pauseBtn.title = paused ? 'Продолжить (пробел)' : 'Пауза (Esc)';
    pauseBtn.setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
    pauseBtn.disabled = phase !== 'playing' && phase !== 'paused';
  }

  function renderLives(){
    var hearts = livesBox.children;
    for (var i = 0; i < hearts.length; i++) hearts[i].classList.toggle('lost', i >= lives);
    livesBox.setAttribute('aria-label', 'Жизни: ' + lives);
  }
  function renderCounters(){
    el('cCaught').textContent = caught;
    el('cStreak').textContent = streak;
  }
  function renderClock(){
    var sec = Math.max(0, Math.ceil(ROUND_SEC - elapsed));
    if (sec === shownSec) return;
    shownSec = sec;
    timeEl.textContent = fmt(sec);
    clock.classList.toggle('low', sec <= 5);
  }

  /* ---------- подсказка: ближайшая к низу буква ---------- */
  function lowest(){
    var best = null;
    for (var i = 0; i < targets.length; i++) if (!best || targets[i].y > best.y) best = targets[i];
    return best;
  }
  function renderHint(){
    if (!mode.hint) return;
    var t = lowest();
    var node = t ? t.node : null;
    if (node === lowNode) return;
    if (lowNode) lowNode.classList.remove('low');
    if (hintKey){ hintKey.className = 'key'; hintKey = null; }
    lowNode = node;
    if (!t) return;
    node.classList.add('low');
    hintKey = keyMap[t.ch];
    if (hintKey) hintKey.className = 'key hl ' + K.handOf(t.ch);
  }

  /* ---------- буквы ---------- */
  function measure(){
    fieldH = Math.max(0, field.clientHeight - LETTER_PX);
    lanes = Math.max(4, Math.min(8, Math.floor(field.clientWidth / (LETTER_PX + 14))));
  }

  function place(t){ t.node.style.transform = 'translateY(' + Math.round(t.y * fieldH) + 'px)'; }
  function placeLane(t){ t.node.style.left = ((t.lane + 0.5) / lanes * 100) + '%'; }

  // свободна дорожка, где верхняя буква уже отъехала вниз хотя бы на полторы своих высоты
  function freeLanes(){
    var gap = fieldH ? LETTER_PX * 1.5 / fieldH : 0.3;
    var busy = {};
    for (var i = 0; i < targets.length; i++) if (targets[i].y < gap) busy[targets[i].lane] = true;
    var out = [];
    for (var l = 0; l < lanes; l++) if (!busy[l]) out.push(l);
    return out;
  }

  function spawn(mult){
    if (targets.length >= mode.maxOnScreen) return false;
    var free = freeLanes();
    if (!free.length) return false;
    var ch;
    do { ch = K.pick(mode.keys.split('')); } while (ch === lastCh && mode.keys.length > 1);
    lastCh = ch;
    var t = { ch: ch, lane: K.pick(free), y: 0, speed: mult / mode.fallSec, node: document.createElement('div') };
    t.node.className = 'letter';
    t.node.textContent = ch.toUpperCase();
    placeLane(t);
    place(t);
    field.appendChild(t.node);
    targets.push(t);
    return true;
  }

  function removeTarget(t, cls){
    targets.splice(targets.indexOf(t), 1);
    if (t.node === lowNode){
      lowNode = null;
      if (hintKey){ hintKey.className = 'key'; hintKey = null; }   // иначе подсветка зависнет, если букв больше нет
    }
    t.node.classList.remove('low');
    t.node.style.setProperty('--at', t.node.style.transform);
    t.node.classList.add(cls);
    setTimeout(function(){ if (t.node.parentNode) t.node.parentNode.removeChild(t.node); }, 350);
  }

  function clearLetters(){
    targets = [];
    lowNode = null;
    var old = field.querySelectorAll('.letter');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    if (hintKey){ hintKey.className = 'key'; hintKey = null; }
  }

  /* ---------- игровой цикл: движение по времени, а не по кадрам ---------- */
  function frame(ts){
    raf = 0;
    if (phase !== 'playing') return;
    // первый кадр после старта может прийти с меткой чуть раньше lastTs — не даём dt уйти в минус;
    // после подвисания не прыгаем далеко
    var dt = Math.max(0, Math.min((ts - lastTs) / 1000, 0.1));
    lastTs = ts;
    elapsed += dt;
    var mult = 1 + (RAMP - 1) * Math.min(elapsed / ROUND_SEC, 1);

    spawnIn -= dt;
    if (spawnIn <= 0) spawnIn = spawn(mult) ? mode.spawnSec / mult : 0.15;

    for (var i = targets.length - 1; i >= 0; i--){
      var t = targets[i];
      t.y += t.speed * dt;
      if (t.y >= 1){ t.y = 1; place(t); drop(t); if (phase !== 'playing') return; }
      else place(t);
    }

    renderHint();
    renderClock();
    if (elapsed >= ROUND_SEC){ finish(true); return; }
    raf = requestAnimationFrame(frame);
  }

  function hit(t){
    caught++; streak++;
    if (streak > bestStreak) bestStreak = streak;
    removeTarget(t, 'hit');
    renderCounters();
    if (streak >= 5) K.replay(el('cStreak'), 'pop');
  }

  // буква долетела до низа — минус жизнь
  function drop(t){
    lives--; streak = 0;
    removeTarget(t, 'miss');
    renderLives(); renderCounters();
    K.replay(livesBox.children[lives], 'pop');
    if (lives <= 0) finish(false);
  }

  // неверная клавиша: жизнь не отнимаем, только сбрасываем серию
  function missPress(){
    wrong++; streak = 0;
    renderCounters();
    K.replay(field, 'shake');
  }

  function press(ch){
    var best = null;   // из одинаковых букв засчитываем ту, что ниже
    for (var i = 0; i < targets.length; i++){
      var t = targets[i];
      if (t.ch === ch && (!best || t.y > best.y)) best = t;
    }
    if (best) hit(best); else missPress();
    renderHint();
  }

  /* ---------- этапы раунда ---------- */
  function reset(){
    cancelAnimationFrame(raf); raf = 0;
    clearInterval(countdownTimer); countdownTimer = null;
    clearLetters();
    lives = LIVES; caught = 0; wrong = 0; streak = 0; bestStreak = 0;
    elapsed = 0; spawnIn = 0; lastCh = ''; shownSec = -1;
    kbwrap.hidden = !mode.hint;
    stage.classList.toggle('with-hint', mode.hint);
    stage.classList.remove('finished');   // сначала вернуть поле, потом мерить
    results.classList.remove('show');
    measure();
    renderLives(); renderCounters(); renderClock();
    phase = 'idle';
    showOverlay('🎯', mode.name + ' уровень', mode.about + ' Нажми пробел или кнопку «Старт».');
    syncButtons();
    renderRecord();
  }

  function countdown(){
    phase = 'countdown';
    syncButtons();
    var n = 3;
    showOverlay(String(n), 'Приготовься!', '');
    countdownTimer = setInterval(function(){
      n--;
      if (n > 0){ ovBig.textContent = n; K.replay(ovBig, 'pop'); return; }
      clearInterval(countdownTimer); countdownTimer = null;
      play();
    }, 700);
  }

  function play(){
    phase = 'playing';
    overlay.classList.add('hidden');
    syncButtons();
    lastTs = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function start(){ reset(); countdown(); }

  function pause(){
    if (phase !== 'playing' && phase !== 'countdown') return;
    cancelAnimationFrame(raf); raf = 0;
    clearInterval(countdownTimer); countdownTimer = null;
    phase = 'paused';
    showOverlay('⏸️', 'Пауза', 'Нажми пробел или кнопку, чтобы продолжить.');
    syncButtons();
  }
  function resume(){ if (phase === 'paused') countdown(); }

  function finish(won){
    cancelAnimationFrame(raf); raf = 0;
    phase = 'over';
    clearLetters();
    clock.classList.remove('low');
    var acc = caught + wrong ? Math.round(caught / (caught + wrong) * 100) : 100;

    el('resTitle').textContent = won ? 'Раунд пройден!' : 'Жизни закончились';
    el('rCaught').textContent = caught;
    el('rAcc').textContent = acc + '%';
    el('rStreak').textContent = bestStreak;

    var rank;
    if (!won) rank = 'Раунд закончился на ' + fmt(Math.floor(elapsed)) + ' из ' + fmt(ROUND_SEC) + '. Попробуй ещё раз!';
    else if (modeId === 'easy') rank = 'Средний ряд освоен. Попробуй средний уровень!';
    else if (modeId === 'medium') rank = 'Два ряда под контролем. Теперь попробуй сложный уровень!';
    else rank = 'Все буквы и полная скорость. Это уровень мастера!';
    if (acc < 80) rank += ' Не торопись: лишние нажатия сбрасывают серию.';
    el('rank').textContent = rank;

    stage.classList.add('finished');
    results.classList.add('show');
    syncButtons();

    // рекорд: больше пойманных букв; при равенстве — выше точность
    SESSION.game = SESSION.game || {};
    var prev = SESSION.game[modeId] || { caught: 0, acc: 0 };
    var isRecord = caught > prev.caught || (caught === prev.caught && caught > 0 && acc > prev.acc);
    if (isRecord){ SESSION.game[modeId] = { caught: caught, acc: acc, won: won }; K.saveSession(); }
    renderRecord();

    var note = el('recNote');
    if (isRecord && caught === prev.caught) note.textContent = 'Новый рекорд по точности! Прошлая: ' + prev.acc + '%.';
    else if (isRecord && prev.caught) note.textContent = 'Новый рекорд! Прошлый: ' + letters(prev.caught) + '.';
    else if (isRecord) note.textContent = 'Первый результат на этой сложности!';
    else if (prev.caught) note.textContent = 'Рекорд сессии: ' + letters(prev.caught) + '. Побей его!';
    else note.textContent = 'Поймай хотя бы одну букву, чтобы поставить рекорд.';

    if (won || isRecord) K.confetti(won && isRecord && prev.caught > 0);
    K.replay(results, 'burst');
  }

  /* ---------- клавиатура ---------- */
  document.addEventListener('keydown', function(e){
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space'){
      // пробел на кнопке сложности или «Как играть» до старта — обычное нажатие этого элемента
      var t = e.target;
      if (phase !== 'playing' && t && t !== document.body && /^(BUTTON|SUMMARY|A)$/.test(t.tagName)) return;
      if (phase === 'idle' || phase === 'over') start();
      else if (phase === 'paused') resume();
      e.preventDefault();            // не прокручивать страницу и не нажимать кнопку в фокусе
      return;
    }
    if (e.code === 'Escape'){
      if (phase === 'paused') resume(); else pause();
      return;
    }

    var ch = K.ruByCode[e.code];     // буква по физической клавише, раскладка не важна
    if (!ch || ch === '.' || phase !== 'playing') return;
    e.preventDefault();              // ' и / в Firefox открывают быстрый поиск
    if (e.repeat) return;            // зажатая клавиша не стреляет очередью
    press(ch);
  });

  /* ---------- пауза, когда ученик ушёл с вкладки ---------- */
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', function(){ if (document.hidden) pause(); });
  window.addEventListener('resize', function(){
    if (stage.classList.contains('finished')) return;   // поле скрыто, мерить нечего
    measure();
    for (var i = 0; i < targets.length; i++){
      var t = targets[i];
      if (t.lane >= lanes) t.lane = lanes - 1;   // окно сузилось — дорожек стало меньше
      placeLane(t);
      place(t);
    }
  });

  /* ---------- кнопки ---------- */
  function setMode(id){
    modeId = id; mode = MODES[id];
    el('mEasy').setAttribute('aria-pressed', id === 'easy' ? 'true' : 'false');
    el('mMedium').setAttribute('aria-pressed', id === 'medium' ? 'true' : 'false');
    el('mHard').setAttribute('aria-pressed', id === 'hard' ? 'true' : 'false');
    reset();
  }
  el('mEasy').addEventListener('click', function(){ this.blur(); setMode('easy'); });
  el('mMedium').addEventListener('click', function(){ this.blur(); setMode('medium'); });
  el('mHard').addEventListener('click', function(){ this.blur(); setMode('hard'); });
  el('again').addEventListener('click', function(){ this.blur(); start(); });
  pauseBtn.addEventListener('click', function(){
    this.blur();
    if (phase === 'paused') resume(); else pause();
  });
  // клик по заставке или по кнопке «Старт» на ней
  overlay.addEventListener('click', function(){
    startBtn.blur();
    if (phase === 'idle') start(); else if (phase === 'paused') resume();
  });

  reset();
})();
