/**
 * «Рядом» – записи клиентов в кабинете психолога (psy-sessions.html).
 * Журнал-таблица: записи группами по неделям, клик по строке раскрывает подробности.
 * Данные – из API:
 *   GET   /api/appointments?as=psychologist&scope=all                 – все записи с историей и доступными действиями
 *   PATCH /api/appointments/:id { status: 'completed' | 'no_show' }    – отметка после встречи
 *   PATCH /api/appointments/:id { status: 'cancelled', reason }        – отмена (клиенту – полный возврат)
 *   GET   /api/schedule/slots?from&to                                  – свои свободные окна для переноса
 *   POST  /api/appointments/:id/reschedule { slotId, reason }          – перенос
 */
document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, daysFrom, dayLabel, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  let sessions = [];
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const clientAva = (s, size) => avatar(s.client.name, s.client.avatarUrl, size);

  /* ---------- Время ---------- */
  const startOf = (s) => new Date(s.startsAt);
  const dayOf = (s) => new Date(`${s.date}T00:00:00`);
  const kOf = (s) => daysFrom(dayOf(s));                     // день от сегодня: 0 – сегодня, -1 – вчера
  const hoursLeft = (s) => (startOf(s) - new Date()) / 3600000;
  const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  /** Встреча уже началась, а психолог её ещё не отметил – сервер разрешает отметку */
  const needsMark = (s) => s.status === 'scheduled' && s.actions.markCompleted;

  /* ---------- Вкладки ---------- */
  const TABS = {
    upcoming: (s) => s.status === 'scheduled' && !needsMark(s),   // «ждут отметки» – отдельным блоком над вкладками
    past: (s) => s.status === 'completed' || s.status === 'no_show',
    cancelled: (s) => s.status === 'cancelled',
  };
  const byTime = (a, b) => startOf(a) - startOf(b);
  let tab = new URLSearchParams(location.search).get('tab');
  if (!TABS[tab]) tab = 'upcoming';
  const open = new Set();          // id записей с раскрытыми подробностями

  /* ---------- Подписи ---------- */
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  /** «сегодня», «завтра, сб», «пн, 19 окт» */
  const dateText = (s) => {
    const k = kOf(s);
    const d = dayOf(s);
    if (k === 0) return 'сегодня';
    if (k === 1) return `завтра, ${WD[d.getDay()]}`;
    if (k === -1) return 'вчера';
    return `${WD[d.getDay()]}, ${UI.shortDate(d)}`;
  };
  /** Номер недели относительно текущей: 0 – эта, 1 – следующая, -1 – прошлая */
  const weekOf = (k) => Math.floor((k + (dateAt(0).getDay() + 6) % 7) / 7);
  const WEEK_NAMES = { '-1': 'Прошлая неделя', 0: 'Эта неделя', 1: 'Следующая неделя' };
  const weekName = (w) => WEEK_NAMES[w] || (w > 1 ? 'Позже' : 'Раньше');

  /** Кто отменил и почему – из истории записи */
  const cancelInfo = (s) => {
    const ev = [...s.history].reverse().find((h) => h.type === 'cancelled');
    return ev ? { byMe: ev.by && ev.by.role === 'psychologist', reason: ev.reason } : { byMe: false, reason: null };
  };
  const statusBadge = (s) => {
    if (s.status === 'completed') return '<span class="st st--ok">Состоялась</span>';
    if (s.status === 'no_show') return '<span class="st st--bad">Не пришёл</span>';
    return `<span class="st st--muted">${cancelInfo(s).byMe ? 'Отменена вами' : 'Отменена клиентом'}</span>`;
  };

  /* ---------- История изменений ---------- */
  const dm = (date) => UI.shortDate(new Date(`${date}T00:00:00`));
  const HIST_TEXT = {
    created: () => 'Запись создана',
    rescheduled: (h) => `Перенесена: ${h.from.date === (h.to || h.from).date ? h.from.time : `${dm(h.from.date)}, ${h.from.time}`}`
      + (h.to ? ` → ${h.to.date === h.from.date ? '' : `${dm(h.to.date)}, `}${h.to.time}` : ''),
    cancelled: () => 'Отменена',
    completed: () => 'Сессия состоялась',
    no_show: () => 'Отмечено: клиент не пришёл',
  };
  const histItem = (h) => {
    const who = !h.by ? '' : h.by.role === 'psychologist' ? 'Вы' : h.by.name;
    return `<li>${escapeHtml((HIST_TEXT[h.type] || (() => h.type))(h))}${h.reason ? ` · причина: «${escapeHtml(h.reason)}»` : ''}
      <small>${dayLabel(new Date(h.at))}, ${hhmm(h.at)}${who ? ` · ${escapeHtml(who)}` : ''}</small></li>`;
  };
  const chatUrl = (s) => `psy-chat.html?with=${s.client.id}`;
  const chatBtn = (s) => `<a href="${chatUrl(s)}" class="icon-btn" aria-label="Написать клиенту" title="Написать клиенту"><svg><use href="#i-chat"/></svg></a>`;

  /* ---------- Строка журнала + раскрываемые подробности ---------- */
  const row = (s) => {
    const mark = needsMark(s);
    const isOpen = open.has(s.id);
    let acts;
    if (mark) {
      acts = `<button type="button" class="btn btn--primary btn--xs" data-act="done">Состоялась</button>
        <button type="button" class="btn btn--line btn--xs" data-act="noshow">Не&nbsp;пришёл</button>`;
    } else if (s.status === 'scheduled') {
      acts = `${s.actions.reschedule ? '<button type="button" class="btn btn--line btn--xs" data-act="move">Перенести</button>' : ''}${chatBtn(s)}`;
    } else {
      acts = statusBadge(s);
    }
    const cls = ['row'];
    if (mark) cls.push('row--mark');
    if (s.status === 'cancelled' || s.status === 'no_show') cls.push('row--off');
    if (isOpen) cls.push('is-open');

    let html = `
      <tr class="${cls.join(' ')}" data-id="${s.id}" aria-expanded="${isOpen}">
        <td class="jt__date">${dateText(s)}</td>
        <td class="jt__time">${s.time}</td>
        <td class="jt__who-cell"><span class="jt__who">${clientAva(s, 28)}${escapeHtml(s.client.name)}${s.nth === 1 && s.status !== 'cancelled' ? '<span class="nth nth--first">первая</span>' : ''}<svg class="chev"><use href="#i-chevron"/></svg></span></td>
        <td class="jt__muted jt__n-cell">${s.status === 'cancelled' ? '–' : s.nth}</td>
        <td class="jt__price">${s.price} BYN</td>
        <td class="jt__acts-cell"><div class="jt__acts">${acts}</div></td>
      </tr>`;
    if (isOpen) {
      const first = s.status === 'cancelled'
        ? `<h4>Причина отмены</h4><p>${escapeHtml(cancelInfo(s).reason || 'Причина не указана')}</p>`
        : `<h4>Запрос клиента</h4><p>${s.note ? escapeHtml(s.note) : 'Клиент не оставил комментарий к записи'}</p>`;
      const btns = s.actions.cancel
        ? `<div class="det__btns"><button type="button" class="btn btn--danger btn--xs" data-act="cancel">Отменить сессию</button>
           <a href="${chatUrl(s)}" class="btn btn--line btn--xs"><svg><use href="#i-chat"/></svg>Написать клиенту</a></div>` : '';
      html += `
      <tr class="det" data-id="${s.id}"><td colspan="6">
        <div class="det__grid">
          <div>${first}<p class="det__fmt">${escapeHtml(s.format.name)}, ${s.format.durationMin} мин</p>${btns}</div>
          <div><h4>История изменений</h4><ul class="hist">${s.history.map(histItem).join('')}</ul></div>
        </div>
      </td></tr>`;
    }
    return html;
  };
  const group = (title, list) => (list.length
    ? `<tr class="grp"><td colspan="6">${title}</td></tr>${list.map(row).join('')}` : '');

  /* ---------- Таблица ---------- */
  const EMPTY = {
    upcoming: ['Предстоящих записей нет', 'Откройте свободные окна в расписании – клиенты смогут записаться.'],
    past: ['Прошедших сессий нет', 'Здесь появятся встречи, которые уже состоялись.'],
    cancelled: ['Отменённых записей нет', 'Все встречи идут по плану.'],
  };
  const renderRows = () => {
    const list = sessions.filter(TABS[tab]);
    let html = '';
    if (tab === 'upcoming') {
      const next = list.sort(byTime);
      [...new Set(next.map((s) => Math.min(weekOf(kOf(s)), 2)))].forEach((w) => {
        html += group(weekName(w), next.filter((s) => Math.min(weekOf(kOf(s)), 2) === w));
      });
    } else {
      const sortedList = list.sort((a, b) => byTime(b, a));
      const bucket = (s) => Math.max(Math.min(weekOf(kOf(s)), 2), -2);
      [...new Set(sortedList.map(bucket))].forEach((w) => { html += group(weekName(w), sortedList.filter((s) => bucket(s) === w)); });
    }
    const [t, x] = EMPTY[tab];
    $('[data-rows]').innerHTML = html || `<tr class="jt-empty"><td colspan="6"><b>${t}</b>${x}</td></tr>`;
  };

  const renderSum = () => {
    const wd = (dateAt(0).getDay() + 6) % 7;
    const week = sessions.filter((s) => s.status !== 'cancelled' && kOf(s) >= -wd && kOf(s) <= 6 - wd).length;
    const income = sessions.filter((s) => s.status === 'completed' && kOf(s) >= -30).reduce((sum, s) => sum + s.price, 0);
    $('[data-sum]').innerHTML = `На неделе <b>${week}</b> · за 30 дней <b>${income} BYN</b>`;
    Object.keys(TABS).forEach((t) => { $(`[data-count="${t}"]`).textContent = sessions.filter(TABS[t]).length; });
  };

  /** Блок «Ждут отметки»: прошедшие сессии без отметки – виден на любой вкладке */
  const renderMarks = () => {
    const list = sessions.filter(needsMark).sort(byTime);
    $('[data-mark-wrap]').hidden = !list.length;
    $('[data-mark-title]').textContent = `${list.length} ${plural(list.length, 'сессия ждёт', 'сессии ждут', 'сессий ждут')} отметки`;
    $('[data-mark-rows]').innerHTML = list.map(row).join('');
    Session.setBadge('psy-sessions.html', list.length);    // значок в меню – сколько ждут отметки
  };

  const render = () => { renderSum(); renderMarks(); renderRows(); };

  /** Все записи с сервера (перенесённые сервер не отдаёт – они в истории новой записи) */
  const load = async () => {
    try {
      ({ items: sessions } = await API.get('/appointments', { as: 'psychologist', scope: 'all' }));
      render();
    } catch (err) {
      toast(`Не удалось загрузить записи: ${err.message}`, true);
    }
  };
  /** Запись изменилась – подменяем её в списке ответом сервера */
  const replace = (updated) => {
    sessions = sessions.map((x) => (x.id === updated.id ? updated : x));
    render();
  };

  /* ---------- Вкладки и раскрытие строк ---------- */
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
  // Клик по строке (не по кнопке) раскрывает или сворачивает подробности
  const toggleRow = (e) => {
    if (e.target.closest('button, a')) return;
    const tr = e.target.closest('tr.row');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    if (open.has(id)) open.delete(id); else open.add(id);
    renderMarks();
    renderRows();
  };
  $('[data-rows]').addEventListener('click', toggleRow);
  $('[data-mark-rows]').addEventListener('click', toggleRow);

  /* ---------- Отметка после встречи ---------- */
  const mark = async (s, status) => {
    try {
      replace(await API.patch(`/appointments/${s.id}`, { status }));
      toast(status === 'completed' ? 'Отмечено: сессия состоялась' : 'Отмечено: клиент не пришёл');
    } catch (err) {
      toast(err.message, true);
      if (err.status === 409) load();                      // запись уже изменилась – показать как есть
    }
  };

  /* ---------- Отмена психологом: клиенту всегда полный возврат ---------- */
  const cancel = async (s) => {
    const reason = await UI.askReason({
      title: 'Отменить сессию?',
      text: `<b>${escapeHtml(s.client.name)}</b>, ${dayLabel(dayOf(s))}, ${s.time}.<br>Клиенту вернётся вся оплата, он получит уведомление с&nbsp;вашей причиной.`
        + (hoursLeft(s) < 24 ? '<span class="note-warn" style="margin-top:12px"><svg><use href="#i-alert"/></svg><span>До начала меньше суток. Частые поздние отмены снижают позицию в&nbsp;каталоге.</span></span>' : ''),
      confirm: 'Отменить сессию',
      danger: true,
      presets: ['Заболела', 'Обучение или конференция', 'Семейные обстоятельства', 'Предложу другое время в чате'],
    });
    if (!reason) return;
    try {
      replace(await API.patch(`/appointments/${s.id}`, { status: 'cancelled', reason }));
      toast('Сессия отменена, клиент получит уведомление');
    } catch (err) {
      toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
      if (err.status === 409) load();
    }
  };

  /* ---------- Перенос на своё свободное окно ---------- */
  const moveModal = document.getElementById('move-modal');
  const moveDays = moveModal.querySelector('[data-move-days]');
  const moveTimes = moveModal.querySelector('[data-move-times]');
  const moveReason = moveModal.querySelector('[data-move-reason]');
  const moveOk = moveModal.querySelector('[data-move-ok]');
  const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MOVE_DAYS = 14;
  let moving = null;
  let free = {};                   // дата → свободные окна [{ id, time }]
  let pick = { date: null, slot: null };

  const renderMoveTimes = () => {
    const ts = pick.date ? free[pick.date] || [] : [];
    moveTimes.innerHTML = ts.length
      ? ts.map((x) => `<button type="button" class="pick-time${pick.slot && x.id === pick.slot.id ? ' is-active' : ''}" data-slot="${x.id}">${x.time}</button>`).join('')
      : `<p class="pick-empty">${Object.keys(free).length ? 'Выберите день' : 'Нет свободных окон на две недели – откройте их в расписании'}</p>`;
    moveOk.disabled = !pick.slot;
  };

  const openMove = async (s) => {
    moving = s;
    pick = { date: null, slot: null };
    free = {};
    try {
      const { slots } = await API.get('/schedule/slots', { from: isoDate(dateAt(0)), to: isoDate(dateAt(MOVE_DAYS - 1)) });
      slots.filter((x) => x.status === 'free' && new Date(x.startsAt) > new Date())
        .forEach((x) => { (free[x.date] ||= []).push({ id: x.id, time: x.time }); });
    } catch (err) {
      toast(`Не удалось загрузить расписание: ${err.message}`, true);
      return;
    }
    moveModal.querySelector('[data-move-text]').innerHTML = `<b>${escapeHtml(s.client.name)}</b> · сейчас ${dayLabel(dayOf(s))}, ${s.time}.<br>Клиент получит уведомление и&nbsp;сможет отказаться от&nbsp;нового времени.`;
    moveDays.innerHTML = Array.from({ length: MOVE_DAYS }, (_, k) => {
      const d = dateAt(k);
      return `<button type="button" class="pick-day" data-date="${isoDate(d)}"${free[isoDate(d)] ? '' : ' disabled'}>
        <small>${k === 0 ? 'Сегодня' : k === 1 ? 'Завтра' : WEEK[d.getDay()]}</small><b>${d.getDate()}</b></button>`;
    }).join('');
    moveModal.querySelector('[data-move-presets]').innerHTML = ['Заболела', 'Изменился мой график', 'Обучение или конференция']
      .map((r) => `<button type="button" class="preset">${r}</button>`).join('');
    moveReason.value = '';
    moveReason.closest('.f').classList.remove('is-error');
    renderMoveTimes();
    moveModal.showModal();
  };

  moveDays.addEventListener('click', (e) => {
    const b = e.target.closest('.pick-day');
    if (!b || b.disabled) return;
    pick = { date: b.dataset.date, slot: null };
    moveDays.querySelectorAll('.pick-day').forEach((x) => x.classList.toggle('is-active', x === b));
    renderMoveTimes();
  });
  moveTimes.addEventListener('click', (e) => {
    const b = e.target.closest('.pick-time');
    if (b) { pick.slot = free[pick.date].find((x) => String(x.id) === b.dataset.slot); renderMoveTimes(); }
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
      // Перенос – новая запись (старая уходит в её историю), поэтому список – заново
      open.delete(moving.id);
      await load();
      toast(`Перенесено на ${dayLabel(dayOf(moved))}, ${moved.time}, клиент получит уведомление`);
    } catch (err) {
      moveOk.disabled = false;
      toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
    }
  });

  /* ---------- Кнопки ---------- */
  document.querySelector('.cab-main').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const s = sessions.find((x) => x.id === Number(btn.closest('[data-id]').dataset.id));
    const act = btn.dataset.act;
    if (act === 'done') mark(s, 'completed');
    if (act === 'noshow') mark(s, 'no_show');
    if (act === 'cancel') cancel(s);
    if (act === 'move') openMove(s);
  });

  load();
});
