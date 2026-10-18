/**
 * «Рядом» – страница психолога (psychologist.html?id=N).
 * Данные: GET /api/psychologists/:id (анкета, услуги, образование), …/:id/reviews (отзывы и сводка),
 * …/:id/slots (свободные окна на три недели). Запись – POST /api/appointments { slotId, format, note };
 * без входа – переход на вход и возврат сюда, записаться может только клиент.
 */

/* Короткое описание методов – подсказка при наведении на плашку метода */
const METHOD_INFO = {
  'КПТ': 'Ищем связь между мыслями, чувствами и поведением и пробуем новые способы реагировать.',
  'Гештальт': 'Внимание к тому, что происходит здесь и сейчас: чувства, телесные ощущения, отношения.',
  'Схема-терапия': 'Работа с глубинными убеждениями, которые сложились в детстве и мешают сейчас.',
  'ACT': 'Учимся принимать трудные переживания и действовать в соответствии со своими ценностями.',
  'Психоанализ': 'Исследуем повторяющиеся сценарии и их корни, чтобы освободиться от них.',
  'EMDR': 'Переработка травматичных воспоминаний с помощью движений глаз или звуковой стимуляции.',
  'Системная семейная': 'Смотрим на трудности как на часть системы отношений в семье или паре.',
};

/* Форматы: иконка и подпись; цена у каждого формата своя – из услуг психолога */
const FORMAT_INFO = {
  individual: { icon: 'i-user', note: 'вы и психолог' },
  couple: { icon: 'i-users', note: 'для партнёров' },
  child: { icon: 'i-child', note: 'ребёнок и родитель' },
};

const DAYS_AHEAD = 21;

document.addEventListener('DOMContentLoaded', async () => {
  const { escapeHtml, plural, dateAt, stars, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const rating = (r) => (r ? r.toFixed(1).replace('.', ',') : '–');

  /* ---------- Какой психолог открыт ---------- */
  const id = Number(new URLSearchParams(location.search).get('id'));
  const notFound = (text) => {
    $('[data-profile]').hidden = true;
    $('[data-not-found]').hidden = false;
    const msg = $('[data-not-found] p');
    if (text && msg) msg.textContent = text;
    document.title = 'Психолог не найден – Рядом';
  };
  let p, revs, slotsData;
  try {
    [p, revs, slotsData] = await Promise.all([
      API.get(`/psychologists/${id}`),
      API.get(`/psychologists/${id}/reviews`, { limit: 20 }),
      API.get(`/psychologists/${id}/slots`, { from: isoDate(dateAt(0)), to: isoDate(dateAt(DAYS_AHEAD - 1)) }),
    ]);
  } catch (err) {
    notFound(err.status === 404 ? null : err.message);
    return;
  }
  document.title = `${p.name} – Рядом`;

  /* ---------- Обложка профиля ---------- */
  $('[data-photo]').innerHTML = p.avatarUrl ? `<img src="${escapeHtml(p.avatarUrl)}" alt="${escapeHtml(p.name)}">` : '';
  $('[data-role]').textContent = p.headline || 'Психолог';
  $('[data-name]').textContent = p.name;
  $('[data-rating]').textContent = rating(p.rating);
  $('[data-reviews-count]').textContent = `${p.reviewsCount} ${plural(p.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}`;
  $('[data-exp]').textContent = `${p.experienceYears} ${plural(p.experienceYears, 'год', 'года', 'лет')} практики`;
  $('[data-price]').textContent = `от ${p.priceFrom} BYN`;
  $('[data-about]').textContent = p.bio || '';

  /* ---------- Запросы, методы, этапы, образование ---------- */
  $('[data-topics]').innerHTML = p.topics.map((t) => `<span class="tag tag--blue">${escapeHtml(t.name)}</span>`).join('');
  $('[data-methods]').innerHTML = p.methods.map((m) => `<span class="tag tag--grey" title="${METHOD_INFO[m.name] || ''}">${escapeHtml(m.name)}</span>`).join('');
  // «Как строится работа» – по предложению на шаг
  const steps = (p.approach || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  $('[data-work-steps]').innerHTML = steps.map((st) => `<li>${escapeHtml(st.replace(/\.$/, ''))}</li>`).join('');

  $('[data-edu]').innerHTML = p.education.map((e) => {
    const diploma = e.type === 'diploma';
    return `
    <li>
      <span class="pp-edu__ic"><svg><use href="#${diploma ? 'i-cap' : 'i-book'}"/></svg></span>
      <span class="pp-edu__body"><b>${escapeHtml(diploma ? [e.institution, e.specialty].filter(Boolean).join(', ') : e.specialty || e.institution)}</b>
        <small>${escapeHtml(diploma ? 'Высшее образование' : e.institution || '')}</small></span>
      <span class="pp-edu__year">${e.year || ''}</span>
    </li>`;
  }).join('');

  /* ---------- Отзывы: сводка по оценкам + список ---------- */
  const sum = revs.summary;
  $('[data-rev-sum]').innerHTML = `
    <div class="pp-rev-sum__big">
      <b>${rating(sum.rating)}</b>
      ${stars(Math.round(sum.rating || 0), 18)}
      <small>${sum.count} ${plural(sum.count, 'отзыв', 'отзыва', 'отзывов')}</small>
    </div>
    <ul class="pp-rev-sum__bars">
      ${[5, 4, 3, 2, 1].map((n) => `
        <li><span>${n}</span><i><b style="width:${sum.count ? Math.round((sum.distribution[n] / sum.count) * 100) : 0}%"></b></i><small>${sum.distribution[n]}</small></li>`).join('')}
    </ul>`;
  $('[data-reviews]').innerHTML = revs.items.length ? revs.items.map((r) => `
    <article class="pp-review">
      <header>
        ${UI.avatar(r.author, null, 40)}
        <span><b>${escapeHtml(r.author)}</b><small>${UI.fullDate(r.createdAt)} · ${r.sessions} ${plural(r.sessions, 'сессия', 'сессии', 'сессий')}</small></span>
        ${stars(r.rating, 15)}
      </header>
      ${r.body ? `<p>${escapeHtml(r.body)}</p>` : ''}
      ${r.reply ? `<div class="pp-review__reply"><b>Ответ психолога</b>${escapeHtml(r.reply.text)}</div>` : ''}
    </article>`).join('') : '<p class="pp-empty">Отзывов пока нет</p>';

  /* ---------- Запись: формат ---------- */
  const formatsEl = $('[data-formats]');
  formatsEl.innerHTML = p.services.map((sv, i) => {
    const info = FORMAT_INFO[sv.code] || FORMAT_INFO.individual;
    return `<label class="bformat">
      <input type="radio" name="format" value="${sv.code}"${i === 0 ? ' checked' : ''}>
      <span><svg><use href="#${info.icon}"/></svg><b>${escapeHtml(sv.name)}</b><small>${info.note}</small><em>${sv.price} BYN</em></span>
    </label>`;
  }).join('');
  const service = () => p.services.find((sv) => sv.code === formatsEl.querySelector('input:checked').value);

  /* ---------- Свободные окна: день (через сколько дней от сегодня) → [{ id, time }] ---------- */
  const freeByDay = {};
  const kOf = (date) => Math.round((new Date(`${date}T00:00:00`) - dateAt(0)) / 86400000);
  slotsData.slots.forEach((sl) => { (freeByDay[kOf(sl.date)] ||= []).push({ id: sl.id, time: sl.time }); });
  const freeOn = (k) => freeByDay[k] || [];

  /* ---------- Запись: лента дней ---------- */
  const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const daysEl = $('[data-days]');
  let day = null;     // выбранный день (через сколько дней от сегодня)
  let slot = null;    // выбранное окно { id, time }

  const renderDays = () => {
    daysEl.innerHTML = Array.from({ length: DAYS_AHEAD }, (_, k) => {
      const d = dateAt(k);
      const free = freeOn(k).length;
      const label = k === 0 ? 'Сегодня' : k === 1 ? 'Завтра' : WEEK[d.getDay()];
      return `<button type="button" class="bday${free ? '' : ' is-empty'}${k === day ? ' is-active' : ''}" data-day="${k}"${free ? '' : ' disabled'}
        aria-label="${d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}${free ? '' : ', нет времени'}">
        <small>${label}</small><b>${d.getDate()}</b><i></i>
      </button>`;
    }).join('');
  };
  renderDays();

  const monthOf = (k) => dateAt(k).toLocaleDateString('ru-RU', { month: 'long' });
  const m1 = monthOf(0), m2 = monthOf(DAYS_AHEAD - 1);
  $('[data-month]').textContent = m1 === m2 ? m1 : `${m1} – ${m2}`;

  /* ---------- Запись: время выбранного дня ---------- */
  const PARTS = [
    { label: 'Утро', icon: 'i-sunrise', test: (m) => m < 12 * 60 },
    { label: 'День', icon: 'i-sun', test: (m) => m >= 12 * 60 && m < 17 * 60 },
    { label: 'Вечер', icon: 'i-moon', test: (m) => m >= 17 * 60 },
  ];
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const timesEl = $('[data-times]');
  const renderTimes = () => {
    if (day === null) {
      timesEl.innerHTML = '<p class="book__hint"><svg><use href="#i-calendar"/></svg>Выберите день – покажем свободное время</p>';
      return;
    }
    const free = freeOn(day);
    timesEl.innerHTML = PARTS.map((part) => {
      const ts = free.filter((x) => part.test(mins(x.time)));
      if (!ts.length) return '';
      return `<div class="book__part">
        <span class="book__part-label"><svg><use href="#${part.icon}"/></svg>${part.label}</span>
        <div class="book__slots">${ts.map((x) => `<button type="button" class="bslot${slot && x.id === slot.id ? ' is-active' : ''}" data-slot="${escapeHtml(String(x.id))}">${x.time}</button>`).join('')}</div>
      </div>`;
    }).join('');
  };

  /* ---------- Итог и кнопка записи ---------- */
  const bookBtn = $('[data-book]');
  const whenText = (k = day) => dateAt(k).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const renderTotal = () => {
    const ready = day !== null && slot !== null;
    $('[data-total]').hidden = !ready;
    bookBtn.disabled = !ready;
    bookBtn.textContent = ready ? 'Записаться' : 'Выберите время';
    if (ready) {
      $('[data-total-when]').textContent = `${whenText()}, ${slot.time}`;
      $('[data-total-price]').textContent = `${service().price} BYN`;
    }
  };

  daysEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.bday');
    if (btn) pickDay(Number(btn.dataset.day));
  });
  timesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.bslot');
    if (!btn) return;
    slot = freeOn(day).find((x) => String(x.id) === btn.dataset.slot);
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

  /** Ближайший день со свободным окном */
  const nearest = () => {
    for (let k = 0; k < DAYS_AHEAD; k += 1) if (freeOn(k).length) return k;
    return null;
  };

  /** Выбрать день в окне записи */
  const pickDay = (k) => {
    day = k;
    slot = null;
    daysEl.querySelectorAll('.bday').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.day) === k));
    renderTimes(); renderTotal();
  };

  /* ---------- Окно записи: шаги «время → подтверждение → готово» ---------- */
  const modal = document.getElementById('book-modal');
  const showStep = (name) => modal.querySelectorAll('[data-step]').forEach((st) => { st.hidden = st.dataset.step !== name; });
  const openPicker = () => {
    showStep('pick');
    modal.showModal();
    updateArrows();
    daysEl.querySelector('.bday.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  $('[data-open-time]').addEventListener('click', openPicker);

  // Сразу выбираем ближайший день со свободным временем
  const showNoTime = () => {
    timesEl.innerHTML = '<p class="book__hint">В ближайшие три недели свободного времени нет. Напишите психологу в&nbsp;чат.</p>';
  };
  const startDay = nearest();
  if (startDay !== null) pickDay(startDay);
  else showNoTime();

  bookBtn.addEventListener('click', async () => {
    // Записываются только клиенты: гостя – на вход с возвратом, психологу и модератору – подсказка
    const user = await Session.user().catch(() => null);
    if (!user) { location.href = `login.html?next=${encodeURIComponent(`psychologist.html?id=${p.id}`)}`; return; }
    if (!user.roles.includes('client')) { toast('Записаться на консультацию может только клиент', true); return; }
    const sv = service();
    $('[data-book-sum]').innerHTML = `
      <div class="book-sum__who">
        ${p.avatarUrl ? `<img src="${escapeHtml(p.avatarUrl)}" alt="">` : ''}
        <span><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.headline || 'Психолог')}</small></span>
      </div>
      <dl>
        <div><dt>Когда</dt><dd>${whenText()}, ${slot.time}</dd></div>
        <div><dt>Формат</dt><dd>${escapeHtml(sv.name)}, ${sv.durationMin} мин</dd></div>
        <div><dt>Стоимость</dt><dd>${sv.price} BYN</dd></div>
      </dl>`;
    modal.querySelector('textarea').value = '';
    showStep('confirm');
  });
  $('[data-book-back]').addEventListener('click', () => showStep('pick'));

  const confirmBtn = $('[data-book-confirm]');
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    try {
      await API.post('/appointments', { slotId: slot.id, format: service().code, note: modal.querySelector('textarea').value.trim() || undefined });
      $('[data-book-done]').innerHTML = `${escapeHtml(p.name)} ждёт вас <b>${whenText()}, ${slot.time}</b>. Встреча – в&nbsp;разделе «Мои сессии».`;
      showStep('done');
    } catch (err) {
      toast(err.message, true);
      if (err.code !== 'SLOT_TAKEN' && err.code !== 'CONFLICT') return;
      showStep('pick');                    // окно уже заняли – выбрать другое
    } finally {
      confirmBtn.disabled = false;
    }
    // Занятое время больше не предлагается
    freeByDay[day] = freeOn(day).filter((x) => x.id !== slot.id);
    slot = null;
    renderDays(); renderTimes(); renderTotal();
    if (!freeOn(day).length) { const k = nearest(); if (k !== null) pickDay(k); else showNoTime(); }
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // Ссылка #reviews из каталога – плавная прокрутка к отзывам
  if (location.hash === '#reviews') document.getElementById('reviews').scrollIntoView();
});

/* ---------- Запрос из анкеты подбора (quiz.html) в блоке записи ----------
   Анкета хранит ответы в localStorage. Показываем темы и формат,
   чтобы клиент видел: психолог получит запрос вместе с записью. */
document.addEventListener('DOMContentLoaded', () => {
  const box = document.querySelector('[data-quiz-req]');
  if (!box) return;
  try {
    const saved = JSON.parse(localStorage.getItem('ryadom-quiz') || 'null');
    if (!saved) return;
    const get = (key) => saved.answers.filter(([k, v]) => k === key && v).map(([, v]) => v);
    const FORMATS = { 'Индивидуальная': 'для себя', 'Парная': 'для пары', 'С ребёнком': 'для ребёнка' };
    const parts = [get('topic').map((t) => t.toLowerCase()).join(', '), FORMATS[get('format')[0]]].filter(Boolean);
    if (!parts.length) return;
    box.querySelector('[data-quiz-req-text]').textContent = parts.join(' · ');
    box.hidden = false;
  } catch { /* хранилище недоступно – блок просто не показываем */ }
});
