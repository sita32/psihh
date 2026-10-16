/**
 * «Рядом» – записи клиентов в кабинете психолога (psy-sessions.html).
 * Журнал-таблица: записи группами по неделям, клик по строке раскрывает подробности.
 * Данные пока из data.js (PSY_SESSIONS, PSY_CLIENTS, PSY_TEMPLATE).
 * Позже:
 *   GET   /api/appointments?role=psychologist&scope=upcoming|past|cancelled
 *   PATCH /api/appointments/:id { status: 'completed' | 'no_show' }    – отметка после встречи
 *   PATCH /api/appointments/:id { status: 'cancelled', reason }        – отмена (клиенту – полный возврат)
 *   POST  /api/appointments/:id/reschedule { slotId, reason }          – перенос
 */
document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, dayLabel, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const sessions = PSY_SESSIONS;
  const clientOf = (s) => PSY_CLIENTS.find((c) => c.id === s.client);
  const clientAva = (c, size) => avatar(c.name, c.avatar ? `assets/img/avatars/${c.avatar}.webp` : null, size);

  /* ---------- Время ---------- */
  const startOf = (s) => {
    const d = dateAt(s.k);
    const [h, m] = s.time.split(':').map(Number);
    d.setHours(h, m);
    return d;
  };
  const hoursLeft = (s) => (startOf(s) - new Date()) / 3600000;
  const nowTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  /** Сессия закончилась (50 минут после начала), но психолог её ещё не отметил */
  const needsMark = (s) => s.status === 'scheduled' && hoursLeft(s) < -50 / 60;

  /* ---------- Вкладки ---------- */
  const TABS = {
    upcoming: (s) => s.status === 'scheduled',            // вместе с «ждут отметки»
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
  const dateText = (k) => {
    const d = dateAt(k);
    if (k === 0) return 'сегодня';
    if (k === 1) return `завтра, ${WD[d.getDay()]}`;
    if (k === -1) return 'вчера';
    return `${WD[d.getDay()]}, ${UI.shortDate(d)}`;
  };
  /** Номер недели относительно текущей: 0 – эта, 1 – следующая, -1 – прошлая */
  const weekOf = (k) => Math.floor((k + (dateAt(0).getDay() + 6) % 7) / 7);
  const WEEK_NAMES = { '-1': 'Прошлая неделя', 0: 'Эта неделя', 1: 'Следующая неделя' };
  const weekName = (w) => WEEK_NAMES[w] || (w > 1 ? 'Позже' : 'Раньше');
  const statusBadge = (s) => {
    if (s.status === 'completed') return '<span class="st st--ok">Состоялась</span>';
    if (s.status === 'no_show') return '<span class="st st--bad">Не пришёл</span>';
    return `<span class="st st--muted">${s.cancel.by === 'psychologist' ? 'Отменена вами' : 'Отменена клиентом'}</span>`;
  };
  const histItem = (h) => `<li>${escapeHtml(h.text)}${h.reason ? ` · причина: «${escapeHtml(h.reason)}»` : ''}
    <small>${dayLabel(dateAt(h.k))}, ${h.time} · ${escapeHtml(h.by)}</small></li>`;
  const chatBtn = '<a href="psy-chat.html" class="icon-btn" aria-label="Написать клиенту" title="Написать клиенту"><svg><use href="#i-chat"/></svg></a>';

  /* ---------- Строка журнала + раскрываемые подробности ---------- */
  const row = (s) => {
    const c = clientOf(s);
    const mark = needsMark(s);
    const isOpen = open.has(s.id);
    let acts;
    if (mark) {
      acts = `<button type="button" class="btn btn--primary btn--xs" data-act="done">Состоялась</button>
        <button type="button" class="btn btn--line btn--xs" data-act="noshow">Не&nbsp;пришёл</button>`;
    } else if (s.status === 'scheduled') {
      acts = `<button type="button" class="btn btn--line btn--xs" data-act="move">Перенести</button>${chatBtn}`;
    } else {
      acts = statusBadge(s);
    }
    const cls = ['row'];
    if (mark) cls.push('row--mark');
    if (s.status === 'cancelled' || s.status === 'no_show') cls.push('row--off');
    if (isOpen) cls.push('is-open');

    let html = `
      <tr class="${cls.join(' ')}" data-id="${s.id}" aria-expanded="${isOpen}">
        <td class="jt__date">${dateText(s.k)}</td>
        <td class="jt__time">${s.time}</td>
        <td class="jt__who-cell"><span class="jt__who">${clientAva(c, 28)}${escapeHtml(c.name)}${s.nth === 1 ? '<span class="nth nth--first">первая</span>' : ''}<svg class="chev"><use href="#i-chevron"/></svg></span></td>
        <td class="jt__muted jt__n-cell">${s.nth}</td>
        <td class="jt__price">${s.price} BYN</td>
        <td class="jt__acts-cell"><div class="jt__acts">${acts}</div></td>
      </tr>`;
    if (isOpen) {
      const first = s.cancel
        ? `<h4>Причина отмены</h4><p>${escapeHtml(s.cancel.reason)}</p>`
        : `<h4>Запрос клиента</h4><p>${s.note ? escapeHtml(s.note) : 'Клиент не оставил комментарий к записи'}</p>`;
      const btns = s.status === 'scheduled' && !mark
        ? `<div class="det__btns"><button type="button" class="btn btn--danger btn--xs" data-act="cancel">Отменить сессию</button>
           <a href="psy-chat.html" class="btn btn--line btn--xs"><svg><use href="#i-chat"/></svg>Написать клиенту</a></div>` : '';
      html += `
      <tr class="det" data-id="${s.id}"><td colspan="6">
        <div class="det__grid">
          <div>${first}${btns}</div>
          <div><h4>История изменений</h4><ul class="hist">${s.hist.map(histItem).join('')}</ul></div>
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
      html += group('Ждут отметки', list.filter(needsMark).sort(byTime));
      const next = list.filter((s) => !needsMark(s)).sort(byTime);
      [...new Set(next.map((s) => Math.min(weekOf(s.k), 2)))].forEach((w) => {
        html += group(weekName(w), next.filter((s) => Math.min(weekOf(s.k), 2) === w));
      });
    } else {
      const sortedList = list.sort((a, b) => byTime(b, a));
      const bucket = (s) => Math.max(Math.min(weekOf(s.k), 2), -2);
      [...new Set(sortedList.map(bucket))].forEach((w) => { html += group(weekName(w), sortedList.filter((s) => bucket(s) === w)); });
    }
    const [t, x] = EMPTY[tab];
    $('[data-rows]').innerHTML = html || `<tr class="jt-empty"><td colspan="6"><b>${t}</b>${x}</td></tr>`;
  };

  const renderSum = () => {
    const wd = (dateAt(0).getDay() + 6) % 7;
    const week = sessions.filter((s) => s.status !== 'cancelled' && s.k >= -wd && s.k <= 6 - wd).length;
    const income = sessions.filter((s) => s.status === 'completed' && s.k >= -30).reduce((sum, s) => sum + s.price, 0);
    $('[data-sum]').innerHTML = `На неделе <b>${week}</b> · за 30 дней <b>${income} BYN</b>`;
    Object.keys(TABS).forEach((t) => { $(`[data-count="${t}"]`).textContent = sessions.filter(TABS[t]).length; });
  };

  const render = () => { renderSum(); renderRows(); };

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
  $('[data-rows]').addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    const tr = e.target.closest('tr.row');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    if (open.has(id)) open.delete(id); else open.add(id);
    renderRows();
  });

  /* ---------- Отметка после встречи ---------- */
  const mark = (s, status) => {
    s.status = status;
    s.hist.push({ k: 0, time: nowTime(), text: status === 'completed' ? 'Сессия состоялась' : 'Отмечено: клиент не пришёл', by: 'Вы' });
    render();
    toast(status === 'completed' ? 'Отмечено: сессия состоялась' : 'Отмечено: клиент не пришёл');
  };

  /* ---------- Отмена психологом: клиенту всегда полный возврат ---------- */
  const cancel = async (s) => {
    const c = clientOf(s);
    const reason = await UI.askReason({
      title: 'Отменить сессию?',
      text: `<b>${escapeHtml(c.name)}</b>, ${dayLabel(dateAt(s.k))}, ${s.time}.<br>Клиенту вернётся вся оплата, он получит уведомление с&nbsp;вашей причиной.`
        + (hoursLeft(s) < 24 ? '<span class="note-warn" style="margin-top:12px"><svg><use href="#i-alert"/></svg><span>До начала меньше суток. Частые поздние отмены снижают позицию в&nbsp;каталоге.</span></span>' : ''),
      confirm: 'Отменить сессию',
      danger: true,
      presets: ['Заболела', 'Обучение или конференция', 'Семейные обстоятельства', 'Предложу другое время в чате'],
    });
    if (!reason) return;
    s.status = 'cancelled';
    s.cancel = { by: 'psychologist', reason };
    s.hist.push({ k: 0, time: nowTime(), text: 'Отменена', by: 'Вы', reason });
    render();
    toast('Сессия отменена, клиент получит уведомление');
  };

  /* ---------- Перенос на своё свободное окно ---------- */
  const moveModal = document.getElementById('move-modal');
  const moveDays = moveModal.querySelector('[data-move-days]');
  const moveTimes = moveModal.querySelector('[data-move-times]');
  const moveReason = moveModal.querySelector('[data-move-reason]');
  const moveOk = moveModal.querySelector('[data-move-ok]');
  const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  let moving = null;
  let pick = { k: null, time: null };

  /** Свободные окна по шаблону недели, без уже занятых и прошедших */
  const freeOn = (k) => {
    if (!PSY_TEMPLATE.days.includes(dateAt(k).getDay())) return [];
    return PSY_TEMPLATE.times.filter((t) => !sessions.some((x) => x.status === 'scheduled' && x.k === k && x.time === t)
      && hoursLeft({ k, time: t }) > 1);
  };

  const renderMoveTimes = () => {
    const ts = pick.k === null ? [] : freeOn(pick.k);
    moveTimes.innerHTML = ts.length
      ? ts.map((t) => `<button type="button" class="pick-time${t === pick.time ? ' is-active' : ''}" data-time="${t}">${t}</button>`).join('')
      : '<p class="pick-empty">Выберите день</p>';
    moveOk.disabled = !pick.time;
  };

  const openMove = (s) => {
    moving = s;
    pick = { k: null, time: null };
    moveModal.querySelector('[data-move-text]').innerHTML = `<b>${escapeHtml(clientOf(s).name)}</b> · сейчас ${dayLabel(dateAt(s.k))}, ${s.time}.<br>Клиент получит уведомление и&nbsp;сможет отказаться от&nbsp;нового времени.`;
    moveDays.innerHTML = Array.from({ length: 14 }, (_, k) => {
      const d = dateAt(k);
      return `<button type="button" class="pick-day" data-k="${k}"${freeOn(k).length ? '' : ' disabled'}>
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
    pick = { k: Number(b.dataset.k), time: null };
    moveDays.querySelectorAll('.pick-day').forEach((x) => x.classList.toggle('is-active', x === b));
    renderMoveTimes();
  });
  moveTimes.addEventListener('click', (e) => {
    const b = e.target.closest('.pick-time');
    if (b) { pick.time = b.dataset.time; renderMoveTimes(); }
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
    toast(`Перенесено на ${to}, клиент получит уведомление`);
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

  render();
});
