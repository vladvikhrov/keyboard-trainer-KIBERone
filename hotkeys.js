(function(){
  "use strict";
  var el = function(id){ return document.getElementById(id); };
  var stage = el('stage'), results = el('results'), live = el('live'),
      clock = el('clock'), timeEl = el('time'), feedback = el('feedback');

  var K = window.KIBER, SESSION = K.session, fmt = K.fmtTime;

  /* ---------- рекорд сессии (память вкладки) ---------- */
  function renderRecord(){
    var h = SESSION.hotkeys, line = el('recordLine');
    if (h && h.speed){
      line.className = 'record has';
      line.innerHTML =
        '<span class="rec-cup">🏆</span>' +
        '<span class="rec-label">Рекорд сессии</span>' +
        '<span class="rec-main"><b>' + h.speed + '</b> сочетаний/мин</span>' +
        (h.acc ? '<span class="rec-sub">точность ' + h.acc + '%</span>' : '');
    } else {
      line.className = 'record';
      line.innerHTML = '<span class="rec-cup">🏆</span><span class="rec-empty">Рекорд сессии ещё не установлен — включи режим «Проверка» и покажи скорость!</span>';
    }
  }

  /* ---------- список горячих клавиш (по физическим клавишам, не зависит от раскладки) ----------
     m   — основное сочетание; alt — дополнительные варианты, которые тоже считаются верными.
     level: 1 — базовые, 2 — продвинутые (с Shift/Alt/стрелками/Enter). */
  var HOTKEYS = [
    // базовые
    {name:'Копировать', emoji:'📋', desc:'скопировать выделённое', caps:['Ctrl','C'], m:{ctrl:1,code:'KeyC'}, level:1},
    {name:'Вставить',   emoji:'📥', desc:'вставить скопированное', caps:['Ctrl','V'], m:{ctrl:1,code:'KeyV'}, level:1},
    {name:'Вырезать',   emoji:'✂️', desc:'вырезать выделённое',   caps:['Ctrl','X'], m:{ctrl:1,code:'KeyX'}, level:1},
    {name:'Отменить',   emoji:'↩️', desc:'отменить последнее действие', caps:['Ctrl','Z'], m:{ctrl:1,code:'KeyZ'}, level:1},
    {name:'Вернуть',    emoji:'↪️', desc:'повторить отменённое', caps:['Ctrl','Y'], m:{ctrl:1,code:'KeyY'},
      alt:[{ctrl:1,shift:1,code:'KeyZ'}], level:1},
    {name:'Выделить всё', emoji:'🗂️', desc:'выделить весь текст', caps:['Ctrl','A'], m:{ctrl:1,code:'KeyA'}, level:1},
    {name:'Сохранить',  emoji:'💾', desc:'сохранить файл', caps:['Ctrl','S'], m:{ctrl:1,code:'KeyS'}, level:1},
    {name:'Найти',      emoji:'🔍', desc:'найти на странице', caps:['Ctrl','F'], m:{ctrl:1,code:'KeyF'}, level:1},
    {name:'Жирный',     emoji:'🅱️', desc:'сделать текст жирным', caps:['Ctrl','B'], m:{ctrl:1,code:'KeyB'}, level:1},
    {name:'Курсив',     emoji:'✍️', desc:'сделать текст наклонным', caps:['Ctrl','I'], m:{ctrl:1,code:'KeyI'}, level:1},
    {name:'Подчеркнуть', emoji:'📑', desc:'подчеркнуть текст', caps:['Ctrl','U'], m:{ctrl:1,code:'KeyU'}, level:1},

    // продвинутые: Shift, Alt, Enter, стрелки
    {name:'Вернуть (Redo)', emoji:'🔁', desc:'повторить отменённое действие', caps:['Ctrl','Shift','Z'], m:{ctrl:1,shift:1,code:'KeyZ'},
      alt:[{ctrl:1,code:'KeyY'}], level:2},
    {name:'Выделить слово слева', emoji:'⬅️', desc:'выделить слово слева от курсора', caps:['Ctrl','Shift','←'], m:{ctrl:1,shift:1,code:'ArrowLeft'}, level:2},
    {name:'Выделить слово справа', emoji:'➡️', desc:'выделить слово справа от курсора', caps:['Ctrl','Shift','→'], m:{ctrl:1,shift:1,code:'ArrowRight'}, level:2},
    {name:'Новая строка без отправки', emoji:'↵', desc:'перенос строки в чате вместо отправки', caps:['Shift','Enter'], m:{shift:1,code:'Enter'}, level:2},
    {name:'Строку вниз', emoji:'🔽', desc:'переместить строку вниз (в редакторах кода)', caps:['Alt','↓'], m:{alt:1,code:'ArrowDown'}, level:2},
    {name:'Строку вверх', emoji:'🔼', desc:'переместить строку вверх (в редакторах кода)', caps:['Alt','↑'], m:{alt:1,code:'ArrowUp'}, level:2}
  ];

  var mode = 'learn';           // 'learn' | 'test'
  var pool = HOTKEYS.slice();   // единый набор: базовые + продвинутые вместе
  var curIdx = -1, lastIdx = -1;
  var correct = 0, attempts = 0, streak = 0, bestStreak = 0;
  var TEST_SECONDS = 60;
  var started = false, finished = false, timer = null, left = TEST_SECONDS;
  var lockNext = false;

  /* ---------- отрисовка задания ---------- */
  function renderCaps(hk, hidden){
    var box = el('caps');
    box.innerHTML = '';
    box.className = 'caps' + (hidden ? ' dim' : '');
    if (hidden){
      var q = document.createElement('div');
      q.className = 'caps-hidden';
      q.textContent = 'Сочетание скрыто — вспомни сам!';
      box.appendChild(q);
      return;
    }
    var MODS = { 'Ctrl':1, 'Shift':1, 'Alt':1 };
    for (var i = 0; i < hk.caps.length; i++){
      if (i > 0){ var pl = document.createElement('span'); pl.className = 'plus'; pl.textContent = '+'; box.appendChild(pl); }
      var c = document.createElement('div');
      c.className = 'cap' + (MODS[hk.caps[i]] ? ' mod' : '');
      c.textContent = hk.caps[i];
      box.appendChild(c);
    }
  }

  function nextTask(){
    if (pool.length > 1){
      do { curIdx = Math.floor(Math.random() * pool.length); } while (curIdx === lastIdx);
    } else curIdx = 0;
    lastIdx = curIdx;
    var hk = pool[curIdx];
    el('taskEmoji').textContent = hk.emoji;
    el('taskName').textContent = hk.name;
    el('taskDesc').textContent = hk.desc;
    renderCaps(hk, mode === 'test');
  }

  function setFeedback(text, kind){
    feedback.textContent = text;
    feedback.className = 'feedback' + (kind ? ' ' + kind : '');
  }

  /* ---------- проверка нажатия ---------- */
  function comboOK(e, hk){
    function test(m){
      if (!!m.ctrl !== (e.ctrlKey || e.metaKey)) return false;
      if (!!m.shift !== e.shiftKey) return false;
      if (!!m.alt !== e.altKey) return false;
      return e.code === m.code;
    }
    if (test(hk.m)) return true;
    if (hk.alt){ for (var i = 0; i < hk.alt.length; i++) if (test(hk.alt[i])) return true; }
    return false;
  }
  function capsText(hk){ return hk.caps.join(' + '); }

  // какие физические клавиши считаем «основными» (а не модификаторами) — на них проверяем ответ
  function isMainKey(code){
    if (!code) return false;
    if (code.indexOf('Key') === 0) return true;                 // буквы
    return ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
            'Enter','Tab'].indexOf(code) !== -1;
  }

  function onCorrect(){
    correct++; attempts++; streak++;
    if (streak > bestStreak) bestStreak = streak;
    el('cCorrect').textContent = correct;
    el('cStreak').textContent = streak;
    K.replay(el('cStreak'), 'pop');
    K.replay(stage, 'flash-ok');
    setFeedback(K.pick(['Верно!','Отлично!','Точно!','Супер!','Так держать!']), 'ok');
    lockNext = true;
    setTimeout(function(){ lockNext = false; if (!finished){ nextTask(); setFeedback('Нажми сочетание клавиш', ''); } }, 550);
  }

  function onWrong(hk){
    attempts++; streak = 0;
    el('cStreak').textContent = streak;
    setFeedback('Почти! Нужно ' + capsText(hk), 'bad');
    // подсказать: показать сочетание на секунду даже в режиме проверки
    renderCaps(hk, false);
    if (mode === 'test') setTimeout(function(){ if (!finished && pool[curIdx] === hk) renderCaps(hk, true); }, 900);
    K.replay(stage, 'shake');
  }

  document.addEventListener('keydown', function(e){
    if (finished || lockNext) return;
    var k = e.key;

    // одиночные модификаторы — ждём вторую клавишу; смена раскладки (Alt + Shift) не считается ответом
    if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'OS') return;

    if (!isMainKey(e.code)) return;                   // реагируем только на «основные» клавиши
    // гасим действия браузера (сохранить, найти, выделить всё, Tab-уход фокуса и т.п.)
    if (e.ctrlKey || e.metaKey || e.altKey || e.code === 'Tab') e.preventDefault();

    if (mode === 'test' && !started){ started = true; startTimer(); }

    var hk = pool[curIdx];
    if (comboOK(e, hk)) onCorrect(); else onWrong(hk);
  });

  /* ---------- таймер режима «Проверка» ---------- */
  function startTimer(){
    timer = setInterval(function(){
      left--;
      if (left < 0) left = 0;
      timeEl.textContent = fmt(left);
      if (left <= 5) clock.classList.add('low');
      if (left <= 0) finish();
    }, 1000);
  }

  function finish(){
    clearInterval(timer); timer = null;
    finished = true;
    var minutes = TEST_SECONDS / 60;
    var speed = Math.round(correct / minutes);        // сочетаний в минуту
    var acc = attempts ? Math.round(correct / attempts * 100) : 100;
    el('rSpeed').textContent = speed;
    el('rAcc').textContent = acc + '%';

    var rank;
    if (speed < 8) rank = 'Хорошее начало! Загляни в шпаргалку и попробуй ещё раз.';
    else if (speed < 16) rank = 'Уверенно! Горячие клавиши начинают запоминаться.';
    else if (speed < 25) rank = 'Здорово! Ты работаешь быстро, как настоящий пользователь.';
    else rank = 'Вот это скорость! Пальцы сами находят нужные клавиши.';
    if (bestStreak >= 8) rank += ' Лучшая серия: ' + bestStreak + ' подряд.';
    el('rank').textContent = rank;

    stage.classList.add('finished');
    results.classList.add('show');

    // рекорд сессии по скорости; при равной скорости учитываем точность
    var prev = SESSION.hotkeys || { speed: 0, acc: 0 };
    var isRecord = speed > (prev.speed || 0) || (speed === (prev.speed || 0) && acc > (prev.acc || 0) && speed > 0);
    if (isRecord){ SESSION.hotkeys = { speed: speed, acc: acc }; K.saveSession(); }
    renderRecord();

    var note = el('recNote');
    if (isRecord && prev.speed) note.textContent = 'Новый рекорд! Прошлый был ' + prev.speed + ' сочетаний в минуту.';
    else if (isRecord) note.textContent = 'Первый результат сессии — так держать!';
    else note.textContent = 'Рекорд сессии: ' + prev.speed + ' сочетаний в минуту. Побей его!';

    // конфетти при каждом завершении; крупный залп за рекорд/хороший результат
    var big = (isRecord && prev.speed > 0) || speed >= 16;
    K.confetti(big);
    K.replay(results, 'burst');
  }

  /* ---------- смена режима / сброс ---------- */
  function reset(){
    clearInterval(timer); timer = null;
    started = false; finished = false; lockNext = false;
    correct = 0; attempts = 0; streak = 0; bestStreak = 0;
    lastIdx = -1;
    left = TEST_SECONDS;
    el('cCorrect').textContent = '0';
    el('cStreak').textContent = '0';
    timeEl.textContent = fmt(left);
    clock.classList.remove('low');
    clock.className = 'clock' + (mode === 'test' ? '' : ' hidden');
    stage.classList.remove('finished');
    results.classList.remove('show');
    setFeedback(mode === 'test' ? 'Нажми сочетание — таймер пойдёт сразу' : 'Нажми сочетание клавиш', '');
    nextTask();
  }

  function setMode(next){
    mode = next;
    el('mLearn').setAttribute('aria-pressed', next === 'learn' ? 'true' : 'false');
    el('mTest').setAttribute('aria-pressed', next === 'test' ? 'true' : 'false');
    reset();
  }
  el('mLearn').addEventListener('click', function(){ this.blur(); setMode('learn'); });
  el('mTest').addEventListener('click', function(){ this.blur(); setMode('test'); });
  el('skip').addEventListener('click', function(){
    this.blur();
    if (!finished){ streak = 0; el('cStreak').textContent = '0'; nextTask(); setFeedback('Новое задание', ''); }
  });
  el('restart').addEventListener('click', function(){ this.blur(); reset(); });

  /* ---------- шпаргалка ---------- */
  (function buildCheat(){
    var g = el('cheatGrid');
    for (var i = 0; i < HOTKEYS.length; i++){
      var hk = HOTKEYS[i];
      var it = document.createElement('div');
      it.className = 'cheat-item';
      var star = hk.level === 2 ? ' <span class="star">★</span>' : '';
      it.innerHTML = '<span class="ce">' + hk.emoji + '</span><div><div class="cn">' +
        hk.name + star + '</div><div class="ck">' + hk.caps.join(' + ') + '</div></div>';
      g.appendChild(it);
    }
  })();
  el('cheatToggle').addEventListener('click', function(){
    var on = el('cheatGrid').classList.toggle('show');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.textContent = on ? 'Скрыть шпаргалку' : 'Показать шпаргалку';
    this.blur();
  });

  renderRecord();
  reset();
})();
