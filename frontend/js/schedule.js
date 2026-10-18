/**
 * «Рядом» – расписание психолога (psy-schedule.html).
 * Неделя в виде сетки «время × дни»: свободные окна, записи клиентов, закрытое время.
 * Данные – из API (неделя загружается при переходе на неё):
 *   GET    /api/schedule/slots?from=…&to=…          – окна недели с записанными клиентами
 *   POST   /api/schedule/slots { slots: [{ date, time }] } – новые окна (одно или пачкой)
 *   PATCH  /api/schedule/slots/:id { status: 'blocked' | 'free' }
 *   DELETE /api/schedule/slots/:id
 *   POST   /api/schedule/block-day { date }         – закрыть все свободные окна дня
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

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = (k) => isoDate(dateAt(k));
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const startOf = (k, time) => { const d = dateAt(k); d.setHours(...time.split(':').map(Number)); return d; };
  const isPast = (k, time) => startOf(k, time) < new Date();

  /* ---------- Окна с сервера: дата → [окно API], по загруженным неделям ---------- */
  const slots = {};
  const loaded = new Set();                         // номера недель, которые уже пришли с сервера
  const day = (k) => slots[dateOf(k)] || [];
  /** Окно, с которым пересекается новое время (сессии по 50 минут) */
  const overlap = (k, time) => day(k).find((x) => Math.abs(mins(x.time) - mins(time)) < SESSION_MIN);

  /** Загрузить неделю (w – от текущей); force – заново, после изменений */
  const loadWeek = async (w, force = false) => {
    if (loaded.has(w) && !force) return;
    const monday = -((dateAt(0).getDay() + 6) % 7) + w * 7;
    const from = dateOf(monday), to = dateOf(monday + 6);
    const res = await API.get('/schedule/slots', { from, to });
    for (let i = 0; i < 7; i += 1) delete slots[dateOf(monday + i)];
    res.slots.forEach((x) => { (slots[x.date] ||= []).push(x); });
    loaded.add(w);
  };
  /** Показать неделю: загрузить (если нужно) и нарисовать; ошибки – во всплывающем сообщении */
  const show = async (force = false) => {
    try {
      await loadWeek(week, force);
    } catch (err) {
      toast(`Не удалось загрузить расписание: ${err.message}`, true);
    }
    render();
  };
  /** После изменений на сервере: прочие недели – загрузятся заново при переходе */
  const refresh = () => { loaded.clear(); return show(true); };

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
        else {
          // В клетке – только имя (фамилия не помещается), полностью – в подсказке
          const name = s.appointment ? s.appointment.client.name : 'Запись';
          html += `<button type="button" class="cell cell--booked${past ? ' is-done' : ''}${on}" ${attrs} title="${escapeHtml(name)}">${escapeHtml(name.split(' ')[0])}</button>`;
        }
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
  $('[data-week-prev]').addEventListener('click', () => { week -= 1; sel = null; show(); });
  $('[data-week-next]').addEventListener('click', () => { week += 1; sel = null; show(); });
  $('[data-week-today]').addEventListener('click', () => { week = 0; sel = 0; show(); });
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
      const a = slot.appointment || { client: { name: 'Клиент' }, format: { name: '–' } };
      const len = Math.round((new Date(slot.endsAt) - new Date(slot.startsAt)) / 60000);
      title.textContent = 'Запись клиента';
      body.innerHTML = `<dl class="slot-info">
          <div><dt>Клиент</dt><dd>${escapeHtml(a.client.name)}</dd></div>
          <div><dt>Когда</dt><dd>${when(k, slot.time)}</dd></div>
          <div><dt>Формат</dt><dd>${escapeHtml(a.format.name)}, ${len} мин</dd></div>
          ${a.price ? `<div><dt>Стоимость</dt><dd>${a.price} BYN</dd></div>` : ''}
        </dl>${a.note ? `<div class="sess__note"><b>Запрос клиента:</b> ${escapeHtml(a.note)}</div>` : ''}`;
      foot.innerHTML = `${a.client.id ? `<a href="psy-chat.html?with=${a.client.id}" class="btn btn--line">Написать</a>` : ''}
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

  slotModal.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-slot-act]');
    if (!btn) return;
    const { slot } = current;
    const act = btn.dataset.slotAct;
    btn.disabled = true;
    try {
      if (act === 'delete') {
        await API.del(`/schedule/slots/${slot.id}`);
        toast(`Окно ${slot.time} удалено`);
      } else {
        await API.patch(`/schedule/slots/${slot.id}`, { status: act === 'block' ? 'blocked' : 'free' });
        toast(act === 'block' ? `Окно ${slot.time} закрыто` : `Окно ${slot.time} снова открыто`);
      }
      slotModal.close();
    } catch (err) {
      // Например: окно уже занял клиент или с ним связана история записей
      btn.disabled = false;
      toast(err.message, true);
      if (err.status !== 409) return;
      slotModal.close();
    }
    show(true);
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
      try {
        const { blocked } = await API.post('/schedule/block-day', { date: dateOf(k) });
        toast(`Закрыто ${blocked} ${plural(blocked, 'окно', 'окна', 'окон')}`);
      } catch (err) {
        toast(err.message, true);
      }
      show(true);
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
    try {
      const { created } = await API.post('/schedule/slots', { slots: [{ date: dateOf(k), time }] });
      if (!created) { toast('Окно не добавлено: время уже прошло или пересекается с другим окном', true); return; }
      fresh = { k, time };
      toast(`Окно ${time} открыто`);
    } catch (err) {
      toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
    }
    await show(true);
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

  const addOk = addModal.querySelector('[data-add-ok]');
  addOk.addEventListener('click', async () => {
    const days = [...addModal.querySelectorAll('[data-add-days] input:checked')].map((i) => Number(i.value));
    const weeks = Number(addModal.querySelector('input[name="weeks"]:checked').value);
    if (!days.length) { errorEl.textContent = 'Выберите хотя бы один день недели'; return; }
    if (!addTimes.length) { errorEl.textContent = 'Добавьте хотя бы одно время'; return; }
    // Все окна – одним запросом; прошедшее время и пересечения сервер пропустит сам
    const items = [];
    for (let w = 0; w < weeks; w += 1) {
      for (let i = 0; i < 7; i += 1) {
        const k = mondayK() + w * 7 + i;
        if (!days.includes(dateAt(k).getDay())) continue;
        addTimes.forEach((t) => { if (!isPast(k, t)) items.push({ date: dateOf(k), time: t }); });
      }
    }
    if (!items.length) { errorEl.textContent = 'Всё это время уже прошло'; return; }
    addOk.disabled = true;
    try {
      const { created, skipped } = await API.post('/schedule/slots', { slots: items });
      const overlapped = skipped.filter((x) => x.reason === 'overlap').length;
      addModal.close();
      toast(created
        ? `Добавлено ${created} ${plural(created, 'окно', 'окна', 'окон')}${overlapped ? `, ${overlapped} пропущено – у вас уже есть окна в это время` : ''}`
        : 'Новых окон нет – всё время уже занято или прошло', !created);
      await refresh();
    } catch (err) {
      errorEl.textContent = err.fields ? Object.values(err.fields)[0] : err.message;
    } finally {
      addOk.disabled = false;
    }
  });

  show();
});
