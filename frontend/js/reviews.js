/**
 * «Рядом» – отзывы в кабинете клиента (client-reviews.html).
 * Данные пока из data.js (CLIENT_REVIEWS, CLIENT_SESSIONS, PSYCHOLOGISTS).
 * Позже:
 *   GET    /api/reviews?author=me
 *   POST   /api/reviews { appointmentId, rating, text, anonymous }
 *   PATCH  /api/reviews/:id  – правка (снова уходит на проверку)
 *   DELETE /api/reviews/:id
 */
document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, dateAt, shortDate, fullDate, stars, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const reviews = CLIENT_REVIEWS;
  const psyBy = (id) => PSYCHOLOGISTS.find((p) => p.id === id);

  /* ---------- Сессии, по которым ещё нет отзыва ---------- */
  const waiting = () => CLIENT_SESSIONS.filter((s) => s.status === 'completed' && !s.review)
    .sort((a, b) => b.k - a.k);

  const renderWaiting = () => {
    const list = waiting();
    $('[data-wait-wrap]').hidden = !list.length;
    $('[data-wait]').innerHTML = list.map((s) => {
      const p = psyBy(s.psy);
      return `
        <div class="rev-wait__item" data-session="${s.id}">
          <img class="ava-sq" style="--s:44px" src="assets/img/psychologists/${p.photo}-sq.webp" alt="">
          <span><b>${escapeHtml(p.name)}</b><small>Сессия ${shortDate(dateAt(s.k))}, ${s.time} · как всё прошло?</small></span>
          <button type="button" class="btn btn--primary btn--xs" data-act="new"><svg><use href="#i-star"/></svg>Оставить отзыв</button>
        </div>`;
    }).join('');
  };

  /* ---------- Мои отзывы ---------- */
  const STATUS = {
    pending: '<span class="st st--wait">На&nbsp;проверке у&nbsp;модератора</span>',
    approved: '<span class="st st--ok">Опубликован</span>',
    rejected: '<span class="st st--bad">Отклонён</span>',
  };

  const card = (r) => {
    const p = psyBy(r.psy);
    const btns = r.status === 'approved'
      ? `<a href="psychologist.html?id=${p.id}#reviews" class="btn btn--line btn--xs"><svg><use href="#i-eye"/></svg>Посмотреть на&nbsp;странице</a>`
      : `<button type="button" class="btn btn--line btn--xs" data-act="edit"><svg><use href="#i-edit"/></svg>${r.status === 'rejected' ? 'Исправить и&nbsp;отправить' : 'Изменить'}</button>
         <button type="button" class="btn btn--danger btn--xs" data-act="delete"><svg><use href="#i-trash"/></svg>Удалить</button>`;
    return `
      <article class="rev" data-id="${r.id}">
        <header class="rev__head">
          <img class="ava-sq" style="--s:44px" src="assets/img/psychologists/${p.photo}-sq.webp" alt="">
          <span class="rev__who"><b>${escapeHtml(p.name)}</b><small>${fullDate(dateAt(r.created))}${r.anon ? ' · анонимно' : ''}</small></span>
          ${stars(r.rating, 18)}
          ${STATUS[r.status]}
        </header>
        <p class="rev__text">${escapeHtml(r.text)}</p>
        ${r.status === 'rejected' ? `<div class="rev__mod"><svg><use href="#i-alert"/></svg><span><b>Комментарий модератора:</b> ${escapeHtml(r.modComment)}</span></div>` : ''}
        ${r.reply ? `<div class="rev__reply"><b>Ответ психолога</b>${escapeHtml(r.reply)}</div>` : ''}
        <div class="rev__foot">${btns}</div>
      </article>`;
  };

  let tab = 'all';
  const FILTER = { all: () => true, pending: (r) => r.status === 'pending', approved: (r) => r.status === 'approved', rejected: (r) => r.status === 'rejected' };

  const render = () => {
    Object.keys(FILTER).forEach((t) => { $(`[data-count="${t}"]`).textContent = reviews.filter(FILTER[t]).length; });
    const list = reviews.filter(FILTER[tab]).sort((a, b) => b.created - a.created);
    $('[data-list]').innerHTML = list.length ? list.map(card).join('') : `
      <div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>Здесь пока пусто</b>
      <p>Отзывы появятся после того, как вы оцените проведённые сессии.</p></div>`;
    renderWaiting();
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; render(); });

  /* ---------- Действия ---------- */
  document.querySelector('.cab-main').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    // Новый отзыв по сессии из блока «Ждут вашего отзыва»
    if (btn.dataset.act === 'new') {
      const s = CLIENT_SESSIONS.find((x) => x.id === Number(btn.closest('[data-session]').dataset.session));
      const p = psyBy(s.psy);
      const res = await UI.askReview({ title: 'Отзыв о психологе', who: `<b>${escapeHtml(p.name)}</b> · сессия ${shortDate(dateAt(s.k))}, ${s.time}` });
      if (!res) return;
      const id = Math.max(...reviews.map((r) => r.id)) + 1;
      reviews.push({ id, session: s.id, psy: p.id, created: 0, status: 'pending', ...res });
      s.review = id;
      render();
      toast('Спасибо! Отзыв отправлен на проверку');
      return;
    }

    const r = reviews.find((x) => x.id === Number(btn.closest('[data-id]').dataset.id));
    const p = psyBy(r.psy);

    // Правка: после изменения отзыв снова проверяет модератор
    if (btn.dataset.act === 'edit') {
      const res = await UI.askReview({ title: 'Изменить отзыв', who: `<b>${escapeHtml(p.name)}</b>`, initial: r });
      if (!res) return;
      Object.assign(r, res, { status: 'pending', modComment: undefined });
      render();
      toast('Отзыв отправлен на повторную проверку');
    }

    if (btn.dataset.act === 'delete') {
      const ok = await UI.confirmAction({
        title: 'Удалить отзыв?',
        text: `Отзыв о&nbsp;специалисте ${escapeHtml(p.name)} будет удалён. Оставить новый по&nbsp;этой сессии можно будет снова.`,
        confirm: 'Удалить', danger: true,
      });
      if (!ok) return;
      reviews.splice(reviews.indexOf(r), 1);
      const s = CLIENT_SESSIONS.find((x) => x.review === r.id);
      if (s) s.review = null;
      render();
      toast('Отзыв удалён');
    }
  });

  render();
});
