/* ========================================================================
   KIBERONE — общий код всех страниц: рекорд сессии, конфетти,
   форматирование времени, перезапуск анимаций, раскладка ЙЦУКЕН.
   Подключается ДО typing.js / hotkeys.js / game.js и создаёт window.KIBER.
   ======================================================================== */
(function(){
  "use strict";

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- рекорд сессии ----------
     Живёт в памяти вкладки (sessionStorage). Переживает переход между
     тренажёрами в той же вкладке и исчезает при закрытии страницы. */
  var SESSION_KEY = 'kiberone_v1';
  var session = {};
  try { var raw = sessionStorage.getItem(SESSION_KEY); if (raw) session = JSON.parse(raw) || {}; } catch (e) {}
  function saveSession(){ try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {} }

  function fmtTime(sec){
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  /* перезапуск CSS-анимации: снять класс, форсировать перерисовку, вернуть */
  function replay(node, cls){
    if (reduceMotion || !node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  /* ---------- конфетти: всплеск из центра + дождь сверху ---------- */
  var CONFETTI_COLORS = ['#6C2BD9','#17C3B2','#F72585','#FFD60A','#FF8C42','#4CC9F0','#fff'];
  var confettiRun = 0;
  function confetti(big){
    if (reduceMotion) return;
    var cv = document.getElementById('confetti');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    var run = ++confettiRun;   // новый залп останавливает предыдущий
    var parts = [], cx = cv.width / 2, cy = cv.height * 0.42;

    var burst = big ? 120 : 80;
    for (var i = 0; i < burst; i++){
      var ang = Math.random() * Math.PI * 2, spd = 5 + Math.random() * 11;
      parts.push({ x:cx, y:cy, s:7 + Math.random() * 8,
        vx:Math.cos(ang) * spd, vy:Math.sin(ang) * spd - 3,
        rot:Math.random() * 6.28, vr:-0.3 + Math.random() * 0.6,
        col:CONFETTI_COLORS[i % CONFETTI_COLORS.length] });
    }
    var rain = big ? 160 : 110;
    for (var j = 0; j < rain; j++){
      parts.push({ x:Math.random() * cv.width, y:-20 - Math.random() * cv.height * 0.5,
        s:6 + Math.random() * 7, vx:-2 + Math.random() * 4, vy:2 + Math.random() * 4,
        rot:Math.random() * 6.28, vr:-0.2 + Math.random() * 0.4,
        col:CONFETTI_COLORS[j % CONFETTI_COLORS.length] });
    }

    var frames = 0, MAX = 200;
    (function anim(){
      if (run !== confettiRun) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < parts.length; i++){
        var p = parts[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        p.vy += 0.12;            // гравитация
        p.vx *= 0.99;            // небольшое трение для разлетевшихся
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = frames > MAX - 40 ? (MAX - frames) / 40 : 1;
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (++frames < MAX) requestAnimationFrame(anim);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  /* ---------- раскладка ЙЦУКЕН ----------
     KB_ROWS — буквы по рядам для схемы клавиатуры.
     KB_CODES — физические клавиши (e.code) на тех же местах: по ним игра
     узнаёт букву при любой включённой раскладке. */
  var KB_ROWS = [
    ['й','ц','у','к','е','н','г','ш','щ','з','х','ъ'],
    ['ф','ы','в','а','п','р','о','л','д','ж','э'],
    ['я','ч','с','м','и','т','ь','б','ю','.']
  ];
  var KB_CODES = [
    ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'],
    ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'],
    ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash']
  ];
  // ё: слева от 1 на ПК; IntlBackslash — то же место на Mac с ISO-клавиатурой
  var RU_BY_CODE = { Backquote: 'ё', IntlBackslash: 'ё' };
  for (var r = 0; r < KB_ROWS.length; r++)
    for (var c = 0; c < KB_ROWS[r].length; c++) RU_BY_CODE[KB_CODES[r][c]] = KB_ROWS[r][c];

  // левая рука по десятипальцевому методу: й ц у к е / ф ы в а п / я ч с м и
  var LEFT_KEYS = 'йцукефывапячсми12345ё';
  function handOf(ch){
    if (ch === ' ') return 'thumb';
    return LEFT_KEYS.indexOf(ch) !== -1 ? 'left' : 'right';
  }

  /* рисует схему клавиатуры в container и возвращает { символ: элемент клавиши } */
  function buildKeyboard(container){
    var map = {};
    container.innerHTML = '';
    for (var r = 0; r < KB_ROWS.length; r++){
      var row = document.createElement('div');
      row.className = 'krow';
      for (var c = 0; c < KB_ROWS[r].length; c++){
        var ch = KB_ROWS[r][c];
        var k = document.createElement('div');
        k.className = 'key';
        k.textContent = ch.toUpperCase();
        map[ch] = k;
        row.appendChild(k);
      }
      container.appendChild(row);
    }
    var last = document.createElement('div');
    last.className = 'krow';
    var space = document.createElement('div');
    space.className = 'key space';
    space.textContent = 'пробел';
    map[' '] = space;
    map['ё'] = map['е'];          // на схеме нет отдельной Ё — показываем на Е
    last.appendChild(space);
    container.appendChild(last);
    return map;
  }

  /* ---------- новогоднее оформление ----------
     NEW_YEAR = true — снег, гирлянда и зимние цвета на всех страницах.
     После праздников поставь false, и тренажёр вернётся к обычному виду. */
  var NEW_YEAR = true;

  function startSnow(){
    var cv = document.createElement('canvas');
    cv.id = 'snow';
    cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.body.firstChild);
    var ctx = cv.getContext('2d'), flakes = [], W = 0, H = 0;
    function size(){
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      var need = Math.round(Math.min(90, W * H / 18000));
      while (flakes.length < need) flakes.push(newFlake(true));
      flakes.length = need;
    }
    function newFlake(anywhere){
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -10,
               r: 1.2 + Math.random() * 2.8, vy: 18 + Math.random() * 38,
               sway: Math.random() * 6.28, a: .35 + Math.random() * .5 };
    }
    var last = performance.now();
    function tick(ts){
      var dt = Math.min((ts - last) / 1000, .1); last = ts;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      for (var i = 0; i < flakes.length; i++){
        var f = flakes[i];
        f.y += f.vy * dt; f.sway += dt; f.x += Math.sin(f.sway) * 12 * dt;
        if (f.y > H + 10){ flakes[i] = newFlake(false); continue; }
        ctx.globalAlpha = f.a;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
      requestAnimationFrame(tick);
    }
    window.addEventListener('resize', size);
    size();
    requestAnimationFrame(tick);
  }

  function addGarland(){
    var g = document.createElement('div');
    g.className = 'garland';
    g.setAttribute('aria-hidden', 'true');
    var n = Math.ceil(innerWidth / 46) + 2;
    for (var i = 0; i < n; i++){
      var b = document.createElement('i');
      b.className = 'bulb c' + (i % 4);
      g.appendChild(b);
    }
    document.body.appendChild(g);
  }

  if (NEW_YEAR){
    document.body.classList.add('newyear');
    addGarland();
    if (!reduceMotion) startSnow();
  }

  /* ---------- защита от «стучания» по клавишам ----------
     Ребёнок бьёт ладонью или кулаком по клавиатуре — текст набирается
     случайно, результат ненастоящий. Защита останавливает занятие и
     показывает предупреждение, если:
       • зажато сразу 4 и больше клавиш (удар ладонью);
       • 7 ошибок за 2,5 секунды;
       • 10 ошибок подряд без единого верного нажатия.
     Пока предупреждение на экране, клавиши не доходят до тренажёра.
     Продолжить можно через 3 секунды.
     Страница вызывает guard.wrong() на ошибке и guard.right() на верном нажатии. */
  var MASH = { palmKeys: 4, burstWrong: 7, burstMs: 2500, runWrong: 10, lockSec: 3 };
  var MODIFIERS = { ShiftLeft:1, ShiftRight:1, ControlLeft:1, ControlRight:1, AltLeft:1, AltRight:1,
                    MetaLeft:1, MetaRight:1, CapsLock:1, OSLeft:1, OSRight:1 };

  function mashGuard(opts){
    opts = opts || {};
    var held = {}, wrongTimes = [], wrongRun = 0, tripped = false, canGo = false, lockTimer = null;
    var guard = { trips: 0 };

    var box = document.createElement('div');
    box.className = 'mash';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML =
      '<div class="mash-card">' +
        '<div class="mash-ic">✋</div>' +
        '<h2>Стоп! Так не считается</h2>' +
        '<p class="mash-why"></p>' +
        '<p class="mash-tip">Нажимай клавиши по одной и ищи нужную букву спокойно. Точность важнее скорости!</p>' +
        '<button class="btn orange mash-go" disabled></button>' +
      '</div>';
    document.body.appendChild(box);
    var why = box.querySelector('.mash-why'), go = box.querySelector('.mash-go');

    function trip(reason){
      if (tripped) return;
      tripped = true; canGo = false;
      guard.trips++;
      why.textContent = reason === 'palm'
        ? 'Похоже, ты нажал сразу много клавиш — ладонью или кулаком.'
        : 'Слишком много неверных нажатий подряд. Похоже, ты стучишь по всем клавишам.';
      box.classList.add('show');
      if (opts.onTrip) opts.onTrip();
      var left = MASH.lockSec;
      go.disabled = true;
      go.textContent = 'Продолжить можно через ' + left + '…';
      clearInterval(lockTimer);
      lockTimer = setInterval(function(){
        left--;
        if (left > 0){ go.textContent = 'Продолжить можно через ' + left + '…'; return; }
        clearInterval(lockTimer); lockTimer = null;
        canGo = true; go.disabled = false;
        go.textContent = '👍 Понятно, продолжаю (Enter)';
        go.focus({ preventScroll: true });
      }, 1000);
    }
    function release(){
      if (!tripped || !canGo) return;
      tripped = false; held = {}; wrongTimes = []; wrongRun = 0;
      box.classList.remove('show');
      go.blur();
      if (opts.onRelease) opts.onRelease();
    }
    go.addEventListener('click', release);

    // слушаем раньше страницы (window, фаза перехвата), чтобы при остановке гасить клавиши
    window.addEventListener('keydown', function(e){
      if (tripped){
        e.preventDefault(); e.stopImmediatePropagation();
        if (canGo && !e.repeat && (e.key === 'Enter' || e.code === 'Space')) release();
        return;
      }
      if (MODIFIERS[e.code] || !e.code) return;
      var now = Date.now();
      held[e.code] = now;
      var n = 0;
      for (var c in held){ if (now - held[c] > 1200) delete held[c]; else n++; }
      if (n >= MASH.palmKeys){
        e.preventDefault(); e.stopImmediatePropagation();
        trip('palm');
      }
    }, true);
    window.addEventListener('keyup', function(e){ delete held[e.code]; }, true);
    window.addEventListener('blur', function(){ held = {}; });

    guard.wrong = function(){
      var now = Date.now();
      wrongRun++;
      wrongTimes.push(now);
      while (wrongTimes.length && now - wrongTimes[0] > MASH.burstMs) wrongTimes.shift();
      if (wrongTimes.length >= MASH.burstWrong || wrongRun >= MASH.runWrong) trip('wrong');
    };
    guard.right = function(){ wrongRun = 0; };
    guard.active = function(){ return tripped; };
    guard.reset = function(){ guard.trips = 0; wrongTimes = []; wrongRun = 0; };
    return guard;
  }

  window.KIBER = {
    newYear: NEW_YEAR,
    mashGuard: mashGuard,
    reduceMotion: reduceMotion,
    session: session,
    saveSession: saveSession,
    fmtTime: fmtTime,
    pick: pick,
    replay: replay,
    confetti: confetti,
    ruByCode: RU_BY_CODE,
    handOf: handOf,
    buildKeyboard: buildKeyboard
  };
})();
