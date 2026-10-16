/**
 * «Рядом» – отзывы о психологе в его кабинете (psy-reviews.html).
 * Психолог видит опубликованные отзывы, может ответить на них
 * и пожаловаться модератору на некорректный отзыв.
 * Данные пока из data.js (REVIEWS, PSYCHOLOGISTS, CLIENT_REVIEWS).
 * Позже:
 *   GET    /api/psychologists/me/reviews
 *   PUT    /api/reviews/:id/reply   { text }     – ответ (виден в профиле)
 *   DELETE /api/reviews/:id/reply
 *   POST   /api/reviews/:id/report  { reason }   – жалоба модератору
 */
const ME = 1;                    // id психолога, который вошёл в кабинет

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, stars, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const p = PSYCHOLOGISTS.find((x) => x.id === ME);
  // Отзывы о себе: id – порядковый номер, новые сверху
  const reviews = REVIEWS.filter((r) => r.psy === ME)
    .map((r, i) => Object.assign(r, { id: r.id || i + 1 }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  let editing = null;            // id отзыва, на который сейчас пишется ответ

  /* ---------- Сводка рейтинга ---------- */
  const renderSum = () => {
    // Распределение оценок – по той же формуле, что на странице психолога
    const fives = Math.round(p.reviews * (p.rating - 4));
    const dist = { 5: fives, 4: p.reviews - fives - (p.rating < 4.8 ? 1 : 0), 3: p.rating < 4.8 ? 1 : 0, 2: 0, 1: 0 };
    const noReply = reviews.filter((r) => !r.reply).length;
    $('[data-sum]').classList.add('rsum--psy');
    $('[data-sum]').innerHTML = `
      <div class="rsum__big">
        <b>${p.rating.toFixed(1).replace('.', ',')}</b>
        ${stars(Math.round(p.rating), 18)}
        <small>${p.reviews} ${plural(p.reviews, 'отзыв', 'отзыва', 'отзывов')}</small>
      </div>
      <ul class="rsum__bars">${[5, 4, 3, 2, 1].map((n) => `
        <li><span>${n}</span><i><b style="width:${Math.round((dist[n] / p.reviews) * 100)}%"></b></i><small>${dist[n]}</small></li>`).join('')}
      </ul>
      <div class="rsum__side">
        <div><span>Без ответа</span><b>${noReply}</b></div>
        <div><span>С ответом</span><b>${reviews.length - noReply}</b></div>
        <div><span>За последние 30 дней</span><b>${reviews.filter((r) => UI.daysFrom(r.date) >= -30).length}</b></div>
      </div>`;

    // Отзывы клиентов, которые ещё проверяет модератор, психологу не видны – только их число
    const pending = CLIENT_REVIEWS.filter((r) => r.psy === ME && r.status === 'pending').length;
    const note = $('[data-pending]');
    note.hidden = !pending;
    note.innerHTML = `<svg><use href="#i-clock"/></svg><span>${pending} ${plural(pending, 'новый отзыв проходит', 'новых отзыва проходят', 'новых отзывов проходят')} проверку модератора – после публикации ${pending > 1 ? 'они появятся' : 'он появится'} здесь.</span>`;
  };

  /* ---------- Карточка отзыва ---------- */
  const card = (r) => {
    const reply = editing === r.id
      ? `<div class="rev__form">
          <label class="f"><span class="f__label">Ваш ответ <small>увидят все посетители профиля</small></span>
            <textarea class="f__area" maxlength="600" data-reply-text placeholder="Поблагодарите клиента или коротко прокомментируйте отзыв">${r.reply ? escapeHtml(r.reply) : ''}</textarea>
            <span class="f__error">Напишите хотя бы пару слов</span></label>
          <div class="rev__form-btns">
            <button type="button" class="btn btn--primary btn--xs" data-act="save">Опубликовать ответ</button>
            <button type="button" class="btn btn--line btn--xs" data-act="cancel">Отмена</button>
          </div>
        </div>`
      : r.reply
        ? `<div class="rev__reply">
            <div class="rev__reply-head"><b>Ваш ответ</b>
              <span><button type="button" class="rev__link" data-act="reply">Изменить</button><button type="button" class="rev__link rev__link--muted" data-act="unreply">Удалить</button></span></div>
            ${escapeHtml(r.reply)}</div>`
        : '';
    const foot = editing === r.id ? '' : `<div class="rev__foot">
        ${r.reply ? '' : '<button type="button" class="btn btn--line btn--xs" data-act="reply"><svg><use href="#i-chat"/></svg>Ответить</button>'}
        ${r.reported
          ? '<span class="rev__flag"><svg><use href="#i-flag"/></svg>Жалоба отправлена модератору</span>'
          : '<button type="button" class="btn btn--text btn--xs" data-act="report" style="height:36px;color:var(--ink-3)"><svg><use href="#i-flag"/></svg>Пожаловаться</button>'}
      </div>`;
    return `
      <article class="rev" data-id="${r.id}">
        <header class="rev__head">
          ${avatar(r.name, null, 44)}
          <span class="rev__who"><b>${escapeHtml(r.name)}</b><small>${UI.fullDate(r.date)} · ${r.sessions} ${plural(r.sessions, 'сессия', 'сессии', 'сессий')} вместе</small></span>
          ${stars(r.rating, 18)}
        </header>
        <p class="rev__text">${escapeHtml(r.text)}</p>
        ${reply}
        ${foot}
      </article>`;
  };

  /* ---------- Список и вкладки ---------- */
  let tab = 'all';
  const FILTER = { all: () => true, noreply: (r) => !r.reply, replied: (r) => !!r.reply };
  const render = () => {
    Object.keys(FILTER).forEach((t) => { $(`[data-count="${t}"]`).textContent = reviews.filter(FILTER[t]).length; });
    const list = reviews.filter(FILTER[tab]);
    $('[data-list]').innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>${tab === 'noreply' ? 'На все отзывы есть ответ' : 'Здесь пока пусто'}</b>
         <p>${tab === 'noreply' ? 'Отличная работа 🙂' : 'Отзывы появятся после проведённых сессий.'}</p></div>`;
    renderSum();
    const area = $('[data-reply-text]');
    if (area) area.focus();
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; editing = null; render(); });

  /* ---------- Действия ---------- */
  $('[data-list]').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const r = reviews.find((x) => x.id === Number(btn.closest('[data-id]').dataset.id));
    const act = btn.dataset.act;

    if (act === 'reply') { editing = r.id; render(); }
    if (act === 'cancel') { editing = null; render(); }
    if (act === 'save') {
      const area = $('[data-reply-text]');
      if (area.value.trim().length < 3) { area.closest('.f').classList.add('is-error'); area.focus(); return; }
      r.reply = area.value.trim();
      editing = null;
      render();
      toast('Ответ опубликован в профиле');
    }
    if (act === 'unreply') {
      const ok = await UI.confirmAction({ title: 'Удалить ответ?', text: 'Ответ исчезнет из вашего профиля. Отзыв клиента останется.', confirm: 'Удалить', danger: true });
      if (!ok) return;
      delete r.reply;
      render();
      toast('Ответ удалён');
    }
    if (act === 'report') {
      const reason = await UI.askReason({
        title: 'Пожаловаться на отзыв',
        text: 'Модератор проверит отзыв и скроет его, если он нарушает правила. Оценки, с которыми вы не согласны, не удаляются.',
        confirm: 'Отправить жалобу',
        presets: ['Оскорбления', 'Клиент не был на сессии', 'Личные данные в тексте', 'Реклама'],
      });
      if (!reason) return;
      r.reported = true;
      render();
      toast('Жалоба отправлена модератору');
    }
  });
  $('[data-list]').addEventListener('input', (e) => e.target.closest('.f')?.classList.remove('is-error'));

  render();
});
