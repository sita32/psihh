/**
 * «Рядом» – отзывы в кабинете клиента (client-reviews.html).
 * Данные – из API:
 *   GET    /api/reviews                                          – мои отзывы со статусом проверки
 *   GET    /api/appointments?scope=past                          – сессии, по которым ещё нет отзыва
 *   POST   /api/reviews { appointmentId, rating, body, anonymous }
 *   PATCH  /api/reviews/:id                                      – правка (снова уходит на проверку)
 *   DELETE /api/reviews/:id
 */
document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, shortDate, fullDate, stars, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  let reviews = [];
  let waitingList = [];

  /** Маленькое фото: у демо-фото психологов есть квадратная версия -sq */
  const thumb = (url) => (url && url.includes('/img/psychologists/') ? url.replace(/(\.\w+)$/, '-sq$1') : url);
  const ava = (psy) => (psy.avatarUrl
    ? `<img class="ava-sq" style="--s:44px" src="${escapeHtml(thumb(psy.avatarUrl))}" alt="">`
    : UI.avatar(psy.name, null, 44));
  const sessionText = (a) => `сессия ${shortDate(new Date(a.startsAt))}, ${a.time}`;

  /* ---------- Сессии, по которым ещё нет отзыва ---------- */
  const renderWaiting = () => {
    $('[data-wait-wrap]').hidden = !waitingList.length;
    $('[data-wait]').innerHTML = waitingList.map((a) => `
        <div class="rev-wait__item" data-session="${a.id}">
          ${ava(a.psychologist)}
          <span><b>${escapeHtml(a.psychologist.name)}</b><small>Сессия ${shortDate(new Date(a.startsAt))}, ${a.time} · как всё прошло?</small></span>
          <button type="button" class="btn btn--primary btn--xs" data-act="new"><svg><use href="#i-star"/></svg>Оставить отзыв</button>
        </div>`).join('');
  };

  /* ---------- Мои отзывы ---------- */
  const STATUS = {
    pending: '<span class="st st--wait">На&nbsp;проверке у&nbsp;модератора</span>',
    approved: '<span class="st st--ok">Опубликован</span>',
    rejected: '<span class="st st--bad">Отклонён</span>',
  };

  const card = (r) => {
    const btns = r.status === 'approved'
      ? `<a href="psychologist.html?id=${r.psychologist.id}#reviews" class="btn btn--line btn--xs"><svg><use href="#i-eye"/></svg>Посмотреть на&nbsp;странице</a>
         <button type="button" class="btn btn--line btn--xs" data-act="edit"><svg><use href="#i-edit"/></svg>Изменить</button>`
      : `<button type="button" class="btn btn--line btn--xs" data-act="edit"><svg><use href="#i-edit"/></svg>${r.status === 'rejected' ? 'Исправить и&nbsp;отправить' : 'Изменить'}</button>
         <button type="button" class="btn btn--danger btn--xs" data-act="delete"><svg><use href="#i-trash"/></svg>Удалить</button>`;
    return `
      <article class="rev" data-id="${r.id}">
        <header class="rev__head">
          ${ava(r.psychologist)}
          <span class="rev__who"><b>${escapeHtml(r.psychologist.name)}</b><small>${fullDate(r.createdAt)}${r.anonymous ? ' · анонимно' : ''}</small></span>
          ${stars(r.rating, 18)}
          ${STATUS[r.status]}
        </header>
        ${r.body ? `<p class="rev__text">${escapeHtml(r.body)}</p>` : ''}
        ${r.status === 'rejected' && r.moderationComment ? `<div class="rev__mod"><svg><use href="#i-alert"/></svg><span><b>Комментарий модератора:</b> ${escapeHtml(r.moderationComment)}</span></div>` : ''}
        ${r.reply ? `<div class="rev__reply"><b>Ответ психолога</b>${escapeHtml(r.reply.text)}</div>` : ''}
        <div class="rev__foot">${btns}</div>
      </article>`;
  };

  let tab = 'all';
  const FILTER = { all: () => true, pending: (r) => r.status === 'pending', approved: (r) => r.status === 'approved', rejected: (r) => r.status === 'rejected' };

  const render = () => {
    Object.keys(FILTER).forEach((t) => { $(`[data-count="${t}"]`).textContent = reviews.filter(FILTER[t]).length; });
    const list = reviews.filter(FILTER[tab]);   // сервер отдаёт от новых к старым
    $('[data-list]').innerHTML = list.length ? list.map(card).join('') : `
      <div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>Здесь пока пусто</b>
      <p>Отзывы появятся после того, как вы оцените проведённые сессии.</p></div>`;
    renderWaiting();
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; render(); });

  /** Отзывы и сессии без отзыва – заново с сервера */
  const load = async () => {
    try {
      const [mine, past] = await Promise.all([API.get('/reviews'), API.get('/appointments', { scope: 'past', as: 'client' })]);
      reviews = mine.items;
      waitingList = past.items.filter((a) => a.actions.review);
      render();
    } catch (err) {
      $('[data-list]').innerHTML = `<div class="empty-box"><b>Не удалось загрузить отзывы</b><p>${escapeHtml(err.message)}</p></div>`;
    }
  };

  /** Отправить и сообщить результат */
  const send = async (request, okText) => {
    try {
      await request();
      toast(okText);
    } catch (err) {
      toast(err.message, true);
    }
    load();
  };

  /* ---------- Действия ---------- */
  document.querySelector('.cab-main').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    // Новый отзыв по сессии из блока «Ждут вашего отзыва»
    if (btn.dataset.act === 'new') {
      const a = waitingList.find((x) => String(x.id) === btn.closest('[data-session]').dataset.session);
      const res = await UI.askReview({ title: 'Отзыв о психологе', who: `<b>${escapeHtml(a.psychologist.name)}</b> · ${sessionText(a)}` });
      if (!res) return;
      send(() => API.post('/reviews', { appointmentId: a.id, rating: res.rating, body: res.text || null, anonymous: res.anon }),
        'Спасибо! Отзыв отправлен на проверку');
      return;
    }

    const r = reviews.find((x) => String(x.id) === btn.closest('[data-id]').dataset.id);

    // Правка: после изменения отзыв снова проверяет модератор
    if (btn.dataset.act === 'edit') {
      const res = await UI.askReview({
        title: 'Изменить отзыв', who: `<b>${escapeHtml(r.psychologist.name)}</b>`,
        initial: { rating: r.rating, text: r.body || '', anon: r.anonymous },
      });
      if (!res) return;
      send(() => API.patch(`/reviews/${r.id}`, { rating: res.rating, body: res.text || null, anonymous: res.anon }),
        'Отзыв отправлен на повторную проверку');
    }

    if (btn.dataset.act === 'delete') {
      const ok = await UI.confirmAction({
        title: 'Удалить отзыв?',
        text: `Отзыв о&nbsp;специалисте ${escapeHtml(r.psychologist.name)} будет удалён. Оставить новый по&nbsp;этой сессии можно будет снова.`,
        confirm: 'Удалить', danger: true,
      });
      if (!ok) return;
      send(() => API.del(`/reviews/${r.id}`), 'Отзыв удалён');
    }
  });

  load();
});
