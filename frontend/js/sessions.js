/**
 * «Рядом» – сессии в личном кабинете клиента (client-sessions.html).
 * Данные – из API:
 *   GET   /api/appointments?scope=all                                 – все записи с историей и доступными действиями
 *   PATCH /api/appointments/:id { status: 'cancelled', reason }        – отмена
 *   GET   /api/psychologists/:id/slots                                 – свободное время для переноса
 *   POST  /api/appointments/:id/reschedule { slotId, reason }          – перенос
 *   POST  /api/reviews { appointmentId, rating, body, anonymous }      – отзыв
 */
document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, dayLabel, shortDate, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  let sessions = [];

  /* ---------- Время ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOf = (s) => new Date(s.startsAt);
  const dayOf = (s) => { const d = startOf(s); d.setHours(0, 0, 0, 0); return d; };
  const hoursLeft = (s) => (startOf(s) - new Date()) / 3600000;
  const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  /** «через 1 день 3 ч», «через 40 мин» */
  const leftText = (s) => {
    const h = hoursLeft(s);
    if (h < 1) return h > 0 ? `через ${Math.max(1, Math.round(h * 60))} мин` : 'уже идёт';
    const d = Math.floor(h / 24), rest = Math.floor(h % 24);
    if (!d) return `через ${rest} ч`;
    return `через ${d} ${plural(d, 'день', 'дня', 'дней')}${rest ? ` ${rest} ч` : ''}`;
  };
  /** Маленькое фото: у демо-фото психологов есть квадратная версия -sq */
  const thumb = (url) => (url && url.includes('/img/psychologists/') ? url.replace(/(\.\w+)$/, '-sq$1') : url);
  const ava = (s, size) => (s.psychologist.avatarUrl
    ? `<img class="ava-sq" style="--s:${size}px" src="${escapeHtml(thumb(s.psychologist.avatarUrl))}" alt="">`
    : UI.avatar(s.psychologist.name, null, size));

  /* ---------- Какие сессии на какой вкладке ---------- */
  const TABS = {
    upcoming: (s) => s.status === 'scheduled' && hoursLeft(s) > -1,
    // прошедшие – и те, что психолог ещё не отметил
    past: (s) => s.status === 'completed' || s.status === 'no_show' || (s.status === 'scheduled' && hoursLeft(s) <= -1),
    cancelled: (s) => s.status === 'cancelled',
  };
  const sorted = (tab) => sessions.filter(TABS[tab])
    .sort((a, b) => (tab === 'upcoming' ? startOf(a) - startOf(b) : startOf(b) - startOf(a)));

  /** Кто и когда отменил: из истории записи */
  const cancelInfo = (s) => {
    const ev = [...s.history].reverse().find((h) => h.type === 'cancelled');
    if (!ev) return null;
    const byClient = ev.by && ev.by.role === 'client';
    // Психолог отменил – деньги возвращаются всегда; клиент – если до начала было больше суток
    const refund = !byClient || (startOf(s) - new Date(ev.at)) / 3600000 >= 24;
    return { byClient, reason: ev.reason, refund };
  };

  /* ---------- Бейджи статуса ---------- */
  const statusBadge = (s) => {
    if (s.status === 'scheduled') {
      if (hoursLeft(s) <= -1) return '<span class="st st--muted">Ждёт отметки психолога</span>';
      return hoursLeft(s) < 24 ? '<span class="st st--wait">Меньше суток</span>' : '<span class="st st--info">Запланирована</span>';
    }
    if (s.status === 'completed') return '<span class="st st--ok">Состоялась</span>';
    if (s.status === 'no_show') return '<span class="st st--bad">Пропущена</span>';
    return `<span class="st st--muted">${cancelInfo(s)?.byClient ? 'Отменена вами' : 'Отменена психологом'}</span>`;
  };

  /* ---------- Кнопки действий у карточки ---------- */
  // Статус отзыва – прямоугольная плашка той же высоты, что и кнопки рядом
  const REVIEW_STATE = {
    pending: '<span class="sess-flag sess-flag--wait"><svg><use href="#i-clock"/></svg>Отзыв на&nbsp;проверке</span>',
    approved: '<span class="sess-flag sess-flag--ok"><svg><use href="#i-check"/></svg>Отзыв опубликован</span>',
    rejected: '<a href="client-reviews.html" class="sess-flag sess-flag--bad"><svg><use href="#i-alert"/></svg>Отзыв отклонён</a>',
  };
  const actions = (s) => {
    const chat = '<a href="client-chat.html" class="icon-btn" aria-label="Написать психологу" title="Написать психологу"><svg><use href="#i-chat"/></svg></a>';
    const again = `<a href="psychologist.html?id=${s.psychologist.id}" class="btn btn--line btn--xs">Записаться снова</a>`;
    if (s.status === 'scheduled') {
      if (!s.actions.cancel) return chat;
      return `<button type="button" class="btn btn--line btn--xs" data-act="move"><svg><use href="#i-move"/></svg>Перенести</button>
        <button type="button" class="btn btn--danger btn--xs" data-act="cancel">Отменить</button>${chat}`;
    }
    if (s.status === 'completed') {
      const review = s.review ? REVIEW_STATE[s.review.status]
        : s.actions.review ? '<button type="button" class="btn btn--primary btn--xs" data-act="review"><svg><use href="#i-star"/></svg>Оставить отзыв</button>' : '';
      return review + again;
    }
    return again;
  };

  /* ---------- История изменений ---------- */
  const HIST_TEXT = {
    created: () => 'Запись создана',
    rescheduled: (h) => `Перенесена: ${h.from.time}${h.to ? ` → ${h.to.date === h.from.date ? '' : `${shortDate(new Date(`${h.to.date}T00:00:00`))}, `}${h.to.time}` : ''}`,
    cancelled: () => 'Отменена',
    completed: () => 'Сессия состоялась',
    no_show: () => 'Отмечено: клиент не пришёл',
  };
  const histItem = (h) => {
    const at = new Date(h.at);
    const who = !h.by ? '' : h.by.role === 'client' ? 'Вы' : h.by.name;
    return `<li>${escapeHtml((HIST_TEXT[h.type] || (() => h.type))(h))}${h.reason ? ` · причина: «${escapeHtml(h.reason)}»` : ''}
      <small>${dayLabel(at)}, ${hhmm(h.at)}${who ? ` · ${escapeHtml(who)}` : ''}</small></li>`;
  };

  /* ---------- Карточка сессии ---------- */
  const card = (s, i) => {
    const d = dayOf(s);
    const off = s.status === 'cancelled' || s.status === 'no_show';
    const c = cancelInfo(s);
    let extra = '';
    if (s.note && s.status === 'scheduled') extra += `<div class="sess__note"><b>Ваш запрос:</b> ${escapeHtml(s.note)}</div>`;
    if (s.status === 'cancelled' && c) {
      extra += `<p class="sess__reason"><b>Причина:</b> ${escapeHtml(c.reason || '–')}${c.refund ? ' · деньги возвращены на&nbsp;карту' : ' · оплата не&nbsp;возвращается'}</p>`;
    }
    if (s.status === 'no_show') extra += '<p class="sess__reason">Вы не&nbsp;подключились к&nbsp;сессии – она не&nbsp;возвращается</p>';
    return `
      <article class="sess${off ? ' sess--off' : ''}" data-id="${s.id}" style="animation-delay:${Math.min(i, 6) * 40}ms">
        <div class="sess__date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</small></div>
        <div class="sess__main">
          <div class="sess__top"><span class="sess__time">${dayLabel(d)}, ${s.time}</span>${statusBadge(s)}</div>
          <div class="sess__who">
            ${ava(s, 36)}
            <span><b>${escapeHtml(s.psychologist.name)}</b><small>${escapeHtml(s.psychologist.headline || 'Психолог')} · ${escapeHtml(s.format.name)}, ${s.format.durationMin} мин</small></span>
          </div>
          ${extra}
        </div>
        <div class="sess__side">
          <span class="sess__price">${s.price} BYN</span>
          <div class="sess__btns">${actions(s)}</div>
        </div>
        <details class="sess__hist">
          <summary><svg><use href="#i-chevron"/></svg>История изменений</summary>
          <ul class="hist">${s.history.map(histItem).join('')}</ul>
        </details>
      </article>`;
  };

  /* ---------- Ближайшая сессия ---------- */
  const renderNext = () => {
    const el = $('[data-next]');
    const s = sorted('upcoming')[0];
    if (!s) { el.hidden = true; return; }
    el.hidden = false;
    // Подключиться можно за 10 минут до начала и до конца сессии
    const canJoin = hoursLeft(s) <= 10 / 60 && hoursLeft(s) > -50 / 60;
    const join = s.meetingUrl && canJoin
      ? `<a class="btn btn--primary btn--sm" href="${escapeHtml(s.meetingUrl)}" target="_blank" rel="noopener"><svg><use href="#i-video"/></svg>Подключиться</a>`
      : `<button type="button" class="btn btn--primary btn--sm" disabled title="Ссылка станет активной за 10 минут до начала"><svg><use href="#i-video"/></svg>Подключиться</button>`;
    el.innerHTML = `
      <span class="next__cap">Ближайшая сессия · ${leftText(s)}</span>
      <div class="next__title">${dayLabel(dayOf(s))}, ${s.time}</div>
      <div class="next__who">
        ${ava(s, 32)}
        <span><b>${escapeHtml(s.psychologist.name)}</b> · ${escapeHtml(s.format.name.toLowerCase())}, ${s.format.durationMin} мин</span>
      </div>
      <div class="next__btns" data-id="${s.id}">
        ${join}
        ${s.actions.reschedule ? '<button type="button" class="btn btn--line btn--sm" data-act="move"><svg><use href="#i-move"/></svg>Перенести</button>' : ''}
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

  /** Загрузить все записи заново (после любого действия – как на сервере) */
  const load = async () => {
    try {
      sessions = (await API.get('/appointments', { scope: 'all', as: 'client' })).items;
      render();
    } catch (err) {
      $('[data-list]').innerHTML = `<div class="empty-box"><b>Не удалось загрузить сессии</b><p>${escapeHtml(err.message)}</p></div>`;
    }
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
    const free = hoursLeft(s) >= 24;
    const reason = await UI.askReason({
      title: 'Отменить сессию?',
      text: `<b>${escapeHtml(s.psychologist.name)}</b>, ${dayLabel(dayOf(s))}, ${s.time}.<br>`
        + (free
          ? 'До начала больше суток – деньги вернутся на&nbsp;карту в&nbsp;течение 3&nbsp;дней.'
          : '<span class="note-warn"><svg><use href="#i-alert"/></svg><span>До начала меньше 24&nbsp;часов – по&nbsp;правилам сервиса оплата не&nbsp;возвращается.</span></span>'),
      confirm: 'Отменить сессию',
      danger: true,
      presets: ['Заболела', 'Изменились планы', 'Хочу сменить психолога', 'Финансовые причины'],
    });
    if (!reason) return;
    try {
      await API.patch(`/appointments/${s.id}`, { status: 'cancelled', reason });
      toast(free ? 'Сессия отменена, деньги вернутся на карту' : 'Сессия отменена');
    } catch (err) {
      toast(err.message, true);
    }
    load();
  };

  /* ---------- Перенос: выбор нового времени у того же психолога ---------- */
  const moveModal = document.getElementById('move-modal');
  const moveDays = moveModal.querySelector('[data-move-days]');
  const moveTimes = moveModal.querySelector('[data-move-times]');
  const moveReason = moveModal.querySelector('[data-move-reason]');
  const moveOk = moveModal.querySelector('[data-move-ok]');
  const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MOVE_DAYS = 14;
  let moving = null;            // какая сессия переносится
  let freeByDay = {};           // день (через сколько дней от сегодня) → свободные окна [{ id, time }]
  let pick = { k: null, slot: null };

  const renderMoveTimes = () => {
    const ts = pick.k === null ? [] : freeByDay[pick.k] || [];
    moveTimes.innerHTML = ts.length
      ? ts.map((x) => `<button type="button" class="pick-time${pick.slot && pick.slot.id === x.id ? ' is-active' : ''}" data-slot="${escapeHtml(String(x.id))}">${x.time}</button>`).join('')
      : '<p class="pick-empty">Выберите день</p>';
    moveOk.disabled = !pick.slot;
  };

  const openMove = async (s) => {
    moving = s;
    pick = { k: null, slot: null };
    freeByDay = {};
    try {
      const { slots } = await API.get(`/psychologists/${s.psychologist.id}/slots`, { from: isoDate(dateAt(0)), to: isoDate(dateAt(MOVE_DAYS - 1)) });
      slots.forEach((sl) => {
        const k = Math.round((new Date(`${sl.date}T00:00:00`) - dateAt(0)) / 86400000);
        (freeByDay[k] ||= []).push({ id: sl.id, time: sl.time });
      });
    } catch (err) {
      toast(err.status === 404 ? 'Психолог сейчас не принимает – напишите ему в чат' : err.message, true);
      return;
    }
    moveModal.querySelector('[data-move-text]').innerHTML = `Сейчас: <b>${dayLabel(dayOf(s))}, ${s.time}</b> · ${escapeHtml(s.psychologist.name)}`
      + (hoursLeft(s) < 24 ? '<span class="note-warn" style="margin-top:12px"><svg><use href="#i-alert"/></svg><span>До начала меньше суток – психолог может не&nbsp;согласиться на&nbsp;перенос.</span></span>' : '');
    moveDays.innerHTML = Array.from({ length: MOVE_DAYS }, (_, k) => {
      const d = dateAt(k);
      const n = (freeByDay[k] || []).length;
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
    pick = { k: Number(b.dataset.k), slot: null };
    moveDays.querySelectorAll('.pick-day').forEach((x) => x.classList.toggle('is-active', x === b));
    renderMoveTimes();
  });
  moveTimes.addEventListener('click', (e) => {
    const b = e.target.closest('.pick-time');
    if (!b) return;
    pick.slot = freeByDay[pick.k].find((x) => String(x.id) === b.dataset.slot);
    renderMoveTimes();
  });
  moveModal.addEventListener('click', (e) => {
    const b = e.target.closest('.preset');
    if (b) { moveReason.value = b.textContent; moveReason.closest('.f').classList.remove('is-error'); }
  });
  moveReason.addEventListener('input', () => moveReason.closest('.f').classList.remove('is-error'));
  moveOk.addEventListener('click', async () => {
    const reason = moveReason.value.trim();
    if (reason.length < 3) { moveReason.closest('.f').classList.add('is-error'); moveReason.focus(); return; }
    moveOk.disabled = true;
    try {
      const moved = await API.post(`/appointments/${moving.id}/reschedule`, { slotId: pick.slot.id, reason });
      moveModal.close();
      toast(`Сессия перенесена на ${dayLabel(new Date(`${moved.date}T00:00:00`))}, ${moved.time}`);
      load();
    } catch (err) {
      toast(err.message, true);
      moveOk.disabled = false;
    }
  });

  /* ---------- Отзыв после проведённой сессии ---------- */
  const review = async (s) => {
    const res = await UI.askReview({
      title: 'Отзыв о психологе',
      who: `<b>${escapeHtml(s.psychologist.name)}</b> · сессия ${shortDate(dayOf(s))}, ${s.time}`,
    });
    if (!res) return;
    try {
      await API.post('/reviews', { appointmentId: s.id, rating: res.rating, body: res.text || null, anonymous: res.anon });
      toast('Спасибо! Отзыв отправлен на проверку');
    } catch (err) {
      toast(err.message, true);
    }
    load();
  };

  /* ---------- Кнопки в карточках и в блоке «Ближайшая» ---------- */
  document.querySelector('.cab-main').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const s = sessions.find((x) => String(x.id) === id);
    ({ cancel, move: openMove, review })[btn.dataset.act](s);
  });

  load();
});
