/* ========================================================================
   KIBERONE — игра «Новогодние сани».
   Сверху падают подарки. Сани внизу двигаются, когда ученик печатает
   слово: слово слева — шаг влево, слово справа — шаг вправо.
   Чем дальше от центра шаг, тем длиннее слово; подарок у края дороже.
   ======================================================================== */
(function(){
  "use strict";
  var el = function(id){ return document.getElementById(id); };
  var stage = el('stage'), field = el('field'), overlay = el('overlay'),
      ovBig = el('ovBig'), ovText = el('ovText'), ovSmall = el('ovSmall'),
      results = el('results'), clock = el('clock'), timeEl = el('time'),
      livesBox = el('lives'), sled = el('sled'), lanesBox = el('lanes'),
      wLeft = el('wLeft'), wRight = el('wRight'), typedText = el('typedText'),
      startBtn = el('start'), pauseBtn = el('pause');

  var K = window.KIBER, SESSION = K.session, fmt = K.fmtTime;

  /* ---------- слова по дальности шага ----------
     1 — шаг к центру или на соседнюю дорожку: 3–4 буквы
     2 — вторая дорожка от центра: 5–6 букв
     3 — край поля: длинные слова
     Слова без Ё и дефисов. Добавлять свои можно прямо в списки. */
  var WORDS = {
    1: ('снег шар лес сани мех пар бал торт пир гном лыжи ель дым чай сыр мак кот ' +
        'лось нос бант звон свет лиса сова зима луна плед сад иней гусь мяч кит дом ' +
        'год пух шарф лапа след сок суп час бой рука ночь шуба') .split(' '),
    2: ('мороз снежок санки звезда шишка шапка метель вьюга иголка свечка ' +
        'пряник коньки клюшка каток салют улыбка сказка сугроб олень белка зайка ' +
        'бантик фонарь окошко лыжник ворота елочка узоры хвост ' +
        'блины печка горка').split(' '),
    3: ('снеговик снежинка гирлянда хлопушка мандарины праздник новогодний ' +
        'серпантин конфетти снегопад рукавицы сосулька карнавал фейерверк хоровод ' +
        'валенки варежки подарки снегурочка морозный каникулы календарь ' +
        'клавиатура компьютер открытка игрушки медведь подарок пингвин конфета').split(' ')
  };

  /* ---------- сложность ----------
     fallSec     — за сколько секунд подарок падает до саней в начале раунда
     spawnSec    — пауза между подарками в начале раунда
     maxOnScreen — сколько подарков падает одновременно
     К концу раунда подарки падают в RAMP раз быстрее. */
  var MODES = {
    easy:   { name:'Лёгкий',  fallSec:15, spawnSec:2,   maxOnScreen:1,
              about:'Подарки падают по одному и медленно. Самое время разогреться!' },
    medium: { name:'Средний', fallSec:11, spawnSec:6,   maxOnScreen:2,
              about:'Иногда падают сразу два подарка — выбирай, за каким ехать.' },
    hard:   { name:'Сложный', fallSec:8,  spawnSec:4,   maxOnScreen:2,
              about:'Подарки падают быстро. Печатай длинные слова без ошибок!' }
  };
  var ROUND_SEC = 120, LIVES = 5, RAMP = 1.3;
  var SIDE = 3;                     // дорожки от -3 до 3, всего 7
  var LANES = SIDE * 2 + 1;
  var GIFT_PX = 54, SLED_PX = 64;   // как в styles.css
  var GIFTS = ['🎁','🎁','🎁','🧸','🍬','🎀'];

  var modeId = 'easy', mode = MODES[modeId];
  var phase = 'idle';               // idle | countdown | playing | paused | over
  var gifts = [];                   // { lane: -3..3, y: 0..1, speed, value, node }
  var pos, words, typed, lives, caught, score, wordsDone, right, wrong, elapsed, spawnIn, shownSec, lastLane;
  var recent = [];                  // недавние слова, чтобы не повторялись
  var fieldH = 0, lastTs = 0, raf = 0, countdownTimer = null;

  var guard = K.mashGuard({ onTrip: function(){ pause(); } });

  /* ---------- дорожки на снегу ---------- */
  var laneNodes = [];
  for (var li = 0; li < LANES; li++){
    var ln = document.createElement('div');
    ln.className = 'lane';
    lanesBox.appendChild(ln);
    laneNodes.push(ln);
  }
  function laneLeft(lane){ return ((lane + SIDE + 0.5) / LANES * 100) + '%'; }

  /* ---------- слова ---------- */
  function norm(s){ return s.replace(/ё/g, 'е'); }
  function tierFor(target){ var d = Math.abs(target); return d <= 1 ? 1 : d === 2 ? 2 : 3; }
  function pickWord(tier, avoidFirst){
    var list = WORDS[tier], w, tries = 0;
    do {
      w = K.pick(list);
      tries++;
    } while (tries < 60 && (recent.indexOf(w) !== -1 || (avoidFirst && w.charAt(0) === avoidFirst)));
    recent.push(w);
    if (recent.length > 12) recent.shift();
    return w;
  }
  function newWords(){
    var l = pos > -SIDE ? pickWord(tierFor(pos - 1), '') : '';
    var r = pos < SIDE ? pickWord(tierFor(pos + 1), l.charAt(0)) : '';
    words = { left: l, right: r };
    typed = '';
    renderWords();
  }

  function renderWord(box, w, side){
    var span = box.querySelector('.w');
    box.classList.toggle('blocked', !w);
    box.classList.remove('tier1', 'tier2', 'tier3');
    if (!w){ span.textContent = 'край'; return; }
    box.classList.add('tier' + tierFor(pos + (side === 'left' ? -1 : 1)));
    var on = typed && norm(w).indexOf(norm(typed)) === 0;
    box.classList.toggle('dim', !!typed && !on);
    span.innerHTML = '';
    for (var i = 0; i < w.length; i++){
      var s = document.createElement('i');
      s.textContent = w.charAt(i).toUpperCase();
      if (on && i < typed.length) s.className = 'ok';
      else if (on && i === typed.length) s.className = 'cur';
      span.appendChild(s);
    }
  }
  function renderWords(){
    renderWord(wLeft, words.left, 'left');
    renderWord(wRight, words.right, 'right');
    typedText.textContent = typed ? typed.toUpperCase() : '…';
  }

  /* ---------- рекорд сессии ---------- */
  function renderRecord(){
    var line = el('recordLine');
    var r = SESSION.newyear && SESSION.newyear[modeId];
    if (r && r.score){
      line.innerHTML = '🏆 Рекорд сессии (' + mode.name.toLowerCase() + '): <b>' + r.score +
        '</b> очков · подарков <b>' + r.gifts + '</b>';
    } else {
      line.textContent = '🏆 Рекорд сессии на этой сложности ещё не установлен.';
    }
  }

  /* ---------- заставка, кнопки, счётчики ---------- */
  function showOverlay(big, text, small){
    ovBig.textContent = big; ovText.textContent = text; ovSmall.textContent = small || '';
    overlay.classList.remove('hidden');
  }
  function syncButtons(){
    startBtn.textContent = phase === 'paused' ? '▶️ Продолжить' : '▶️ Старт';
    startBtn.hidden = phase !== 'idle' && phase !== 'paused';
    var paused = phase === 'paused';
    pauseBtn.textContent = paused ? '▶️' : '⏸️';
    pauseBtn.title = paused ? 'Продолжить (пробел)' : 'Пауза (Esc)';
    pauseBtn.disabled = phase !== 'playing' && phase !== 'paused';
  }
  function renderLives(){
    var h = livesBox.children;
    for (var i = 0; i < h.length; i++) h[i].classList.toggle('lost', i >= lives);
    livesBox.setAttribute('aria-label', 'Жизни: ' + lives);
  }
  function renderCounters(){
    el('cGifts').textContent = caught;
    el('cScore').textContent = score;
  }
  function renderClock(){
    var sec = Math.max(0, Math.ceil(ROUND_SEC - elapsed));
    if (sec === shownSec) return;
    shownSec = sec;
    timeEl.textContent = fmt(sec);
    clock.classList.toggle('low', sec <= 10);
  }
  function renderSled(){ sled.style.left = laneLeft(pos); }
  function renderTargets(){
    var mark = {};
    for (var i = 0; i < gifts.length; i++) mark[gifts[i].lane] = true;
    for (var l = 0; l < LANES; l++){
      laneNodes[l].classList.toggle('target', !!mark[l - SIDE]);
      laneNodes[l].classList.toggle('here', l - SIDE === pos);
    }
  }

  /* ---------- подарки ---------- */
  function measure(){ fieldH = Math.max(0, field.clientHeight - SLED_PX - GIFT_PX - 6); }
  function place(g){ g.node.style.transform = 'translate(-50%,' + Math.round(g.y * fieldH) + 'px)'; }

  function spawn(mult){
    if (gifts.length >= mode.maxOnScreen) return false;
    var busy = {};
    for (var i = 0; i < gifts.length; i++) busy[gifts[i].lane] = true;
    var free = [];
    for (var l = -SIDE; l <= SIDE; l++) if (!busy[l] && l !== lastLane) free.push(l);
    if (!free.length) return false;
    var lane = K.pick(free);
    lastLane = lane;
    var value = 1 + Math.abs(lane);
    var g = { lane: lane, y: 0, speed: mult / mode.fallSec, value: value, node: document.createElement('div') };
    g.node.className = 'gift';
    g.node.innerHTML = K.pick(GIFTS) + '<b>+' + value + '</b>';
    g.node.style.left = laneLeft(lane);
    place(g);
    field.appendChild(g.node);
    gifts.push(g);
    renderTargets();
    return true;
  }

  function removeGift(g, cls){
    gifts.splice(gifts.indexOf(g), 1);
    g.node.style.setProperty('--at', g.node.style.transform);
    g.node.classList.add(cls);
    setTimeout(function(){ if (g.node.parentNode) g.node.parentNode.removeChild(g.node); }, 450);
    renderTargets();
  }
  function clearGifts(){
    gifts = [];
    var old = field.querySelectorAll('.gift, .plus');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
  }
  function floatText(lane, text, cls){
    var n = document.createElement('div');
    n.className = 'plus ' + (cls || '');
    n.textContent = text;
    n.style.left = laneLeft(lane);
    field.appendChild(n);
    setTimeout(function(){ if (n.parentNode) n.parentNode.removeChild(n); }, 900);
  }

  function land(g){
    if (g.lane === pos){
      caught++; score += g.value;
      removeGift(g, 'hit');
      floatText(g.lane, '+' + g.value, 'ok');
      K.replay(sled, 'pop');
      renderCounters();
    } else {
      lives--;
      removeGift(g, 'miss');
      floatText(g.lane, 'мимо', 'bad');
      renderLives();
      K.replay(livesBox.children[lives], 'pop');
      if (lives <= 0) finish(false);
    }
  }

  /* ---------- игровой цикл ---------- */
  function frame(ts){
    raf = 0;
    if (phase !== 'playing') return;
    var dt = Math.max(0, Math.min((ts - lastTs) / 1000, 0.1));
    lastTs = ts;
    elapsed += dt;
    var mult = 1 + (RAMP - 1) * Math.min(elapsed / ROUND_SEC, 1);

    spawnIn -= dt;
    if (spawnIn <= 0) spawnIn = spawn(mult) ? mode.spawnSec / mult : 0.3;

    for (var i = gifts.length - 1; i >= 0; i--){
      var g = gifts[i];
      g.y += g.speed * dt;
      if (g.y >= 1){ g.y = 1; place(g); land(g); if (phase !== 'playing') return; }
      else place(g);
    }

    renderClock();
    if (elapsed >= ROUND_SEC){ finish(true); return; }
    raf = requestAnimationFrame(frame);
  }

  /* ---------- ввод слова ---------- */
  function move(dir){
    pos += dir;
    wordsDone++;
    renderSled();
    newWords();
    renderTargets();
  }

  function typeLetter(ch){
    var next = norm(typed + ch);
    var l = words.left && norm(words.left).indexOf(next) === 0;
    var r = words.right && norm(words.right).indexOf(next) === 0;
    if (!l && !r){
      wrong++;
      guard.wrong();
      K.replay(el('wordbar'), 'shake');
      return;
    }
    right++;
    guard.right();
    typed += ch;
    if (l && next === norm(words.left)) { move(-1); return; }
    if (r && next === norm(words.right)) { move(1); return; }
    renderWords();
  }

  /* ---------- этапы раунда ---------- */
  function reset(){
    cancelAnimationFrame(raf); raf = 0;
    clearInterval(countdownTimer); countdownTimer = null;
    clearGifts();
    pos = 0; lives = LIVES; caught = 0; score = 0; wordsDone = 0; right = 0; wrong = 0;
    elapsed = 0; spawnIn = 0.5; shownSec = -1; lastLane = null;
    guard.reset();
    stage.classList.remove('finished');
    results.classList.remove('show');
    measure();
    renderSled(); newWords(); renderTargets();
    renderLives(); renderCounters(); renderClock();
    phase = 'idle';
    showOverlay('🛷', mode.name + ' уровень', mode.about + ' Нажми пробел или кнопку «Старт».');
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
    clearGifts();
    clock.classList.remove('low');
    var acc = right + wrong ? Math.round(right / (right + wrong) * 100) : 100;

    el('resTitle').textContent = won ? '🎄 С Новым годом!' : 'Ёлочки закончились';
    el('rGifts').textContent = caught;
    el('rScore').textContent = score;
    el('rWords').textContent = wordsDone;
    el('rAcc').textContent = acc + '%';

    var rank;
    if (!won) rank = 'Раунд закончился на ' + fmt(Math.floor(elapsed)) + ' из ' + fmt(ROUND_SEC) + '. Дед Мороз верит в тебя — попробуй ещё!';
    else if (modeId === 'easy') rank = 'Все подарки доставлены! Попробуй средний уровень.';
    else if (modeId === 'medium') rank = 'Отличная езда! Сложный уровень ждёт тебя.';
    else rank = 'Настоящий помощник Деда Мороза!';
    if (acc < 85) rank += ' Печатай чуть спокойнее: лишние буквы тормозят сани.';
    if (guard.trips) rank += ' ✋ Остановок за стучание: ' + guard.trips + '.';
    el('rank').textContent = rank;

    stage.classList.add('finished');
    results.classList.add('show');
    syncButtons();

    SESSION.newyear = SESSION.newyear || {};
    var prev = SESSION.newyear[modeId] || { score: 0, gifts: 0 };
    var isRecord = score > prev.score;
    if (isRecord){ SESSION.newyear[modeId] = { score: score, gifts: caught }; K.saveSession(); }
    renderRecord();

    var note = el('recNote');
    if (isRecord && prev.score) note.textContent = 'Новый рекорд! Прошлый: ' + prev.score + ' очков.';
    else if (isRecord) note.textContent = 'Первый результат на этой сложности!';
    else if (prev.score) note.textContent = 'Рекорд сессии: ' + prev.score + ' очков. Побей его!';
    else note.textContent = 'Поймай хотя бы один подарок, чтобы поставить рекорд.';

    if (won || isRecord) K.confetti(won && isRecord && prev.score > 0);
    K.replay(results, 'burst');
  }

  /* ---------- клавиатура ---------- */
  document.addEventListener('keydown', function(e){
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space'){
      var t = e.target;
      if (phase !== 'playing' && t && t !== document.body && /^(BUTTON|SUMMARY|A)$/.test(t.tagName)) return;
      if (phase === 'idle' || phase === 'over') start();
      else if (phase === 'paused') resume();
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape'){
      if (phase === 'paused') resume(); else pause();
      return;
    }
    if (phase !== 'playing') return;
    if (e.code === 'Backspace'){
      e.preventDefault();
      if (typed){ typed = typed.slice(0, -1); renderWords(); }
      return;
    }
    var ch = K.ruByCode[e.code];     // буква по физической клавише, раскладка не важна
    if (!ch || ch === '.') return;
    e.preventDefault();
    if (e.repeat) return;
    typeLetter(ch);
  });

  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', function(){ if (document.hidden) pause(); });
  window.addEventListener('resize', function(){
    if (stage.classList.contains('finished')) return;
    measure();
    for (var i = 0; i < gifts.length; i++) place(gifts[i]);
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
  overlay.addEventListener('click', function(){
    startBtn.blur();
    if (phase === 'idle') start(); else if (phase === 'paused') resume();
  });

  reset();
})();
