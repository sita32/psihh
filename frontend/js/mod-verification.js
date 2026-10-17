/**
 * «Рядом» – панель модератора: заявки психологов (mod-verification.html).
 * Модератор открывает заявку, смотрит образование и документы, отмечает пункты проверки
 * и подтверждает статус специалиста или отклоняет заявку с комментарием.
 * Данные пока из data.js (MOD_APPLICATIONS, MOD_USERS, MOD_AUDIT).
 * Позже:
 *   GET   /api/admin/verification-requests?status=pending
 *   GET   /api/admin/documents/:id/file              – скан из хранилища
 *   PATCH /api/admin/verification-requests/:id       { status: 'approved' | 'rejected', comment }
 * Отклонение без комментария запрещено и в базе (CHECK в verification_requests).
 */
const MODERATOR = { id: 201, name: 'Ирина Литвин' };
const CHECKS = [
  'ФИО в документах совпадает с профилем',
  'Есть высшее психологическое образование',
  'Сканы читаются, печати и подписи на месте',
  'Описание и цена не нарушают правила сервиса',
];

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, dayLabel, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const apps = MOD_APPLICATIONS;
  const userOf = (a) => MOD_USERS.find((u) => u.id === a.user) || { name: a.name, email: '–' };
  const nowTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const audit = (action, object, details) => MOD_AUDIT.unshift({ k: 0, time: nowTime(), who: MODERATOR.name, action, object, details });
  const ava = (u, size) => avatar(u.name, u.photo ? `assets/img/psychologists/${u.photo}-sq.webp` : null, size);
  const ago = (k) => (k === 0 ? 'сегодня' : k === -1 ? 'вчера' : `${-k} ${plural(-k, 'день', 'дня', 'дней')} назад`);
  const STATUS = {
    pending: '<span class="st st--wait">На проверке</span>',
    approved: '<span class="st st--ok">Одобрена</span>',
    rejected: '<span class="st st--bad">Отклонена</span>',
  };

  let tab = 'pending';
  let current = null;            // открытая заявка
  const checked = new Set();     // отмеченные пункты проверки открытой заявки
  /** Почему кнопка «Подтвердить» неактивна – видно и на телефоне, где нет всплывающей подсказки */
  const hint = () => (checked.size === CHECKS.length ? ''
    : `Отмечено ${checked.size} из ${CHECKS.length} – отметьте все пункты, чтобы подтвердить`);

  /* ---------- Очередь ---------- */
  const listOf = (t) => apps.filter((a) => a.status === t).sort((a, b) => (t === 'pending' ? a.sent - b.sent : b.decided - a.decided));
  const renderList = () => {
    ['pending', 'approved', 'rejected'].forEach((t) => { $(`[data-count="${t}"]`).textContent = listOf(t).length; });
    const list = listOf(tab);
    $('[data-list]').innerHTML = list.length ? list.map((a) => {
      const u = userOf(a);
      return `<button type="button" class="vr-item${a === current ? ' is-active' : ''}" data-id="${a.id}">
        ${ava(u, 44)}
        <span><b>${escapeHtml(u.name)}</b><small>${escapeHtml(a.role)} · опыт ${a.exp} ${plural(a.exp, 'год', 'года', 'лет')}</small>
          <small>${tab === 'pending' ? `подана ${ago(a.sent)}` : `решение ${ago(a.decided)}`} · ${a.docs.length} ${plural(a.docs.length, 'документ', 'документа', 'документов')}</small></span>
      </button>`;
    }).join('') : '<div class="empty-box" style="padding:28px 16px"><b>Пусто</b><p>Новых заявок нет</p></div>';
  };

  /* ---------- Карточка заявки ---------- */
  const renderCard = () => {
    const card = $('[data-card]');
    if (!current) {
      card.innerHTML = `<div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>${tab === 'pending' ? 'Все заявки проверены' : 'Выберите заявку'}</b><p>${tab === 'pending' ? 'Новые заявки появятся здесь автоматически.' : 'Откройте заявку слева, чтобы посмотреть решение.'}</p></div>`;
      return;
    }
    const a = current;
    const u = userOf(a);
    const pending = a.status === 'pending';
    const ready = checked.size === CHECKS.length;
    let bottom = '';
    if (pending) {
      bottom = `
        <div class="vr-sec"><h3>Проверка модератора</h3>
          <div class="vr-check">${CHECKS.map((c, i) => `<label><input type="checkbox" data-check="${i}"${checked.has(i) ? ' checked' : ''}>${c}</label>`).join('')}</div>
          <p class="vr-hint" data-hint>${hint()}</p>
        </div>
        <div class="vr-actions">
          <button type="button" class="btn btn--primary" data-act="approve"${ready ? '' : ' disabled title="Сначала отметьте все пункты проверки"'}><svg><use href="#i-shield"/></svg>Подтвердить статус специалиста</button>
          <button type="button" class="btn btn--line" data-act="ask"><svg><use href="#i-chat"/></svg>Запросить документы</button>
          <button type="button" class="btn btn--danger" data-act="reject">Отклонить</button>
        </div>`;
    } else {
      bottom = a.status === 'approved'
        ? `<div class="vr-decision vr-decision--ok"><b>Статус подтверждён</b> ${dayLabel(dateAt(a.decided))} · ${escapeHtml(a.by)}. Профиль опубликован в&nbsp;каталоге.</div>`
        : `<div class="vr-decision vr-decision--bad"><b>Заявка отклонена</b> ${dayLabel(dateAt(a.decided))} · ${escapeHtml(a.by)}<br>${escapeHtml(a.comment)}</div>`;
    }
    card.innerHTML = `
      <header class="vr-card__head">
        ${ava(u, 56)}
        <div><h2>${escapeHtml(u.name)}</h2><p>${escapeHtml(u.email)} · заявка подана ${dayLabel(dateAt(a.sent))}</p></div>
        ${STATUS[a.status]}
      </header>
      <dl class="vr-facts">
        <div><dt>Опыт</dt><dd>${a.exp} ${plural(a.exp, 'год', 'года', 'лет')}</dd></div>
        <div><dt>Методы</dt><dd>${a.methods.join(', ') || '–'}</dd></div>
        <div><dt>Стоимость</dt><dd>${a.price} BYN</dd></div>
      </dl>
      <div class="vr-sec"><h3>О себе</h3><p>${escapeHtml(a.about)}</p></div>
      <div class="vr-sec"><h3>Образование</h3>
        <ul class="vr-edu">${a.edu.map((e) => `<li><b>${escapeHtml(e.title)}</b><span>${e.year}</span></li>`).join('')}</ul></div>
      <div class="vr-sec"><h3>Документы</h3>
        <div class="vr-docs">${a.docs.map((d, i) => `
          <div class="vr-doc">
            <span class="doc__ic">${escapeHtml(d.name.split('.').pop().toUpperCase())}</span>
            <span><b>${escapeHtml(d.name)}</b><small>${d.kind} · ${d.size}</small></span>
            <button type="button" class="btn btn--line btn--xs" data-doc="${i}"><svg><use href="#i-eye"/></svg>Открыть</button>
          </div>`).join('')}</div></div>
      ${bottom}`;
  };

  const select = (a) => { current = a; checked.clear(); renderList(); renderCard(); };
  const render = () => { renderList(); renderCard(); };

  UI.initTabs($('[data-tabs]'), (t) => { tab = t; select(listOf(t)[0] || null); });
  $('[data-list]').addEventListener('click', (e) => {
    const b = e.target.closest('.vr-item');
    if (b) select(apps.find((a) => a.id === Number(b.dataset.id)));
  });

  /* ---------- Действия с заявкой ---------- */
  const decide = (status, comment = '') => {
    const u = userOf(current);
    Object.assign(current, { status, decided: 0, by: MODERATOR.name, comment });
    if (status === 'approved') {
      if (u.id) u.pending = false;
      audit('document.approve', `Заявка: ${u.name}`, 'Статус специалиста подтверждён, профиль опубликован');
      toast(`${u.name}: статус специалиста подтверждён`);
    } else {
      audit('document.reject', `Заявка: ${u.name}`, comment);
      toast('Заявка отклонена, психолог получит комментарий');
    }
    select(listOf('pending')[0] || null);
  };

  $('[data-card]').addEventListener('change', (e) => {
    const box = e.target.closest('[data-check]');
    if (!box) return;
    if (box.checked) checked.add(Number(box.dataset.check)); else checked.delete(Number(box.dataset.check));
    const approve = $('[data-act="approve"]');
    approve.disabled = checked.size !== CHECKS.length;
    approve.title = approve.disabled ? 'Сначала отметьте все пункты проверки' : '';
    $('[data-hint]').textContent = hint();
  });

  $('[data-card]').addEventListener('click', async (e) => {
    const doc = e.target.closest('[data-doc]');
    if (doc) {
      const d = current.docs[Number(doc.dataset.doc)];
      const m = document.getElementById('doc-modal');
      m.querySelector('[data-doc-title]').textContent = d.kind;
      m.querySelector('[data-doc-name]').textContent = `${d.name} · ${d.size}`;
      m.showModal();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.act === 'approve') decide('approved');
    if (btn.dataset.act === 'reject') {
      const comment = await UI.askReason({
        title: 'Отклонить заявку?',
        text: 'Комментарий увидит психолог – объясните, что не так и что можно исправить.',
        confirm: 'Отклонить', danger: true,
        presets: ['Нет высшего психологического образования', 'Документы не читаются', 'ФИО в документах не совпадает', 'Недостаточно опыта практики'],
      });
      if (comment) decide('rejected', comment);
    }
    if (btn.dataset.act === 'ask') {
      const text = await UI.askReason({
        title: 'Запросить документы',
        text: 'Заявка останется на проверке, психолог получит сообщение и сможет дозагрузить файлы.',
        confirm: 'Отправить запрос',
        presets: ['Загрузите скан диплома целиком', 'Нужен документ о повышении квалификации', 'Скан нечитаемый – загрузите заново'],
      });
      if (!text) return;
      audit('document.request', `Заявка: ${userOf(current).name}`, text);
      toast('Запрос отправлен психологу');
    }
  });

  select(listOf('pending')[0] || null);
});
