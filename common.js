/* ========================================================================
   KIBERONE — общий код обоих тренажёров: рекорд сессии, конфетти,
   форматирование времени, перезапуск анимаций.
   Подключается ДО typing.js / hotkeys.js и создаёт window.KIBER.
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

  window.KIBER = {
    reduceMotion: reduceMotion,
    session: session,
    saveSession: saveSession,
    fmtTime: fmtTime,
    pick: pick,
    replay: replay,
    confetti: confetti
  };
})();
