/**
 * «Рядом» – расписание психолога (psy-schedule.html).
 * Неделя в виде сетки «время × дни»: свободные окна, записи клиентов, закрытое время.
 * Данные пока из data.js (PSY_TEMPLATE, PSY_SESSIONS, PSY_CLIENTS).
 * Позже:
 *   GET    /api/schedule/slots?from=…&to=…
 *   POST   /api/schedule/slots          { startsAt }          – новое окно
 *   PATCH  /api/schedule/slots/:id      { status: 'blocked' | 'free' }
 *   DELETE /api/schedule/slots/:id
 * Проверяются только свои окна психолога: две его сессии не могут идти одновременно.
 * Окна других психологов не учитываются – это же правило в базе
 * (ограничение ex_slots_no_overlap в таблице schedule_slots, по psychologist_id).
 */
const SESSION_MIN = 50;          // длительность сессии, минут
const WEEKS_BACK = 1;            // сколько прошлых недель можно посмотреть
const WEEKS_AHEAD = 6;           // и сколько будущих

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, dayLabel, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const startOf = (k, time) => { const d = dateAt(k); d.setHours(...time.split(':').map(Number)); return d; };
  const isPast = (k, time) => startOf(k, time) < new Date();
  const clientName = (id) => PSY_CLIENTS.find((c) => c.id === id)?.name || 'Клиент';

  /* ---------- Хранилище окон: k (день от сегодня) → [{ time, status, session }] ---------- */
  const slots = {};
  /** Окна дня: при первом обращении собираются из шаблона недели и записей клиентов */
  const day = (k) => {
    if (slots[k]) return slots[k];
    const list = [];
    if (PSY_TEMPLATE.days.includes(dateAt(k).getDay())) {
      PSY_TEMPLATE.times.forEach((time, i) => {
        // для демо часть окон закрыта (личное время)
        const blocked = (k + 21 + i * 2) % 11 === 0;
        list.push({ time, status: blocked ? 'blocked' : 'free' });
      });
    }
    PSY_SESSIONS.filter((s) => s.k === k && s.status !== 'cancelled').forEach((s) => {
      const slot = list.find((x) => x.time === s.time);
      if (slot) Object.assign(slot, { status: 'booked', session: s });
      else list.push({ time: s.time, status: 'booked', session: s });
    });
    slots[k] = list.sort((a, b) => mins(a.time) - mins(b.time));
    return slots[k];
  };
  /** Окно, с которым пересекается новое время (сессии по 50 минут) */
  const overlap = (k, time) => day(k).find((x) => Math.abs(mins(x.time) - mins(time)) < SESSION_MIN);

  /* ---------- Неделя ---------- */
  let week = 0;                                     // 0 – текущая неделя
  let sel = 0;                                      // выбранный день (k) – на телефоне сетка показывает только его
  const mondayK = () => -((dateAt(0).getDay() + 6) % 7) + week * 7;
  const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  let fresh = null;                                 // только что добавленное окно – с анимацией

  const render = () => {
    const ks = Array.from({ length: 7 }, (_, i) => mondayK() + i);
    if (sel === null || !ks.includes(sel)) sel = ks.includes(0) ? 0 : ks[0];   // по умолчанию – сегодня
    const first = dateAt(ks[0]), last = dateAt(ks[6]);
    $('[data-week-label]').textContent = first.getMonth() === last.getMonth()
      ? `${first.getDate()} – ${last.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
      : `${first.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')} – ${last.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')}`;
    $('[data-week-prev]').disabled = week <= -WEEKS_BACK;
    $('[data-week-next]').disabled = week >= WEEKS_AHEAD;

    // Строки – все времена, которые есть хотя бы в одном дне недели
    const times = [...new Set(ks.flatMap((k) => day(k).map((x) => x.time)))].sort((a, b) => mins(a) - mins(b));

    let html = '<span></span>' + ks.map((k, i) => {
      const d = dateAt(k);
      const past = k < 0;
      return `<button type="button" class="sgrid__day${k === 0 ? ' is-today' : ''}${past ? ' is-past' : ''}${k === sel ? ' is-sel' : ''}" data-day="${k}"
        ${past ? 'disabled' : 'title="Закрыть все свободные окна дня"'}><small>${WEEK[i]}</small><b>${d.getDate()}</b></button>`;
    }).join('');
    times.forEach((t) => {
      html += `<span class="sgrid__t">${t}</span>`;
      ks.forEach((k) => {
        const s = day(k).find((x) => x.time === t);
        const past = isPast(k, t) ? ' is-past' : '';
        const isNew = fresh && fresh.k === k && fresh.time === t ? ' is-new' : '';
        const attrs = `data-k="${k}" data-time="${t}"`;
        const on = k === sel ? ' is-sel' : '';
        if (!s) html += `<button type="button" class="cell cell--empty${past}${on}" ${attrs} aria-label="Открыть окно ${t}"${past ? ' disabled' : ''}></button>`;
        else if (s.status === 'free') html += `<button type="button" class="cell cell--free${past}${isNew}${on}" ${attrs}>${past ? '' : 'свободно'}</button>`;
        else if (s.status === 'blocked') html += `<button type="button" class="cell cell--blocked${past}${on}" ${attrs}>закрыто</button>`;
        else html += `<button type="button" class="cell cell--booked${past ? ' is-done' : ''}${on}" ${attrs}>${escapeHtml(clientName(s.session.client))}</button>`;
      });
    });
    $('[data-grid]').innerHTML = html;
    fresh = null;

    // Лента дней (видна только на телефоне)
    $('[data-strip]').innerHTML = ks.map((k, i) => `<button type="button" class="sday__btn${k === 0 ? ' is-today' : ''}${k < 0 ? ' is-past' : ''}${k === sel ? ' is-sel' : ''}"
      data-pick="${k}" aria-pressed="${k === sel}"><small>${WEEK[i]}</small><b>${dateAt(k).getDate()}</b></button>`).join('');

    // Сводка по неделе – только окна, которые ещё впереди
    const all = ks.flatMap((k) => day(k).filter((x) => !isPast(k, x.time)));
    const booked = all.filter((x) => x.status === 'booked').length;
    const free = all.filter((x) => x.status === 'free').length;
    $('[data-week-sum]').innerHTML = `<b>${booked + free}</b> ${plural(booked + free, 'окно', 'окна', 'окон')} · занято <b>${booked}</b> · свободно <b>${free}</b>`;
  };

  /* ---------- Навигация по неделям ---------- */
  $('[data-week-prev]').addEventListener('click', () => { week -= 1; sel = null; render(); });
  $('[data-week-next]').addEventListener('click', () => { week += 1; sel = null; render(); });
  $('[data-week-today]').addEventListener('click', () => { week = 0; sel = 0; render(); });
  $('[data-strip]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick]');
    if (!btn) return;
    sel = Number(btn.dataset.pick);
    render();
  });

  /* ---------- Диалог окна ---------- */
  const slotModal = document.getElementById('slot-modal');
  let current = null;                               // { k, slot }
  const when = (k, time) => `${dayLabel(dateAt(k))}, ${time}`;

  const openSlot = (k, slot) => {
    current = { k, slot };
    const title = slotModal.querySelector('[data-slot-title]');
    const body = slotModal.querySelector('[data-slot-body]');
    const foot = slotModal.querySelector('[data-slot-foot]');
    if (slot.status === 'booked') {
      const s = slot.session;
      title.textContent = 'Запись клиента';
      body.innerHTML = `<dl class="slot-info">
          <div><dt>Клиент</dt><dd>${escapeHtml(clientName(s.client))}</dd></div>
          <div><dt>Когда</dt><dd>${when(k, slot.time)}</dd></div>
          <div><dt>Формат</dt><dd>${s.format}, 50 мин</dd></div>
          <div><dt>Стоимость</dt><dd>${s.price} BYN</dd></div>
        </dl>${s.note ? `<div class="sess__note"><b>Запрос клиента:</b> ${escapeHtml(s.note)}</div>` : ''}`;
      foot.innerHTML = `<a href="psy-chat.html" class="btn btn--line">Написать</a>
        <a href="psy-sessions.html" class="btn btn--primary">Открыть в&nbsp;записях</a>`;
    } else {
      const free = slot.status === 'free';
      title.textContent = `Окно · ${when(k, slot.time)}`;
      body.innerHTML = `<p class="modal__text">${free
        ? 'Окно свободно – клиенты видят его в&nbsp;вашем профиле и&nbsp;могут записаться.'
        : 'Окно закрыто – клиенты его не&nbsp;видят. Откройте снова, если время освободилось.'}</p>`;
      foot.innerHTML = `<button type="button" class="btn btn--danger" data-slot-act="delete"><svg><use href="#i-trash"/></svg>Удалить</button>
        ${free
          ? '<button type="button" class="btn btn--line" data-slot-act="block"><svg><use href="#i-lock"/></svg>Закрыть окно</button>'
          : '<button type="button" class="btn btn--primary" data-slot-act="open"><svg><use href="#i-unlock"/></svg>Открыть снова</button>'}`;
    }
    slotModal.showModal();
  };

  slotModal.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-slot-act]');
    if (!btn) return;
    const { k, slot } = current;
    const act = btn.dataset.slotAct;
    if (act === 'delete') { day(k).splice(day(k).indexOf(slot), 1); toast(`Окно ${slot.time} удалено`); }
    if (act === 'block') { slot.status = 'blocked'; toast(`Окно ${slot.time} закрыто`); }
    if (act === 'open') { slot.status = 'free'; toast(`Окно ${slot.time} снова открыто`); }
    slotModal.close();
    render();
  });

  /* ---------- Клики по сетке ---------- */
  $('[data-grid]').addEventListener('click', async (e) => {
    // Заголовок дня – закрыть все свободные окна этого дня
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn) {
      const k = Number(dayBtn.dataset.day);
      const free = day(k).filter((x) => x.status === 'free' && !isPast(k, x.time));
      if (!free.length) { toast('В этот день нет свободных окон', true); return; }
      const ok = await UI.confirmAction({
        title: 'Закрыть день?',
        text: `${dayLabel(dateAt(k))}: ${free.length} ${plural(free.length, 'свободное окно', 'свободных окна', 'свободных окон')} станут закрытыми. Записи клиентов останутся.`,
        confirm: 'Закрыть',
      });
      if (!ok) return;
      free.forEach((x) => { x.status = 'blocked'; });
      render();
      toast('Свободные окна дня закрыты');
      return;
    }

    const cell = e.target.closest('.cell');
    if (!cell || cell.disabled) return;
    const k = Number(cell.dataset.k), time = cell.dataset.time;
    const slot = day(k).find((x) => x.time === time);
    if (slot) {
      if (slot.status === 'booked' || !isPast(k, time)) openSlot(k, slot);
      return;
    }
    // Пустая клетка – открыть новое окно, если оно ни с чем не пересекается
    const busy = overlap(k, time);
    if (busy) { toast(`У вас уже есть окно в ${busy.time} – две ваши сессии пересекутся`, true); return; }
    day(k).push({ time, status: 'free' });
    day(k).sort((a, b) => mins(a.time) - mins(b.time));
    fresh = { k, time };
    render();
    toast(`Окно ${time} открыто`);
  });

  /* ---------- Диалог «Добавить окна» ---------- */
  const addModal = document.getElementById('add-modal');
  const chipsEl = addModal.querySelector('[data-add-chips]');
  const timeInput = addModal.querySelector('[data-add-time]');
  const errorEl = addModal.querySelector('[data-add-error]');
  let addTimes = [];

  const renderChips = () => {
    chipsEl.innerHTML = addTimes.map((t) => `<span class="add-chip">${t}<button type="button" data-del="${t}" aria-label="Убрать ${t}"><svg><use href="#i-x"/></svg></button></span>`).join('')
      || '<span class="f__note">Добавьте хотя бы одно время</span>';
  };
  const addTime = () => {
    const t = timeInput.value;
    if (!/^\d{2}:\d{2}$/.test(t)) return;
    const near = addTimes.find((x) => Math.abs(mins(x) - mins(t)) < SESSION_MIN);
    if (near) { errorEl.textContent = `${t} слишком близко к ${near}: ваша сессия длится 50 минут`; return; }
    errorEl.textContent = '';
    addTimes = [...addTimes, t].sort((a, b) => mins(a) - mins(b));
    renderChips();
  };
  addModal.querySelector('[data-add-time-btn]').addEventListener('click', addTime);
  timeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTime(); } });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (b) { addTimes = addTimes.filter((t) => t !== b.dataset.del); renderChips(); }
  });
  // При открытии диалог начинается с чистого листа
  addModal.addEventListener('toggle', () => {
    if (!addModal.open) return;
    addTimes = [];
    errorEl.textContent = '';
    addModal.querySelectorAll('[data-add-days] input').forEach((i) => { i.checked = false; });
    renderChips();
  });

  addModal.querySelector('[data-add-ok]').addEventListener('click', () => {
    const days = [...addModal.querySelectorAll('[data-add-days] input:checked')].map((i) => Number(i.value));
    const weeks = Number(addModal.querySelector('input[name="weeks"]:checked').value);
    if (!days.length) { errorEl.textContent = 'Выберите хотя бы один день недели'; return; }
    if (!addTimes.length) { errorEl.textContent = 'Добавьте хотя бы одно время'; return; }
    let added = 0, skipped = 0;
    for (let w = 0; w < weeks; w += 1) {
      for (let i = 0; i < 7; i += 1) {
        const k = mondayK() + w * 7 + i;
        if (!days.includes(dateAt(k).getDay())) continue;
        addTimes.forEach((t) => {
          if (isPast(k, t)) return;
          if (overlap(k, t)) { skipped += 1; return; }
          day(k).push({ time: t, status: 'free' });
          added += 1;
        });
        day(k).sort((a, b) => mins(a.time) - mins(b.time));
      }
    }
    addModal.close();
    render();
    toast(added
      ? `Добавлено ${added} ${plural(added, 'окно', 'окна', 'окон')}${skipped ? `, ${skipped} пропущено – у вас уже есть окна в это время` : ''}`
      : 'Новых окон нет – всё время уже занято или прошло', !added);
  });

  render();
});
