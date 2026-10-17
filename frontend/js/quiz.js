/**
 * «Рядом» – анкета подбора психолога (quiz.html).
 * Шесть вопросов по одному на экране: для кого, самочувствие, имя и возраст,
 * запрос, каким должен быть психолог, время. О деньгах не спрашиваем.
 * После каждого ответа считаем, сколько психологов подходит, в конце показываем
 * трёх лучших и объясняем почему. Имя из анкеты подставляется в регистрацию (auth.js).
 * Данные – демо из data.js. Позже подбор будет делать сервер (NodeJS):
 *   POST /api/matching  { format, mood, name, myage, topics, gender, age, method, time, soon }
 */
const QUIZ_KEY = 'ryadom-quiz';   // ответы сохраняются только в браузере пользователя
const STEPS = ['format', 'mood', 'about', 'topics', 'who', 'when'];

/* Подходы простыми словами – показываются под выбранным вариантом */
const METHOD_NOTES = {
  'КПТ': 'Разбираетесь, какие мысли запускают тревогу или плохое настроение, и пробуете новые способы реагировать. Подходит, если хочется конкретных шагов.',
  'Гештальт': 'Внимание к тому, что вы чувствуете здесь и сейчас. Помогает в отношениях и историях, которые «не отпускают».',
  'ACT': 'Учитесь не воевать с тяжёлыми чувствами, а жить с ними и делать то, что для вас важно.',
  'Психоанализ': 'Ищете, откуда в прошлом тянутся нынешние сценарии. Неспешная работа на долгий срок.',
  'Схема-терапия': 'Работа с глубокими убеждениями о себе, которые сложились в детстве и мешают сейчас.',
  'Системная семейная': 'Смотрит на семью или пару целиком: кто и как влияет друг на друга.',
  'EMDR': 'Метод для работы с травмой и тяжёлыми воспоминаниями.',
};
const FORMAT_LABELS = { 'Индивидуальная': 'для себя', 'Парная': 'для пары', 'С ребёнком': 'для ребёнка' };
const TIME_LABELS = { morning: 'утро', day: 'день', evening: 'вечер' };
/* Вопрос о самочувствии звучит по-разному: для себя, для пары, для ребёнка */
const MOOD_TITLES = {
  '': 'Как вы&nbsp;себя чувствуете последнее время?',
  'Индивидуальная': 'Как вы&nbsp;себя чувствуете последнее время?',
  'Парная': 'Как вы&nbsp;себя чувствуете в&nbsp;отношениях последнее время?',
  'С ребёнком': 'Как ребёнок себя чувствует последнее время?',
};
/* Время дня: с какой по какую минуту суток */
const TIME_RANGES = { morning: [0, 720], day: [720, 1020], evening: [1020, 1440] };

document.addEventListener('DOMContentLoaded', () => {
  const screens = {
    start: document.querySelector('[data-screen="start"]'),
    steps: document.querySelector('[data-screen="steps"]'),
    result: document.querySelector('[data-screen="result"]'),
  };
  const form = screens.steps;
  const stepEls = Object.fromEntries([...form.querySelectorAll('.qstep')].map((el) => [el.dataset.step, el]));
  const dots = [...form.querySelectorAll('.qbar__dots li')];
  const backBtn = form.querySelector('[data-back]');
  const nextBtn = form.querySelector('[data-next]');
  const count = form.querySelector('.qcount');
  const countFaces = count.querySelector('.qcount__faces');
  const countText = count.querySelector('.qcount__text');
  const methodNote = form.querySelector('[data-method-note]');
  const ageField = form.querySelector('[data-age-field]');
  const ageLabel = form.querySelector('[data-age-label]');
  const ageError = form.querySelector('[data-age-error]');
  const ageNote = form.querySelector('[data-age-note]');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let step = 'format';        // текущий шаг (или 'sos' – пауза после «тяжело»)
  let lastIds = '';           // какие лица сейчас в счётчике – чтобы не перерисовывать зря
  let autoTimer = null;

  /* ---------- Мелкие помощники ---------- */
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };
  const dayText = (k) => (k === 0 ? 'сегодня' : k === 1 ? 'завтра'
    : demoDateAt(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }));
  const inTimes = (t, times) => !times.length || times.some((r) => {
    const m = demoMins(t);
    return m >= TIME_RANGES[r][0] && m < TIME_RANGES[r][1];
  });
  const lower = (list) => list.map((t) => t.toLowerCase()).join(', ');
  /** Имя вводит пользователь – экранируем, прежде чем вставлять в HTML */
  const esc = (str) => str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- Ответы из формы ---------- */
  const answers = () => {
    const fd = new FormData(form);
    return {
      format: fd.get('format') || '',
      mood: fd.get('mood') || '',
      name: (fd.get('name') || '').trim(),
      myage: (fd.get('myage') || '').trim(),
      topics: fd.getAll('topic').filter(Boolean),
      gender: fd.get('gender') || '',
      age: fd.get('age') || '',
      method: fd.get('method') || '',
      time: fd.getAll('time'),
      soon: fd.get('soon') === 'on',
    };
  };

  /* ---------- Подбор ---------- */
  /** Ближайшее свободное окно с учётом выбранного времени дня: { k – через сколько дней, time } */
  const nextFree = (p, times) => {
    for (let k = 0; k < 30; k += 1) {
      const free = demoSlotsOn(p, k).filter((t) => inTimes(t, times));
      if (free.length) return { k, time: free[0] };
    }
    return { k: 99, time: '' };
  };

  /** Какие условия психолог НЕ выполняет (пустой список – подходит полностью) */
  const misses = (p, a) => {
    const out = [];
    if (a.format && !p.formats.includes(a.format)) out.push('format');
    if (a.topics.length && !p.topics.some((t) => a.topics.includes(t))) out.push('topics');
    if (a.gender && p.gender !== a.gender) out.push('gender');
    if (a.age === 'young' && p.age >= 35) out.push('age');
    if (a.age === 'older' && p.age < 35) out.push('age');
    if (a.method && !p.methods.includes(a.method)) out.push('method');
    if (a.time.length && !p.slots.some((t) => inTimes(t, a.time))) out.push('time');
    if (a.soon && nextFree(p, a.time).k > 2) out.push('soon');
    return out;
  };

  /** Насколько хорошо подходит: совпавшие темы важнее всего, потом подход, рейтинг и близость окна */
  const score = (p, a) => {
    const hits = p.topics.filter((t) => a.topics.includes(t)).length;
    const soon = Math.max(0, 4 - nextFree(p, a.time).k);
    return hits * 10 + (a.method && p.methods.includes(a.method) ? 4 : 0) + p.rating + soon * 0.5;
  };

  const matches = (a) => PSYCHOLOGISTS.filter((p) => !misses(p, a).length)
    .sort((x, y) => score(y, a) - score(x, a));

  /** Если точных совпадений нет – ближайшие: формат и тема обязательны, остальное можно уступить */
  const closest = (a) => PSYCHOLOGISTS
    .map((p) => ({ p, miss: misses(p, a) }))
    .filter(({ miss }) => !miss.includes('format') && !miss.includes('topics'))
    .sort((x, y) => x.miss.length - y.miss.length || score(y.p, a) - score(x.p, a));

  /* ---------- Счётчик «Подходят N психологов» ---------- */
  const renderCount = () => {
    const list = matches(answers());
    const n = list.length;
    const ids = list.slice(0, 3).map((p) => p.id).join(',');
    if (ids !== lastIds) {
      countFaces.innerHTML = list.slice(0, 3)
        .map((p) => `<img src="assets/img/psychologists/${p.photo}-sq.webp" alt="">`).join('');
      lastIds = ids;
    }
    count.classList.toggle('is-zero', n === 0);
    countText.innerHTML = n
      ? `${n % 10 === 1 && n % 100 !== 11 ? 'Подходит' : 'Подходят'} <b>${n}&nbsp;${plural(n, 'психолог', 'психолога', 'психологов')}</b>`
      : 'Под все условия пока никто не&nbsp;подходит – попробуйте смягчить одно из&nbsp;них';
    if (!calm) {
      count.classList.remove('is-bump');
      void count.offsetWidth;                 // перезапуск анимации
      count.classList.add('is-bump');
    }
  };

  /* ---------- Кнопка «Дальше» меняет подпись по ситуации ---------- */
  const nextLabel = () => {
    const a = answers();
    if (step === 'sos') return 'Продолжить подбор';
    if (step === 'when') return 'Показать психологов';
    if (step === 'mood') return a.mood ? 'Дальше' : 'Пропустить';
    if (step === 'about') return a.name || a.myage ? 'Дальше' : 'Пропустить';
    if (step === 'topics') return form.querySelector('[name="topic"]:checked') ? 'Дальше' : 'Пропустить';
    if (step === 'format') return a.format ? 'Дальше' : 'Пропустить';
    return 'Дальше';
  };

  /* ---------- Показ шага ---------- */
  const showStep = (name, back = false) => {
    clearTimeout(autoTimer);
    step = name;
    Object.entries(stepEls).forEach(([key, el]) => {
      el.hidden = key !== name;
      el.classList.remove('is-in', 'is-back');
    });
    adaptTexts();
    const el = stepEls[name];
    void el.offsetWidth;
    el.classList.add('is-in');
    if (back) el.classList.add('is-back');

    // Прогресс: пауза «sos» считается частью шага о самочувствии
    const i = STEPS.indexOf(name === 'sos' ? 'mood' : name);
    dots.forEach((d, j) => {
      d.classList.toggle('is-done', j < i);
      d.classList.toggle('is-current', j === i);
    });
    count.hidden = i < 1 || name === 'sos';
    if (!count.hidden) renderCount();
    nextBtn.textContent = nextLabel();

    // Фокус на вопрос – для клавиатуры и экранных читалок; на телефоне – прокрутка к началу карточки
    el.querySelector('.qstep__title').focus({ preventScroll: true });
    if (form.getBoundingClientRect().top < 0) form.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    save();
  };

  const showScreen = (name) => {
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    document.body.classList.toggle('is-result', name === 'result');   // на результате рисунки фона убираем – мешают читать
    window.scrollTo({ top: 0 });
  };

  const goNext = () => {
    if (step === 'about' && !checkAge()) return;
    if (step === 'mood' && answers().mood === 'crisis') { showStep('sos'); return; }
    if (step === 'sos') { showStep('about'); return; }
    if (step === 'when') { showResult(); return; }
    showStep(STEPS[STEPS.indexOf(step) + 1]);
  };

  const goBack = () => {
    if (step === 'format') { showScreen('start'); return; }
    if (step === 'sos') { showStep('mood', true); return; }
    if (step === 'about' && answers().mood === 'crisis') { showStep('sos', true); return; }
    showStep(STEPS[STEPS.indexOf(step) - 1], true);
  };

  /** Тексты вопросов под формат: «как ребёнок себя чувствует», «сколько лет ребёнку» */
  const adaptTexts = () => {
    const { format } = answers();
    stepEls.mood.querySelector('.qstep__title').innerHTML = MOOD_TITLES[format];
    ageLabel.textContent = format === 'С ребёнком' ? 'Сколько лет ребёнку' : 'Ваш возраст';
  };

  /** Возраст необязателен, но если введён – это число в разумных пределах.
      Подсказка, если клиенту нет 18: со взрослыми психологами – только через анкету «Для ребёнка». */
  const AGE_LIMITS = { child: [3, 17], adult: [14, 99] };
  const checkAge = (soft = false) => {
    const { myage, format } = answers();
    const child = format === 'С ребёнком';
    const [min, max] = child ? AGE_LIMITS.child : AGE_LIMITS.adult;
    const n = Number(myage);
    const bad = myage !== '' && (!/^\d+$/.test(myage) || n < min || n > max);
    ageNote.textContent = !bad && !child && myage !== '' && n < 18
      ? 'На платформе работают со взрослыми. Если вам нет 18, попросите кого-то из родителей пройти анкету «Для ребёнка» – так психолог сможет начать работу.'
      : '';
    if (soft) { if (!bad) ageField.classList.remove('is-error'); return !bad; }
    ageField.classList.toggle('is-error', bad);
    ageError.textContent = bad ? `Укажите возраст числом от ${min} до ${max} – или оставьте поле пустым` : '';
    if (bad) ageField.querySelector('input').focus();
    return !bad;
  };

  nextBtn.addEventListener('click', goNext);
  backBtn.addEventListener('click', goBack);
  form.addEventListener('submit', (e) => { e.preventDefault(); goNext(); });

  /* ---------- Реакция на ответы ---------- */
  form.addEventListener('input', (e) => {
    if (e.target.type !== 'text') return;
    if (e.target.name === 'myage') {
      e.target.value = e.target.value.replace(/\D/g, '');   // в поле возраста – только цифры
      checkAge(true);
    }
    nextBtn.textContent = nextLabel();
    save();
  });

  form.addEventListener('change', (e) => {
    const input = e.target;

    // «Пока не знаю» и конкретные темы взаимно исключают друг друга
    if (input.name === 'topic') {
      if (input.dataset.none !== undefined && input.checked) {
        form.querySelectorAll('[name="topic"]:not([data-none])').forEach((el) => { el.checked = false; });
      } else if (input.checked) {
        form.querySelector('[name="topic"][data-none]').checked = false;
      }
    }
    if (input.type === 'text') return;   // текстовые поля обработаны в 'input'
    if (input.name === 'method') methodNote.innerHTML = noteFor(input.value);

    nextBtn.textContent = nextLabel();
    if (!count.hidden) renderCount();
    save();

    // На вопросах с одним ответом переходим дальше сами – небольшая пауза, чтобы был виден выбор
    if ((input.name === 'mood' || input.name === 'format') && input.checked) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(goNext, calm ? 150 : 420);
    }
  });

  const noteFor = (m) => (m ? `<b>${m === 'Системная семейная' ? 'Семейная терапия' : m}.</b> ${METHOD_NOTES[m]}` : '');

  /* ---------- Результат ---------- */
  const reasons = (p, a, miss) => {
    const out = [];
    const ok = (html) => out.push(`<li><svg><use href="#i-check"/></svg><span>${html}</span></li>`);
    const warn = (html) => out.push(`<li class="is-warn"><svg><use href="#i-clock"/></svg><span>${html}</span></li>`);

    const hits = p.topics.filter((t) => a.topics.includes(t));
    if (hits.length) ok(`Работает с&nbsp;темами: <b>${lower(hits)}</b>`);
    else ok(`Чаще всего помогает: ${lower(p.topics.slice(0, 2))}`);

    if (a.method && !miss.includes('method')) ok(`Подход – <b>${a.method}</b>, как вы&nbsp;хотели`);
    else ok(`Подход: ${p.methods.join(', ')}`);

    if (a.format === 'Парная') ok('Работает с&nbsp;парами');
    if (a.format === 'С ребёнком') ok('Работает с&nbsp;детьми и&nbsp;родителями');

    const free = nextFree(p, miss.includes('time') ? [] : a.time);
    if (miss.includes('soon') || miss.includes('time')) warn(`Ближайшее окно – ${dayText(free.k)} в&nbsp;${free.time}`);
    else ok(`Свободное окно – <b>${dayText(free.k)} в&nbsp;${free.time}</b>`);

    if (miss.includes('gender') || miss.includes('age')) warn(`${p.gender === 'f' ? 'Женщина' : 'Мужчина'}, ${p.age}&nbsp;${plural(p.age, 'год', 'года', 'лет')}`);
    else if (out.length < 4) ok('Диплом и&nbsp;документы проверены модератором');
    return out.slice(0, 4).join('');
  };

  const card = (p, a, miss, i) => `
    <article class="qpsy" style="animation-delay:${i * 90}ms">
      ${miss.length ? '<span class="qpsy__best qpsy__best--near">Близкий вариант</span>'
        : i === 0 ? '<span class="qpsy__best">Лучше всего подходит</span>' : ''}
      <div class="qpsy__top">
        <img src="assets/img/psychologists/${p.photo}-sq.webp" alt="">
        <div>
          <span class="qpsy__name">${p.name}</span>
          <span class="qpsy__meta">${p.role} · опыт ${p.exp}&nbsp;${plural(p.exp, 'год', 'года', 'лет')}</span>
        </div>
        <span class="qpsy__rating"><svg><use href="#i-star"/></svg>${p.rating.toFixed(1).replace('.', ',')}</span>
      </div>
      <ul class="qpsy__why">${reasons(p, a, miss)}</ul>
      <div class="qpsy__foot">
        <span class="qpsy__price">${p.price}&nbsp;BYN <small>/ 50&nbsp;мин</small></span>
        <a href="psychologist.html?id=${p.id}" class="btn btn--primary btn--sm">Профиль и&nbsp;запись</a>
      </div>
    </article>`;

  /** Ваш запрос – коротко, «таблетками» */
  const requestTags = (a) => {
    const t = [...a.topics.map((x) => x.toLowerCase())];
    if (a.format) t.push(FORMAT_LABELS[a.format]);
    if (a.gender) t.push(a.gender === 'f' ? 'психолог-женщина' : 'психолог-мужчина');
    if (a.age) t.push(a.age === 'young' ? 'до 35 лет' : 'старше 35');
    if (a.method) t.push(a.method);
    if (a.time.length) t.push(a.time.map((x) => TIME_LABELS[x]).join(', '));
    if (a.soon) t.push('в ближайшие 2 дня');
    if (!t.length) t.push('любой психолог');
    return t.map((x) => `<span class="tag tag--sm">${x}</span>`).join('');
  };

  /** Ссылка в каталог с теми же фильтрами (каталог понимает topic и format) */
  const catalogUrl = (a) => {
    const q = new URLSearchParams();
    a.topics.forEach((t) => q.append('topic', t));
    if (a.format) q.set('format', a.format);
    const s = q.toString();
    return `catalog.html${s ? `?${s}` : ''}`;
  };

  const showResult = () => {
    const a = answers();
    const exact = matches(a);
    // Точные совпадения первыми; если их меньше трёх – добавляем близкие варианты
    const list = [
      ...exact.slice(0, 3).map((p) => ({ p, miss: [] })),
      ...closest(a).filter(({ miss }) => miss.length),
    ].slice(0, 3);
    const n = exact.length;
    const near = list.some(({ miss }) => miss.length);

    const head = exact.length
      ? `<h1 class="qres__title" id="q-res" tabindex="-1">${a.name ? `${esc(a.name)}, вот` : 'Вот'} с&nbsp;кем можно начать</h1>
         <p class="qres__lead">${n > 3 ? `Подошли ${n}&nbsp;${plural(n, 'психолог', 'психолога', 'психологов')} – здесь трое, кто совпал с&nbsp;вашим запросом лучше всего.`
           : near ? `По&nbsp;всем ответам ${n === 1 ? 'подошёл один психолог' : `подошли ${n}&nbsp;психолога`}. Рядом – близкие варианты, чем они отличаются, отмечено жёлтым.`
           : 'Они подошли по&nbsp;всем вашим ответам.'} В&nbsp;профиле – образование, отзывы и&nbsp;свободное время.</p>`
      : `<h1 class="qres__title" id="q-res" tabindex="-1">${a.name ? `${esc(a.name)}, точно` : 'Точно'} под все условия никто не&nbsp;подошёл</h1>
         <p class="qres__lead">Но&nbsp;есть близкие варианты: тема и&nbsp;формат совпадают, а&nbsp;чем они отличаются – отмечено жёлтым.</p>`;

    screens.result.innerHTML = `
      <div class="qres__head">
        <span class="eyebrow">Подбор готов</span>
        ${head}
        ${a.mood === 'crisis' ? `<p class="qres__sos">Если станет совсем тяжело – звоните <a href="tel:103">103</a> или <a href="tel:112">112</a>, там помогут сразу.</p>` : ''}
        <div class="qres__req"><span>Ваш запрос:</span>${requestTags(a)}</div>
        ${a.name ? `<p class="qres__hint">Когда будете записываться, имя из&nbsp;анкеты уже будет в&nbsp;форме регистрации.</p>` : ''}
        <div class="qres__actions">
          <button type="button" class="qlink" data-edit><svg><use href="#i-back"/></svg>Изменить ответы</button>
          <button type="button" class="qlink" data-restart><svg><use href="#i-redo"/></svg>Пройти заново</button>
        </div>
      </div>
      ${list.length ? `<div class="qres__grid">${list.map(({ p, miss }, i) => card(p, a, miss, i)).join('')}</div>`
        : `<div class="qres__empty"><svg style="color:#C9CED8"><use href="#face-neutral"/></svg>
             <p><b>Пока некого показать.</b> Попробуйте убрать часть тем или выбрать другой формат – или посмотрите весь каталог.</p></div>`}
      <div class="qres__more">
        <span>${n > 3 ? `Ещё <b>${n - 3}</b> ${plural(n - 3, 'психолог подходит', 'психолога подходят', 'психологов подходят')} – и&nbsp;у&nbsp;каждого подробный профиль.` : 'Хотите сравнить сами? В&nbsp;каталоге – все психологи и&nbsp;фильтры.'}</span>
        <a href="${catalogUrl(a)}" class="link-arrow">Открыть каталог <svg><use href="#i-arrow"/></svg></a>
      </div>`;

    showScreen('result');
    screens.result.querySelector('#q-res').focus({ preventScroll: true });
    startLast.hidden = false;
    save(true);
  };

  screens.result.addEventListener('click', (e) => {
    if (e.target.closest('[data-edit]')) { showScreen('steps'); showStep('format'); }
    if (e.target.closest('[data-restart]')) {
      form.reset();
      methodNote.innerHTML = '';
      ageNote.textContent = '';
      ageField.classList.remove('is-error');
      try { localStorage.removeItem(QUIZ_KEY); } catch { /* хранилище недоступно – не страшно */ }
      startLast.hidden = true;
      showScreen('start');
    }
  });

  /* ---------- Старт ---------- */
  const startLast = screens.start.querySelector('[data-last]');
  screens.start.querySelector('[data-start]').addEventListener('click', () => { showScreen('steps'); showStep('format'); });
  startLast.addEventListener('click', showResult);

  /* ---------- Сохранение ответов в браузере ---------- */
  function save(done) {
    try {
      const prev = JSON.parse(localStorage.getItem(QUIZ_KEY) || '{}');
      localStorage.setItem(QUIZ_KEY, JSON.stringify({ answers: [...new FormData(form)], done: done || prev.done || false }));
    } catch { /* приватный режим или запрет хранилища – анкета работает и без него */ }
  }
  const restore = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(QUIZ_KEY) || 'null');
      if (!saved) return;
      form.querySelectorAll('[name="gender"], [name="age"], [name="method"]').forEach((el) => { el.checked = false; });
      saved.answers.forEach(([name, value]) => {
        const text = form.querySelector(`input[type="text"][name="${name}"]`);
        if (text) { text.value = value; return; }
        const el = form.querySelector(`[name="${name}"][value="${CSS.escape(value)}"]`) || form.querySelector(`[name="${name}"]:not([value])`);
        if (el) el.checked = true;
      });
      ['gender', 'age', 'method'].forEach((name) => {
        if (!form.querySelector(`[name="${name}"]:checked`)) form.querySelector(`[name="${name}"][value=""]`).checked = true;
      });
      methodNote.innerHTML = noteFor(answers().method);
      startLast.hidden = !saved.done;
    } catch { /* повреждённые данные – просто начинаем с чистого листа */ }
  };
  restore();

  /* ---------- Параллакс фона, как на странице входа ---------- */
  const bg = document.querySelector('.auth-bg');
  if (bg && !calm) {
    let frame = null;
    window.addEventListener('mousemove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        bg.style.setProperty('--px', (-(e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        bg.style.setProperty('--py', (-(e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
        frame = null;
      });
    });
  }
});
