/**
 * «Рядом» – панель модератора: отзывы (mod-reviews.html).
 * Новые отзывы клиентов публикуются только после проверки; жалобы психологов
 * на опубликованные отзывы рассматриваются отдельно.
 * Данные – из API (каждое решение сервер пишет в журнал и пересчитывает рейтинг):
 *   GET   /api/admin/reviews?status=pending|approved|rejected
 *   GET   /api/admin/review-reports?status=pending|approved|rejected
 *   PATCH /api/admin/reviews/:id        { status: 'approved' | 'rejected', comment }
 *   PATCH /api/admin/review-reports/:id { decision: 'keep' | 'hide', comment } – комментарий обязателен
 */
/* Личные данные, которые нельзя публиковать: телефон и почта */
const PERSONAL = /(\+?\d[\d\s()-]{8,}\d)|([\w.-]+@[\w-]+\.[\w.]+)/g;
const DONE_DAYS = 30;            // «Решённые» – за последний месяц

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, dayLabel, stars, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  let items = [];                // карточки: { key, kind: 'new' | 'report', review, report?, result? }
  /** Маленькое фото: у демо-фото психологов есть квадратная версия -sq */
  const thumb = (url) => (url && url.includes('/img/psychologists/') ? url.replace(/(\.\w+)$/, '-sq$1') : url);
  const recent = (iso) => iso && UI.daysFrom(iso) >= -DONE_DAYS;

  /** Текст отзыва: телефоны и почты подсвечены */
  const highlight = (text) => escapeHtml(text).replace(PERSONAL, (m) => `<mark>${m}</mark>`);
  const hasPersonal = (text) => new RegExp(PERSONAL.source).test(text);

  /* ---------- Вкладки ---------- */
  const TABS = {
    new: (x) => x.kind === 'new' && !x.result,
    report: (x) => x.kind === 'report' && !x.result,
    done: (x) => !!x.result,
  };
  let tab = 'new';

  /* ---------- Карточка ---------- */
  const card = (x) => {
    const r = x.review;
    const p = r.psychologist;
    const text = r.body || '';
    const warn = !x.result && x.kind === 'new' && hasPersonal(text)
      ? '<p class="mr__warn"><svg><use href="#i-alert"/></svg>В тексте есть контакты – личные данные публиковать нельзя</p>' : '';
    const report = x.report
      ? `<div class="mr__report"><svg><use href="#i-flag"/></svg><span><b>Жалоба психолога</b> · ${dayLabel(x.report.createdAt)}: ${escapeHtml(x.report.reason)}</span></div>` : '';
    let btns = '';
    if (!x.result && x.kind === 'new') {
      btns = `<button type="button" class="btn btn--primary btn--xs" data-act="approve"${warn ? ' disabled title="Сначала автор должен убрать контакты"' : ''}><svg><use href="#i-check"/></svg>Опубликовать</button>
        <button type="button" class="btn btn--danger btn--xs" data-act="reject">Отклонить</button>`;
    } else if (!x.result) {
      btns = `<button type="button" class="btn btn--line btn--xs" data-act="keep">Оставить отзыв</button>
        <button type="button" class="btn btn--danger btn--xs" data-act="hide">Скрыть отзыв</button>`;
    }
    // Модератор видит настоящее имя и у анонимного отзыва – психолог и посетители видят «Аноним»
    const name = r.client ? r.client.name : r.author;
    const author = `${escapeHtml(name)}${r.anonymous && name !== 'Аноним' ? ' <small class="mr__anon">анонимно</small>' : ''}`;
    return `
      <article class="mr" data-key="${x.key}">
        <header class="mr__head">
          ${UI.avatar(p.name, thumb(p.avatarUrl), 40)}
          <span class="mr__who"><b>${author}</b> → ${escapeHtml(p.name)}
            <small>Отзыв ${dayLabel(r.createdAt)} · сессия ${UI.shortDate(r.sessionAt)} состоялась</small></span>
          ${stars(r.rating, 18)}
        </header>
        <p class="mr__text">${text ? highlight(text) : '<i>Оценка без текста</i>'}</p>
        ${warn}${report}
        ${x.result ? `<p class="mr__result">${x.result}</p>` : `<div class="mr__btns">${btns}</div>`}
      </article>`;
  };

  const EMPTY = { new: 'Новых отзывов нет', report: 'Жалоб нет', done: 'За месяц решений нет' };
  const render = () => {
    Object.keys(TABS).forEach((t) => { $(`[data-count="${t}"]`).textContent = items.filter(TABS[t]).length; });
    Session.setBadge('mod-reviews.html', items.filter((x) => !x.result).length);
    const list = items.filter(TABS[tab]).sort((a, b) => new Date(b.at) - new Date(a.at));
    $('[data-list]').innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>${EMPTY[tab]}</b><p>Всё проверено 🙂</p></div>`;
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; render(); });

  /** Очереди и решения за месяц – с сервера */
  const load = async () => {
    try {
      const get = (path, status) => API.get(path, { status }).then((res) => res.items);
      const [newRev, okRev, badRev, newRep, keptRep, hiddenRep] = await Promise.all([
        get('/admin/reviews', 'pending'), get('/admin/reviews', 'approved'), get('/admin/reviews', 'rejected'),
        get('/admin/review-reports', 'pending'), get('/admin/review-reports', 'rejected'), get('/admin/review-reports', 'approved'),
      ]);
      const on = (iso) => `${dayLabel(iso)}`;
      items = [
        ...newRev.map((r) => ({ key: `r${r.id}`, kind: 'new', review: r, at: r.createdAt })),
        ...newRep.map((rep) => ({ key: `p${rep.id}`, kind: 'report', review: rep.review, report: rep, at: rep.createdAt })),
        ...okRev.filter((r) => recent(r.moderatedAt)).map((r) => ({ key: `r${r.id}`, kind: 'new', review: r, at: r.moderatedAt,
          result: `Опубликован · ${on(r.moderatedAt)}` })),
        // Скрытый по жалобе отзыв показываем один раз – как решение по жалобе
        ...badRev.filter((r) => recent(r.moderatedAt) && !(r.report && r.report.status === 'approved')).map((r) => ({
          key: `r${r.id}`, kind: 'new', review: r, at: r.moderatedAt,
          result: `Отклонён: ${escapeHtml(r.moderationComment || '')} · ${on(r.moderatedAt)}` })),
        ...keptRep.filter((rep) => recent(rep.resolvedAt)).map((rep) => ({ key: `p${rep.id}`, kind: 'report', review: rep.review, report: rep,
          at: rep.resolvedAt, result: `Жалоба отклонена, отзыв оставлен: ${escapeHtml(rep.comment || '')} · ${on(rep.resolvedAt)}` })),
        ...hiddenRep.filter((rep) => recent(rep.resolvedAt)).map((rep) => ({ key: `p${rep.id}`, kind: 'report', review: rep.review, report: rep,
          at: rep.resolvedAt, result: `Отзыв скрыт: ${escapeHtml(rep.comment || '')} · ${on(rep.resolvedAt)}` })),
      ];
      render();
    } catch (err) {
      toast(`Не удалось загрузить отзывы: ${err.message}`, true);
    }
  };

  /* ---------- Решения ---------- */
  const send = async (path, body, done) => {
    try {
      await API.patch(path, body);
      toast(done);
    } catch (err) {
      toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
    }
    load();                                        // решение уехало во вкладку «Решённые» (или его уже приняли)
  };

  $('[data-list]').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const x = items.find((y) => y.key === btn.closest('[data-key]').dataset.key);
    const r = x.review;
    const act = btn.dataset.act;

    if (act === 'approve') {
      // Отзыв с контактами публиковать нельзя – сначала его должен исправить автор
      if (hasPersonal(r.body || '')) { toast('В отзыве есть контакты – отклоните его с просьбой убрать их', true); return; }
      send(`/admin/reviews/${r.id}`, { status: 'approved' }, 'Отзыв опубликован, рейтинг психолога пересчитан');
    }
    if (act === 'reject') {
      const comment = await UI.askReason({
        title: 'Отклонить отзыв?',
        text: 'Комментарий получит автор отзыва – он сможет исправить текст и отправить заново.',
        confirm: 'Отклонить', danger: true,
        presets: ['Уберите из текста личные контакты', 'Оскорбительные выражения', 'Отзыв не о работе специалиста', 'Реклама'],
      });
      if (comment) send(`/admin/reviews/${r.id}`, { status: 'rejected', comment }, 'Отзыв отклонён, автор получит комментарий');
    }
    if (act === 'keep') {
      const comment = await UI.askReason({
        title: 'Оставить отзыв?',
        text: 'Жалоба будет закрыта, отзыв останется в&nbsp;профиле психолога. Комментарий увидит психолог.',
        confirm: 'Оставить отзыв',
        presets: ['Отзыв описывает опыт клиента и не нарушает правила', 'Несогласие с оценкой – не повод скрывать отзыв'],
      });
      if (comment) send(`/admin/review-reports/${x.report.id}`, { decision: 'keep', comment }, 'Жалоба закрыта, отзыв оставлен');
    }
    if (act === 'hide') {
      const comment = await UI.askReason({
        title: 'Скрыть отзыв?',
        text: 'Отзыв исчезнет из профиля психолога, рейтинг будет пересчитан. Комментарий увидят автор и психолог.',
        confirm: 'Скрыть', danger: true,
        presets: ['Оскорбительные выражения', 'Клиент не был на сессии', 'Личные данные в тексте'],
      });
      if (comment) send(`/admin/review-reports/${x.report.id}`, { decision: 'hide', comment }, 'Отзыв скрыт, рейтинг пересчитан');
    }
  });

  load();
});
