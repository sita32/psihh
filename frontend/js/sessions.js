/**
 * «Рядом» – сессии в личном кабинете клиента (client-sessions.html).
 * Данные пока из data.js (CLIENT_SESSIONS, CLIENT_REVIEWS, PSYCHOLOGISTS).
 * Позже:
 *   GET   /api/appointments?scope=upcoming|past|cancelled
 *   PATCH /api/appointments/:id { status: 'cancelled', reason }        – отмена
 *   POST  /api/appointments/:id/reschedule { slotId, reason }          – перенос
 *   POST  /api/reviews { appointmentId, rating, text, anonymous }      – отзыв
 */
document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, dayLabel, shortDate, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const sessions = CLIENT_SESSIONS;
  const psyOf = (s) => PSYCHOLOGISTS.find((p) => p.id === s.psy);
  const reviewOf = (s) => CLIENT_REVIEWS.find((r) => r.id === s.review);

  /* ---------- Время ---------- */
  /** Дата и время начала сессии */
  const startOf = (s) => {
    const d = dateAt(s.k);
    const [h, m] = s.time.split(':').map(Number);
    d.setHours(h, m);
    return d;
  };
  const hoursLeft = (s) => (startOf(s) - new Date()) / 3600000;
  const nowTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  /** «через 1 день 3 ч», «через 40 мин» */
  const leftText = (s) => {
    const h = hoursLeft(s);
    if (h < 1) return `через ${Math.max(1, Math.round(h * 60))} мин`;
    const d = Math.floor(h / 24), rest = Math.floor(h % 24);
    if (!d) return `через ${rest} ч`;
    return `через ${d} ${plural(d, 'день', 'дня', 'дней')}${rest ? ` ${rest} ч` : ''}`;
  };

  /* ---------- Какие сессии на какой вкладке ---------- */
  const TABS = {
    upcoming: (s) => s.status === 'scheduled' && hoursLeft(s) > -1,
    past: (s) => s.status === 'completed' || s.status === 'no_show',
    cancelled: (s) => s.status === 'cancelled',
  };
  const sorted = (tab) => sessions.filter(TABS[tab])
    .sort((a, b) => (tab === 'upcoming' ? startOf(a) - startOf(b) : startOf(b) - startOf(a)));

  /* ---------- Бейджи статуса ---------- */
  const statusBadge = (s) => {
    if (s.status === 'scheduled') {
      return hoursLeft(s) < 24 ? '<span class="st st--wait">Меньше суток</span>' : '<span class="st st--info">Запланирована</span>';
    }
    if (s.status === 'completed') return '<span class="st st--ok">Состоялась</span>';
    if (s.status === 'no_show') return '<span class="st st--bad">Пропущена</span>';
    return `<span class="st st--muted">${s.cancel.by === 'client' ? 'Отменена вами' : 'Отменена психологом'}</span>`;
  };

  /* ---------- Кнопки действий у карточки ---------- */
  // Статус отзыва – прямоугольная плашка той же высоты, что и кнопки рядом
  const REVIEW_STATE = {
    pending: '<span class="sess-flag sess-flag--wait"><svg><use href="#i-clock"/></svg>Отзыв на&nbsp;проверке</span>',
    approved: '<span class="sess-flag sess-flag--ok"><svg><use href="#i-check"/></svg>Отзыв опубликован</span>',
    rejected: '<a href="client-reviews.html" class="sess-flag sess-flag--bad"><svg><use href="#i-alert"/></svg>Отзыв отклонён</a>',
  };
  const actions = (s, p) => {
    const chat = '<a href="client-chat.html" class="icon-btn" aria-label="Написать психологу" title="Написать психологу"><svg><use href="#i-chat"/></svg></a>';
    const again = `<a href="psychologist.html?id=${p.id}" class="btn btn--line btn--xs">Записаться снова</a>`;
    if (s.status === 'scheduled') {
      return `<button type="button" class="btn btn--line btn--xs" data-act="move"><svg><use href="#i-move"/></svg>Перенести</button>
        <button type="button" class="btn btn--danger btn--xs" data-act="cancel">Отменить</button>${chat}`;
    }
    if (s.status === 'completed') {
      const r = reviewOf(s);
      const review = r ? REVIEW_STATE[r.status]
        : '<button type="button" class="btn btn--primary btn--xs" data-act="review"><svg><use href="#i-star"/></svg>Оставить отзыв</button>';
      return review + again;
    }
    return again;
  };

  /* ---------- Карточка сессии ---------- */
  const histItem = (h) => `<li>${escapeHtml(h.text)}${h.reason ? ` · причина: «${escapeHtml(h.reason)}»` : ''}
    <small>${dayLabel(dateAt(h.k))}, ${h.time} · ${escapeHtml(h.by)}</small></li>`;

  const card = (s, i) => {
    const p = psyOf(s);
    const d = dateAt(s.k);
    const off = s.status === 'cancelled' || s.status === 'no_show';
    let extra = '';
    if (s.note && s.status === 'scheduled') extra += `<div class="sess__note"><b>Ваш запрос:</b> ${escapeHtml(s.note)}</div>`;
    if (s.cancel) {
      extra += `<p class="sess__reason"><b>Причина:</b> ${escapeHtml(s.cancel.reason)}${s.cancel.refund ? ' · деньги возвращены на&nbsp;карту' : ' · оплата не&nbsp;возвращается'}</p>`;
    }
    if (s.status === 'no_show') extra += '<p class="sess__reason">Вы не&nbsp;подключились к&nbsp;сессии – она не&nbsp;возвращается</p>';
    return `
      <article class="sess${off ? ' sess--off' : ''}" data-id="${s.id}" style="animation-delay:${Math.min(i, 6) * 40}ms">
        <div class="sess__date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</small></div>
        <div class="sess__main">
          <div class="sess__top"><span class="sess__time">${dayLabel(d)}, ${s.time}</span>${statusBadge(s)}</div>
          <div class="sess__who">
            <img class="ava-sq" style="--s:36px" src="assets/img/psychologists/${p.photo}-sq.webp" alt="">
            <span><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.role)} · ${s.format}, 50 мин</small></span>
          </div>
          ${extra}
        </div>
        <div class="sess__side">
          <span class="sess__price">${s.price} BYN</span>
          <div class="sess__btns">${actions(s, p)}</div>
        </div>
        <details class="sess__hist">
          <summary><svg><use href="#i-chevron"/></svg>История изменений</summary>
          <ul class="hist">${s.hist.map(histItem).join('')}</ul>
        </details>
      </article>`;
  };

  /* ---------- Ближайшая сессия ---------- */
  const renderNext = () => {
    const el = $('[data-next]');
    const s = sorted('upcoming')[0];
    if (!s) { el.hidden = true; return; }
    el.hidden = false;
    const p = psyOf(s);
    const d = dateAt(s.k);
    // Подключиться можно за 10 минут до начала и до конца сессии
    const canJoin = hoursLeft(s) <= 10 / 60 && hoursLeft(s) > -50 / 60;
    el.innerHTML = `
      <span class="next__cap">Ближайшая сессия · ${leftText(s)}</span>
      <div class="next__title">${dayLabel(d)}, ${s.time}</div>
      <div class="next__who">
        <img class="ava-sq" style="--s:32px" src="assets/img/psychologists/${p.photo}-sq.webp" alt="">
        <span><b>${escapeHtml(p.name)}</b> · ${s.format.toLowerCase()}, 50 мин</span>
      </div>
      <div class="next__btns" data-id="${s.id}">
        <button type="button" class="btn btn--primary btn--sm" ${canJoin ? '' : 'disabled title="Ссылка станет активной за 10 минут до начала"'}><svg><use href="#i-video"/></svg>Подключиться</button>
        <button type="button" class="btn btn--line btn--sm" data-act="move"><svg><use href="#i-move"/></svg>Перенести</button>
      </div>
      <img class="next__art" src="assets/img/cabinet/next-session.webp" alt="">`;
  };

  /* ---------- Список и счётчики вкладок ---------- */
  let tab = new URLSearchParams(location.search).get('tab');
  if (!TABS[tab]) tab = 'upcoming';
  const EMPTY = {
    upcoming: { title: 'Нет запланированных сессий', text: 'Выберите психолога в каталоге и запишитесь на удобное время.', btn: '<a href="catalog.html" class="btn btn--primary">Найти психолога</a>' },
    past: { title: 'Прошедших сессий пока нет', text: 'Здесь появятся встречи, которые уже состоялись.', btn: '' },
    cancelled: { title: 'Отменённых сессий нет', text: 'И хорошо 🙂', btn: '' },
  };

  const render = () => {
    Object.keys(TABS).forEach((t) => { $(`[data-count="${t}"]`).textContent = sessions.filter(TABS[t]).length; });
    const list = sorted(tab);
    const e = EMPTY[tab];
    $('[data-list]').innerHTML = list.length ? list.map(card).join('') : `
      <div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>${e.title}</b><p>${e.text}</p>${e.btn}</div>`;
    renderNext();
  };

  const tabsEl = $('[data-tabs]');
  tabsEl.querySelectorAll('[data-tab]').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.tab === tab);
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  });
  UI.initTabs(tabsEl, (t) => {
    tab = t;
    history.replaceState(null, '', t === 'upcoming' ? location.pathname : `?tab=${t}`);
    render();
  });

  /* ---------- Отмена ---------- */
  const cancel = async (s) => {
    const p = psyOf(s);
    const free = hoursLeft(s) >= 24;
    const reason = await UI.askReason({
      title: 'Отменить сессию?',
      text: `<b>${escapeHtml(p.name)}</b>, ${dayLabel(dateAt(s.k))}, ${s.time}.<br>`
        + (free
          ? 'До начала больше суток – деньги вернутся на&nbsp;карту в&nbsp;течение 3&nbsp;дней.'
          : '<span class="note-warn"><svg><use href="#i-alert"/></svg><span>До начала меньше 24&nbsp;часов – по&nbsp;правилам сервиса оплата не&nbsp;возвращается.</span></span>'),
      confirm: 'Отменить сессию',
      danger: true,
      presets: ['Заболела', 'Изменились планы', 'Хочу сменить психолога', 'Финансовые причины'],
    });
    if (!reason) return;
    s.status = 'cancelled';
    s.cancel = { by: 'client', reason, refund: free };
    s.hist.push({ k: 0, time: nowTime(), text: 'Отменена', by: 'Вы', reason });
    render();
    toast(free ? 'Сессия отменена, деньги вернутся на карту' : 'Сессия отменена');
  };

  /* ---------- Перенос: выбор нового времени у того же психолога ---------- */
  const moveModal = document.getElementById('move-modal');
  const moveDays = moveModal.querySelector('[data-move-days]');
  const moveTimes = moveModal.querySelector('[data-move-times]');
  const moveReason = moveModal.querySelector('[data-move-reason]');
  const moveOk = moveModal.querySelector('[data-move-ok]');
  const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  let moving = null;            // какая сессия переносится
  let pick = { k: null, time: null };

  const busy = (p, k, t) => sessions.some((x) => x.psy === p.id && x.status === 'scheduled' && x.k === k && x.time === t);
  const freeOn = (p, k) => demoSlotsOn(p, k).filter((t) => !busy(p, k, t));

  const renderMoveTimes = () => {
    const p = psyOf(moving);
    const ts = pick.k === null ? [] : freeOn(p, pick.k);
    moveTimes.innerHTML = ts.length
      ? ts.map((t) => `<button type="button" class="pick-time${t === pick.time ? ' is-active' : ''}" data-time="${t}">${t}</button>`).join('')
      : '<p class="pick-empty">Выберите день</p>';
    moveOk.disabled = !pick.time;
  };

  const openMove = (s) => {
    moving = s;
    pick = { k: null, time: null };
    const p = psyOf(s);
    moveModal.querySelector('[data-move-text]').innerHTML = `Сейчас: <b>${dayLabel(dateAt(s.k))}, ${s.time}</b> · ${escapeHtml(p.name)}`
      + (hoursLeft(s) < 24 ? '<span class="note-warn" style="margin-top:12px"><svg><use href="#i-alert"/></svg><span>До начала меньше суток – психолог может не&nbsp;согласиться на&nbsp;перенос.</span></span>' : '');
    moveDays.innerHTML = Array.from({ length: 14 }, (_, k) => {
      const d = dateAt(k);
      const n = freeOn(p, k).length;
      return `<button type="button" class="pick-day" data-k="${k}"${n ? '' : ' disabled'}>
        <small>${k === 0 ? 'Сегодня' : k === 1 ? 'Завтра' : WEEK[d.getDay()]}</small><b>${d.getDate()}</b></button>`;
    }).join('');
    moveModal.querySelector('[data-move-presets]').innerHTML = ['Рабочее совещание', 'Заболела', 'Командировка', 'Семейные обстоятельства']
      .map((r) => `<button type="button" class="preset">${r}</button>`).join('');
    moveReason.value = '';
    moveReason.closest('.f').classList.remove('is-error');
    renderMoveTimes();
    moveModal.showModal();
  };

  moveDays.addEventListener('click', (e) => {
    const b = e.target.closest('.pick-day');
    if (!b || b.disabled) return;
    pick = { k: Number(b.dataset.k), time: null };
    moveDays.querySelectorAll('.pick-day').forEach((x) => x.classList.toggle('is-active', x === b));
    renderMoveTimes();
  });
  moveTimes.addEventListener('click', (e) => {
    const b = e.target.closest('.pick-time');
    if (!b) return;
    pick.time = b.dataset.time;
    renderMoveTimes();
  });
  moveModal.addEventListener('click', (e) => {
    const b = e.target.closest('.preset');
    if (b) { moveReason.value = b.textContent; moveReason.closest('.f').classList.remove('is-error'); }
  });
  moveReason.addEventListener('input', () => moveReason.closest('.f').classList.remove('is-error'));
  moveOk.addEventListener('click', () => {
    const reason = moveReason.value.trim();
    if (reason.length < 3) { moveReason.closest('.f').classList.add('is-error'); moveReason.focus(); return; }
    const from = `${dayLabel(dateAt(moving.k))}, ${moving.time}`;
    moving.k = pick.k;
    moving.time = pick.time;
    const to = `${dayLabel(dateAt(moving.k))}, ${moving.time}`;
    moving.hist.push({ k: 0, time: nowTime(), text: `Перенесена: ${from} → ${to}`, by: 'Вы', reason });
    moveModal.close();
    render();
    toast(`Сессия перенесена на ${to}`);
  });

  /* ---------- Отзыв после проведённой сессии ---------- */
  const review = async (s) => {
    const p = psyOf(s);
    const res = await UI.askReview({
      title: 'Отзыв о психологе',
      who: `<b>${escapeHtml(p.name)}</b> · сессия ${shortDate(dateAt(s.k))}, ${s.time}`,
    });
    if (!res) return;
    const id = Math.max(...CLIENT_REVIEWS.map((r) => r.id)) + 1;
    CLIENT_REVIEWS.push({ id, session: s.id, psy: p.id, created: 0, status: 'pending', ...res });
    s.review = id;
    render();
    toast('Спасибо! Отзыв отправлен на проверку');
  };

  /* ---------- Кнопки в карточках и в блоке «Ближайшая» ---------- */
  document.querySelector('.cab-main').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('[data-id]').dataset.id);
    const s = sessions.find((x) => x.id === id);
    ({ cancel, move: openMove, review })[btn.dataset.act](s);
  });

  render();
});
