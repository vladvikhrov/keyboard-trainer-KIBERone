(function(){
  "use strict";

  var el = function(id){ return document.getElementById(id); };
  var textBox = el('text'), capture = el('capture'), stage = el('stage'),
      tapme = el('tapme'), results = el('results'), clock = el('clock'),
      timeEl = el('time'), bar = el('bar'), barFill = el('barFill'),
      toast = el('toast'), streakBox = el('streak'), streakNum = el('streakNum'),
      keyboard = el('keyboard');

  var K = window.KIBER, SESSION = K.session, reduceMotion = K.reduceMotion,
      fmtTime = K.fmtTime, pick = K.pick;

  var streak = 0, bestStreak = 0;

  function renderRecord(){
    var line = el('recordLine');
    if (!line) return;
    var t = SESSION.typing;
    if (t && t.cpm){
      line.innerHTML = '🏆 Рекорд этой сессии: <b>' + t.cpm + '</b> зн/мин · точность <b>' +
        t.acc + '%</b>' + (t.streak ? ' · серия <b>' + t.streak + '</b>' : '');
    } else {
      line.textContent = '🏆 Рекорд этой сессии ещё не установлен — покажи, на что способен!';
    }
  }

  var DURATIONS = [30, 60, 120, 300];
  var DUR_LABELS = ['30 секунд', '1 минута', '2 минуты', '5 минут'];
  var durIdx = 0;

  /* символы, которых нет на обычной клавиатуре: принимаем замену */
  var ALIASES = {
    '\u2014': ['-', '\u2013'],            // длинное тире
    '\u2013': ['-', '\u2014'],            // среднее тире
    '\u00AB': ['"'], '\u00BB': ['"'],     // кавычки-ёлочки
    '\u201E': ['"'], '\u201C': ['"'], '\u201D': ['"'],
    '\u2026': ['.'],                      // многоточие
    '\u00A0': [' ']                       // неразрывный пробел
  };
  function matches(typed, expected){
    if (typed === expected) return true;
    var alt = ALIASES[expected];
    if (!alt) return false;
    for (var i = 0; i < alt.length; i++) if (alt[i] === typed) return true;
    return false;
  }

  var LIB = [];                 // все тексты одним набором, вперемешку
  var chars = [], spans = [], idx = 0;
  var correct = 0, errors = 0, wrongNow = false;
  var started = false, finished = false, timer = null, left = 30;
  var lastPicked = -1;

  /* ---------- всплывающие сообщения ---------- */
  var START_MSG = ['Поехали!', 'Вперёд!', 'Ну-ка, покажи класс!', 'Готовься... старт!', 'Давай, ты сможешь!'];
  var STREAK_MSG = {
    10: 'Хорошо идёшь!',
    20: 'Уже 20 без ошибок!',
    30: 'Огонь! Так держать!',
    50: 'Ничего себе, полсотни подряд!',
    75: 'Ты в ударе!',
    100: 'Сотня без единой ошибки! Космос!'
  };
  var toastTimer = null;
  function showToast(text, kind){
    if (!text) return;
    toast.textContent = text;
    toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toast.className = 'toast' + (kind ? ' ' + kind : ''); }, 1400);
  }

  function bumpStreak(){
    streak++;
    if (streak > bestStreak) bestStreak = streak;
    if (streak >= 5){
      streakBox.hidden = false;
      streakNum.textContent = streak;
      streakBox.classList.toggle('hot', streak >= 30);
      K.replay(streakNum, 'pop');
    }
    if (STREAK_MSG[streak]) showToast(STREAK_MSG[streak], 'teal');
  }
  function resetStreak(){
    streak = 0;
    streakBox.hidden = true;
    streakBox.classList.remove('hot');
  }

  /* ---------- клавиатура: раскладка и руки — в common.js ---------- */
  var handOf = K.handOf;
  var keyMap = K.buildKeyboard(keyboard); // символ -> элемент клавиши
  var hlKey = null;
  function highlightKey(ch){
    if (hlKey){ hlKey.className = hlKey.className.replace(/ hl.*/, ''); hlKey = null; }
    if (keyboard.className.indexOf('show') === -1) return;
    if (!ch) return;
    var low = ch.toLowerCase();
    var target = keyMap[low];
    if (!target) return;
    var hand = handOf(low);
    target.className = 'key' + (low === ' ' ? ' space' : '') + ' hl ' + hand;
    hlKey = target;
  }

  /* ---------- разбор файла с текстами ---------- */
  /* Один абзац — один текст. Строки с # (заголовки уровней и комментарии)
     пропускаются: все тексты идут одним набором. */
  function parseTexts(raw){
    var out = [];
    var blocks = String(raw).replace(/\r/g, '').split(/\n[ \t]*\n/);
    for (var i = 0; i < blocks.length; i++){
      var lines = blocks[i].split('\n'), buf = [];
      for (var j = 0; j < lines.length; j++){
        var t = lines[j].trim();
        if (!t) continue;
        if (t.charAt(0) === '#'){
          if (buf.length){ out.push(buf.join(' ')); buf = []; }
          continue;
        }
        buf.push(t);
      }
      if (buf.length) out.push(buf.join(' '));
    }
    return out;
  }

  function loadLibrary(raw, label){
    var parsed = parseTexts(raw);
    if (!parsed.length) return false;
    LIB = parsed;
    lastPicked = -1;
    el('fileInfo').textContent = label + ' Текстов в наборе: ' + LIB.length + '.';
    return true;
  }

  loadLibrary(el('defaultTexts').textContent, 'Встроенный набор текстов.');

  function pickText(){
    if (!LIB.length) return 'Список текстов пуст.';
    if (LIB.length === 1) return LIB[0];
    var n;
    do { n = Math.floor(Math.random() * LIB.length); } while (n === lastPicked);
    lastPicked = n;
    return LIB[n];
  }

  /* ---------- отрисовка ---------- */
  function renderText(str){
    chars = String(str).split('');
    spans = [];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < chars.length; i++){
      var s = document.createElement('span');
      s.textContent = chars[i];
      s.className = 'todo' + (chars[i] === ' ' ? ' space' : '');
      frag.appendChild(s);
      spans.push(s);
    }
    textBox.innerHTML = '';
    textBox.appendChild(frag);
    idx = 0; wrongNow = false;
    textBox.scrollTop = 0;
    markCurrent();
  }

  function markCurrent(){
    if (idx >= spans.length){ highlightKey(null); return; }
    var s = spans[idx];
    s.className = 'cur' + (chars[idx] === ' ' ? ' space' : '') + (wrongNow ? ' wrong' : '');
    var top = s.offsetTop - textBox.offsetTop, h = textBox.clientHeight;
    if (top - textBox.scrollTop > h - 70 || top < textBox.scrollTop){
      textBox.scrollTop = Math.max(0, top - h / 2);
    }
    highlightKey(chars[idx]);
  }

  /* ---------- игра ---------- */
  function nextText(){ renderText(pickText()); }

  function resetAll(newText){
    clearInterval(timer); timer = null;
    started = false; finished = false;
    correct = 0; errors = 0;
    resetStreak();
    left = DURATIONS[durIdx];
    timeEl.textContent = fmtTime(left);
    clock.classList.remove('low'); bar.classList.remove('low');
    barFill.style.width = '100%';
    stage.classList.remove('finished');
    results.classList.remove('show');
    if (newText) nextText(); else renderText(chars.join(''));
    focusInput();
  }

  function startTimer(){
    started = true;
    showToast(pick(START_MSG), 'yellow');
    timer = setInterval(function(){
      left--;
      if (left < 0) left = 0;
      timeEl.textContent = fmtTime(left);
      barFill.style.width = (left / DURATIONS[durIdx] * 100) + '%';
      if (left <= 5){ clock.classList.add('low'); bar.classList.add('low'); }
      if (left <= 0) finish();
    }, 1000);
  }

  function handleChar(ch){
    if (finished) return;
    if (idx >= chars.length) nextText();
    if (!started) startTimer();

    var expected = chars[idx];
    if (matches(ch, expected)){
      correct++;
      bumpStreak();
      spans[idx].className = 'done' + (expected === ' ' ? ' space' : '');
      idx++;
      wrongNow = false;
      if (idx >= chars.length){ nextText(); }   // текст закончился — берём новый, таймер идёт дальше
      else markCurrent();
    } else {
      errors++;
      if (streak >= 15) showToast('Ничего, серия была отличная!', 'pink');
      resetStreak();
      wrongNow = true;
      markCurrent();
      K.replay(textBox, 'shake');
    }
  }

  function finish(){
    clearInterval(timer); timer = null;
    finished = true;
    var minutes = DURATIONS[durIdx] / 60;
    var cpm = Math.round(correct / minutes);
    var total = correct + errors;
    var acc = total ? Math.round(correct / total * 100) : 100;

    el('cpm').textContent = cpm;
    el('acc').textContent = acc + '%';

    var rank;
    if (cpm < 60) rank = 'Старт взят! Держи ритм и не смотри на клавиши.';
    else if (cpm < 120) rank = 'Уверенный набор. Следующая цель — 150 знаков в минуту.';
    else if (cpm < 180) rank = 'Отличная скорость! Ты печатаешь быстрее большинства ребят.';
    else if (cpm < 250) rank = 'Мастер клавиатуры. Пальцы работают как у разработчика.';
    else rank = 'Легенда кибершколы! Такой скорости можно позавидовать.';
    if (acc >= 98) rank += ' И почти без ошибок — блестящая точность!';
    else if (acc < 90) rank += ' Точность пока проседает — попробуй печатать чуть медленнее и ровнее.';
    if (bestStreak >= 20) rank += ' Лучшая серия без ошибок: ' + bestStreak + ' знаков подряд.';

    el('rank').textContent = rank;
    // заголовок зависит от результата
    if (acc >= 90 && cpm >= 100) el('resTitle').textContent = 'Отличный результат!';
    else if (acc >= 95) el('resTitle').textContent = 'Очень аккуратно!';
    else el('resTitle').textContent = 'Время вышло!';

    stage.classList.add('finished');
    results.classList.add('show');
    tapme.classList.add('hidden');
    highlightKey(null);

    // рекорд сессии
    var prev = SESSION.typing || { cpm: 0, acc: 0, streak: 0 };
    var isRecord = cpm > (prev.cpm || 0);
    if (isRecord){
      SESSION.typing = { cpm: cpm, acc: acc, streak: Math.max(bestStreak, prev.streak || 0) };
      K.saveSession();
    } else if (bestStreak > (prev.streak || 0)){
      prev.streak = bestStreak; SESSION.typing = prev; K.saveSession();
    }
    renderRecord();

    var note = el('recNote');
    if (isRecord && prev.cpm) note.textContent = 'Новый рекорд! Прошлый был ' + prev.cpm + ' зн/мин.';
    else if (isRecord) note.textContent = 'Первый результат сессии — так держать!';
    else note.textContent = 'Рекорд сессии: ' + prev.cpm + ' зн/мин. Побей его!';

    // конфетти при каждом завершении: крупный залп за рекорд/хороший результат
    var big = (isRecord && prev.cpm > 0) || (acc >= 90 && cpm >= 100);
    K.confetti(big);
    // вспышка-«всплеск» на карточке результатов
    K.replay(results, 'burst');
  }

  /* ---------- ввод ---------- */
  function focusInput(){
    if (finished) return;
    capture.focus({ preventScroll: true });
  }

  capture.addEventListener('focus', function(){ tapme.classList.add('hidden'); });
  capture.addEventListener('blur', function(){ if (!finished) tapme.classList.remove('hidden'); });
  stage.addEventListener('mousedown', function(e){
    if (finished) return;
    e.preventDefault(); focusInput();
  });
  stage.addEventListener('touchstart', function(){ focusInput(); }, { passive: true });

  capture.addEventListener('keydown', function(e){
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace' || e.key === 'Tab'){ e.preventDefault(); return; }
    if (e.key === 'Enter'){ e.preventDefault(); handleChar(' '); return; }
    if (e.key && e.key.length === 1){
      e.preventDefault();
      handleChar(e.key);
    }
  });
  // для экранных клавиатур на планшетах и телефонах
  capture.addEventListener('input', function(){
    var v = capture.value;
    capture.value = '';
    for (var i = 0; i < v.length; i++) handleChar(v.charAt(i));
  });

  /* ---------- управление ---------- */
  renderRecord();
  el('kbToggle').addEventListener('click', function(){
    var on = keyboard.classList.toggle('show');
    keyboard.setAttribute('aria-hidden', on ? 'false' : 'true');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.textContent = on ? 'Скрыть подсказку' : 'Показать подсказку';
    el('kbhint').hidden = !on;
    if (on) highlightKey(chars[idx]);
    focusInput();
  });

  el('again').addEventListener('click', function(){ resetAll(false); });
  el('newText').addEventListener('click', function(){ resetAll(true); });
  el('secs').addEventListener('click', function(){
    durIdx = (durIdx + 1) % DURATIONS.length;
    this.textContent = 'Время: ' + DUR_LABELS[durIdx];
    resetAll(false);
  });

  el('file').addEventListener('change', function(){
    var f = this.files && this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function(){
      var ok = loadLibrary(reader.result, 'Загружен файл «' + f.name + '».');
      if (!ok){ el('fileInfo').textContent = 'В файле не нашлось текстов. Проверь, что абзацы разделены пустой строкой.'; return; }
      resetAll(true);
    };
    reader.readAsText(f, 'utf-8');
  });

  document.addEventListener('keydown', function(e){
    if (document.activeElement !== capture && e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !finished){
      focusInput();
    }
  });

  resetAll(true);

  /* Если рядом с html лежит texts.txt и страница открыта с сайта (GitHub Pages,
     локальный сервер), тексты берутся из него автоматически.
     При открытии файла напрямую с диска (file://) браузер это запрещает —
     тогда работает встроенный набор, а свой файл можно подключить кнопкой. */
  try {
    fetch('texts.txt', { cache: 'no-store' })
      .then(function(r){ return r.ok ? r.text() : null; })
      .then(function(t){
        if (!t || !t.trim()) return;
        if (loadLibrary(t, 'Тексты взяты из файла texts.txt рядом со страницей.') && !started) resetAll(true);
      })
      .catch(function(){ /* офлайн-режим, остаётся встроенный набор */ });
  } catch (e) {}
})();
