/**
 * «Рядом» – панель модератора: отзывы (mod-reviews.html).
 * Новые отзывы клиентов публикуются только после проверки; жалобы психологов
 * на опубликованные отзывы рассматриваются отдельно.
 * Данные пока из data.js (MOD_REVIEWS, PSYCHOLOGISTS, MOD_AUDIT).
 * Позже:
 *   GET   /api/admin/reviews?status=pending | /api/admin/review-reports
 *   PATCH /api/admin/reviews/:id      { status: 'approved' | 'rejected', comment }
 *   PATCH /api/admin/review-reports/:id { decision: 'keep' | 'hide', comment }
 */
const MODERATOR = { id: 201, name: 'Ирина Литвин' };
/* Личные данные, которые нельзя публиковать: телефон и почта */
const PERSONAL = /(\+?\d[\d\s()-]{8,}\d)|([\w.-]+@[\w-]+\.[\w.]+)/g;

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, dateAt, dayLabel, stars, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const reviews = MOD_REVIEWS;
  const psyOf = (r) => PSYCHOLOGISTS.find((p) => p.id === r.psy);
  const nowTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const audit = (action, object, details) => MOD_AUDIT.unshift({ k: 0, time: nowTime(), who: MODERATOR.name, action, object, details });

  /** Текст отзыва: телефоны и почты подсвечены */
  const highlight = (text) => escapeHtml(text).replace(PERSONAL, (m) => `<mark>${m}</mark>`);
  const hasPersonal = (text) => new RegExp(PERSONAL.source).test(text);

  /* ---------- Вкладки ---------- */
  const TABS = {
    new: (r) => r.kind === 'new' && !r.result,
    report: (r) => r.kind === 'report' && !r.result,
    done: (r) => !!r.result,
  };
  let tab = 'new';

  /* ---------- Карточка ---------- */
  const card = (r) => {
    const p = psyOf(r);
    const warn = hasPersonal(r.text)
      ? '<p class="mr__warn"><svg><use href="#i-alert"/></svg>В тексте есть контакты – личные данные публиковать нельзя</p>' : '';
    const report = r.report
      ? `<div class="mr__report"><svg><use href="#i-flag"/></svg><span><b>Жалоба психолога</b> · ${dayLabel(dateAt(r.report.k))}: ${escapeHtml(r.report.reason)}</span></div>` : '';
    let btns = '';
    if (!r.result && r.kind === 'new') {
      btns = `<button type="button" class="btn btn--primary btn--xs" data-act="approve"${warn ? ' disabled title="Сначала автор должен убрать контакты"' : ''}><svg><use href="#i-check"/></svg>Опубликовать</button>
        <button type="button" class="btn btn--danger btn--xs" data-act="reject">Отклонить</button>`;
    } else if (!r.result) {
      btns = `<button type="button" class="btn btn--line btn--xs" data-act="keep">Оставить отзыв</button>
        <button type="button" class="btn btn--danger btn--xs" data-act="hide">Скрыть отзыв</button>`;
    }
    return `
      <article class="mr" data-id="${r.id}">
        <header class="mr__head">
          <img class="ava-sq" style="--s:40px" src="assets/img/psychologists/${p.photo}-sq.webp" alt="">
          <span class="mr__who"><b>${escapeHtml(r.client)}</b> → ${escapeHtml(p.name)}
            <small>Отзыв ${dayLabel(dateAt(r.k))} · сессия ${UI.shortDate(dateAt(r.session))} состоялась</small></span>
          ${stars(r.rating, 18)}
        </header>
        <p class="mr__text">${highlight(r.text)}</p>
        ${warn}${report}
        ${r.result ? `<p class="mr__result">${r.result}</p>` : `<div class="mr__btns">${btns}</div>`}
      </article>`;
  };

  const EMPTY = { new: 'Новых отзывов нет', report: 'Жалоб нет', done: 'Решённых пока нет' };
  const render = () => {
    Object.keys(TABS).forEach((t) => { $(`[data-count="${t}"]`).textContent = reviews.filter(TABS[t]).length; });
    const list = reviews.filter(TABS[tab]).sort((a, b) => b.k - a.k);
    $('[data-list]').innerHTML = list.length ? list.map(card).join('')
      : `<div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>${EMPTY[tab]}</b><p>Всё проверено 🙂</p></div>`;
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; render(); });

  /* ---------- Решения ---------- */
  const resolve = (r, result, action, details) => {
    r.result = `${result} · ${MODERATOR.name}, сегодня в ${nowTime()}`;
    audit(action, `Отзыв о ${psyOf(r).name}`, details);
    render();
  };

  $('[data-list]').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const r = reviews.find((x) => x.id === Number(btn.closest('[data-id]').dataset.id));
    const act = btn.dataset.act;

    if (act === 'approve') {
      // Отзыв с контактами публиковать нельзя – сначала его должен исправить автор
      if (hasPersonal(r.text)) { toast('В отзыве есть контакты – отклоните его с просьбой убрать их', true); return; }
      resolve(r, 'Опубликован', 'review.approve', 'Опубликован');
      toast('Отзыв опубликован, рейтинг психолога пересчитан');
    }
    if (act === 'reject') {
      const comment = await UI.askReason({
        title: 'Отклонить отзыв?',
        text: 'Комментарий получит автор отзыва – он сможет исправить текст и отправить заново.',
        confirm: 'Отклонить', danger: true,
        presets: ['Уберите из текста личные контакты', 'Оскорбительные выражения', 'Отзыв не о работе специалиста', 'Реклама'],
      });
      if (!comment) return;
      resolve(r, `Отклонён: ${escapeHtml(comment)}`, 'review.reject', `Причина: ${comment}`);
      toast('Отзыв отклонён, автор получит комментарий');
    }
    if (act === 'keep') {
      const ok = await UI.confirmAction({ title: 'Оставить отзыв?', text: 'Жалоба будет закрыта, отзыв останется в&nbsp;профиле психолога. Несогласие с&nbsp;оценкой – не&nbsp;повод скрывать отзыв.', confirm: 'Оставить' });
      if (!ok) return;
      resolve(r, 'Жалоба отклонена, отзыв оставлен', 'review.report_keep', 'Жалоба отклонена');
      toast('Жалоба закрыта, отзыв оставлен');
    }
    if (act === 'hide') {
      const comment = await UI.askReason({
        title: 'Скрыть отзыв?',
        text: 'Отзыв исчезнет из профиля психолога, рейтинг будет пересчитан. Автор получит комментарий.',
        confirm: 'Скрыть', danger: true,
        presets: ['Оскорбительные выражения', 'Клиент не был на сессии', 'Личные данные в тексте'],
      });
      if (!comment) return;
      resolve(r, `Скрыт: ${escapeHtml(comment)}`, 'review.hide', `Причина: ${comment}`);
      toast('Отзыв скрыт, рейтинг пересчитан');
    }
  });

  render();
});
