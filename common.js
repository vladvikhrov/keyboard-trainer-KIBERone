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

  window.KIBER = {
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
