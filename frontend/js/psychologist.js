/**
 * «Рядом» – страница психолога (psychologist.html?id=N).
 * Данные пока из data.js (PSYCHOLOGISTS, REVIEWS, demoSlotsOn).
 * Позже: GET /api/psychologists/:id, GET /api/psychologists/:id/reviews,
 *        GET /api/psychologists/:id/slots, POST /api/appointments.
 */

/* Описание методов для блока «Методы» */
const METHOD_INFO = {
  'КПТ': 'Ищем связь между мыслями, чувствами и поведением и пробуем новые способы реагировать.',
  'Гештальт': 'Внимание к тому, что происходит здесь и сейчас: чувства, телесные ощущения, отношения.',
  'Схема-терапия': 'Работа с глубинными убеждениями, которые сложились в детстве и мешают сейчас.',
  'ACT': 'Учимся принимать трудные переживания и действовать в соответствии со своими ценностями.',
  'Психоанализ': 'Исследуем повторяющиеся сценарии и их корни, чтобы освободиться от них.',
  'EMDR': 'Переработка травматичных воспоминаний с помощью движений глаз или звуковой стимуляции.',
  'Системная семейная': 'Смотрим на трудности как на часть системы отношений в семье или паре.',
};

/* Форматы: надбавка к базовой цене и иконка. API: цена хранится отдельно для каждого формата */
const FORMAT_INFO = {
  'Индивидуальная': { icon: 'i-user', extra: 0, note: 'вы и психолог' },
  'Парная': { icon: 'i-users', extra: 20, note: 'для партнёров' },
  'С ребёнком': { icon: 'i-child', extra: 10, note: 'ребёнок и родитель' },
};

const DAYS_AHEAD = 21;

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, stars } = UI;
  const $ = (sel) => document.querySelector(sel);

  /* ---------- Какой психолог открыт ---------- */
  const id = Number(new URLSearchParams(location.search).get('id')) || 1;
  const p = PSYCHOLOGISTS.find((x) => x.id === id);
  if (!p) {
    $('[data-profile]').hidden = true;
    $('[data-not-found]').hidden = false;
    document.title = 'Психолог не найден – Рядом';
    return;
  }
  document.title = `${p.name} – Рядом`;

  /* ---------- Шапка профиля ---------- */
  $('[data-photo]').innerHTML = `<img src="assets/img/psychologists/${p.photo}.webp" alt="${escapeHtml(p.name)}">`
    + (p.online ? '<span class="pp-hero__online">в сети</span>' : '');
  $('[data-role]').textContent = p.role;
  $('[data-name]').textContent = p.name;
  $('[data-rating]').textContent = p.rating.toFixed(1).replace('.', ',');
  $('[data-reviews-count]').textContent = `${p.reviews} ${plural(p.reviews, 'отзыв', 'отзыва', 'отзывов')}`;
  $('[data-exp]').textContent = `${p.exp} ${plural(p.exp, 'год', 'года', 'лет')}`;
  $('[data-price]').textContent = `от ${p.price} BYN`;
  $('[data-about]').textContent = p.about;

  /* ---------- Запросы, методы, этапы, образование ---------- */
  $('[data-topics]').innerHTML = p.topics.map((t) => `<span class="tag tag--blue">${escapeHtml(t)}</span>`).join('');
  $('[data-methods]').innerHTML = p.methods.map((m) => `
    <div class="pp-method"><b>${escapeHtml(m)}</b><p>${METHOD_INFO[m] || ''}</p></div>`).join('');
  $('[data-work-steps]').innerHTML = PSY_EXTRA.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');

  const [uni, year] = p.edu.split(' · ');
  const eduItems = [
    { icon: 'i-cap', title: uni, sub: 'Высшее образование', year },
    ...PSY_EXTRA.courses.map((c) => ({ icon: 'i-book', title: c.title, sub: c.place, year: c.year })),
  ];
  $('[data-edu]').innerHTML = eduItems.map((e) => `
    <li>
      <span class="pp-edu__ic"><svg><use href="#${e.icon}"/></svg></span>
      <span class="pp-edu__body"><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.sub)}</small></span>
      <span class="pp-edu__year">${e.year}</span>
    </li>`).join('');

  /* ---------- Отзывы: сводка по оценкам + список ---------- */
  const reviews = REVIEWS.filter((r) => r.psy === p.id);
  // Распределение оценок: для демо – из рейтинга и общего числа отзывов
  const fives = Math.round(p.reviews * (p.rating - 4));
  const dist = { 5: fives, 4: p.reviews - fives - (p.rating < 4.8 ? 1 : 0), 3: p.rating < 4.8 ? 1 : 0, 2: 0, 1: 0 };
  $('[data-rev-sum]').innerHTML = `
    <div class="pp-rev-sum__big">
      <b>${p.rating.toFixed(1).replace('.', ',')}</b>
      ${stars(Math.round(p.rating), 18)}
      <small>${p.reviews} ${plural(p.reviews, 'отзыв', 'отзыва', 'отзывов')}</small>
    </div>
    <ul class="pp-rev-sum__bars">
      ${[5, 4, 3, 2, 1].map((n) => `
        <li><span>${n}</span><i><b style="width:${p.reviews ? Math.round((dist[n] / p.reviews) * 100) : 0}%"></b></i><small>${dist[n]}</small></li>`).join('')}
    </ul>`;
  $('[data-reviews]').innerHTML = reviews.length ? reviews.map((r) => `
    <article class="pp-review">
      <header>
        ${UI.avatar(r.name, null, 40)}
        <span><b>${escapeHtml(r.name)}</b><small>${UI.fullDate(r.date)} · ${r.sessions} ${plural(r.sessions, 'сессия', 'сессии', 'сессий')}</small></span>
        ${stars(r.rating, 15)}
      </header>
      <p>${escapeHtml(r.text)}</p>
    </article>`).join('') : '<p class="pp-empty">Отзывов пока нет</p>';

  /* ---------- Запись: формат ---------- */
  const formatsEl = $('[data-formats]');
  formatsEl.innerHTML = p.formats.map((f, i) => {
    const info = FORMAT_INFO[f];
    return `<label class="bformat">
      <input type="radio" name="format" value="${f}"${i === 0 ? ' checked' : ''}>
      <span><svg><use href="#${info.icon}"/></svg><b>${f}</b><small>${info.note}</small><em>${p.price + info.extra} BYN</em></span>
    </label>`;
  }).join('');
  const format = () => formatsEl.querySelector('input:checked').value;
  const priceOf = (f) => p.price + FORMAT_INFO[f].extra;

  /* ---------- Запись: лента дней ---------- */
  const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const daysEl = $('[data-days]');
  let day = null;     // выбранный день (через сколько дней от сегодня)
  let time = null;    // выбранное время

  daysEl.innerHTML = Array.from({ length: DAYS_AHEAD }, (_, k) => {
    const d = dateAt(k);
    const free = demoSlotsOn(p, k).length;
    const label = k === 0 ? 'Сегодня' : k === 1 ? 'Завтра' : WEEK[d.getDay()];
    return `<button type="button" class="bday${free ? '' : ' is-empty'}" data-day="${k}"${free ? '' : ' disabled'}
      aria-label="${d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}${free ? '' : ', нет времени'}">
      <small>${label}</small><b>${d.getDate()}</b><i></i>
    </button>`;
  }).join('');

  const monthOf = (k) => dateAt(k).toLocaleDateString('ru-RU', { month: 'long' });
  const m1 = monthOf(0), m2 = monthOf(DAYS_AHEAD - 1);
  $('[data-month]').textContent = m1 === m2 ? m1 : `${m1} – ${m2}`;

  /* ---------- Запись: время выбранного дня ---------- */
  const PARTS = [
    { label: 'Утро', icon: 'i-sunrise', test: (m) => m < 12 * 60 },
    { label: 'День', icon: 'i-sun', test: (m) => m >= 12 * 60 && m < 17 * 60 },
    { label: 'Вечер', icon: 'i-moon', test: (m) => m >= 17 * 60 },
  ];
  const timesEl = $('[data-times]');
  const renderTimes = () => {
    if (day === null) {
      timesEl.innerHTML = '<p class="book__hint"><svg><use href="#i-calendar"/></svg>Выберите день – покажем свободное время</p>';
      return;
    }
    const free = demoSlotsOn(p, day);
    timesEl.innerHTML = PARTS.map((part) => {
      const ts = free.filter((t) => part.test(demoMins(t)));
      if (!ts.length) return '';
      return `<div class="book__part">
        <span class="book__part-label"><svg><use href="#${part.icon}"/></svg>${part.label}</span>
        <div class="book__slots">${ts.map((t) => `<button type="button" class="bslot${t === time ? ' is-active' : ''}" data-time="${t}">${t}</button>`).join('')}</div>
      </div>`;
    }).join('');
  };

  /* ---------- Итог и кнопка записи ---------- */
  const bookBtn = $('[data-book]');
  const whenText = () => dateAt(day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const renderTotal = () => {
    const ready = day !== null && time !== null;
    $('[data-total]').hidden = !ready;
    bookBtn.disabled = !ready;
    bookBtn.textContent = ready ? 'Записаться' : 'Выберите время';
    if (ready) {
      $('[data-total-when]').textContent = `${whenText()}, ${time}`;
      $('[data-total-price]').textContent = `${priceOf(format())} BYN`;
    }
  };

  daysEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.bday');
    if (!btn) return;
    day = Number(btn.dataset.day);
    time = null;
    daysEl.querySelectorAll('.bday').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderTimes(); renderTotal();
  });
  timesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.bslot');
    if (!btn) return;
    time = btn.dataset.time;
    timesEl.querySelectorAll('.bslot').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderTotal();
  });
  formatsEl.addEventListener('change', renderTotal);

  // Стрелки листают ленту дней
  const prevBtn = $('[data-days-prev]'), nextBtn = $('[data-days-next]');
  const updateArrows = () => {
    prevBtn.disabled = daysEl.scrollLeft < 4;
    nextBtn.disabled = daysEl.scrollLeft + daysEl.clientWidth > daysEl.scrollWidth - 4;
  };
  prevBtn.addEventListener('click', () => daysEl.scrollBy({ left: -240 }));
  nextBtn.addEventListener('click', () => daysEl.scrollBy({ left: 240 }));
  daysEl.addEventListener('scroll', updateArrows, { passive: true });

  // Сразу выбираем ближайший день со свободным временем
  const first = daysEl.querySelector('.bday:not(.is-empty)');
  if (first) first.click();
  else timesEl.innerHTML = '<p class="book__hint">В ближайшие три недели свободного времени нет. Напишите психологу в&nbsp;чат.</p>';
  updateArrows();

  /* ---------- Диалог подтверждения ---------- */
  const modal = document.getElementById('book-modal');
  const showStep = (name) => modal.querySelectorAll('[data-step]').forEach((s) => { s.hidden = s.dataset.step !== name; });

  bookBtn.addEventListener('click', () => {
    const f = format();
    $('[data-book-sum]').innerHTML = `
      <div class="book-sum__who">
        <img src="assets/img/psychologists/${p.photo}-sq.webp" alt="">
        <span><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.role)}</small></span>
      </div>
      <dl>
        <div><dt>Когда</dt><dd>${whenText()}, ${time}</dd></div>
        <div><dt>Формат</dt><dd>${f}, 50 мин</dd></div>
        <div><dt>Стоимость</dt><dd>${priceOf(f)} BYN</dd></div>
      </dl>`;
    showStep('confirm');
    modal.querySelector('textarea').value = '';
    modal.showModal();
  });

  $('[data-book-confirm]').addEventListener('click', () => {
    // API: POST /api/appointments { slotId, serviceId, note } → затем оплата
    $('[data-book-done]').innerHTML = `Сессия с&nbsp;${escapeHtml(p.name.split(' ')[0])} – <b>${whenText()}, ${time}</b>. Напоминание придёт за&nbsp;сутки и&nbsp;за&nbsp;час до&nbsp;встречи.`;
    showStep('done');
    // Занятое время пропадает из списка
    const slot = timesEl.querySelector(`[data-time="${time}"]`);
    slot?.remove();
    time = null;
    renderTotal();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // Ссылка #reviews из каталога – плавная прокрутка к отзывам
  if (location.hash === '#reviews') document.getElementById('reviews').scrollIntoView();
});
