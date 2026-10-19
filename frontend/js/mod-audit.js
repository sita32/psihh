/**
 * «Рядом» – панель модератора: журнал действий (mod-audit.html).
 * Кто, когда и что сделал: блокировки, решения по заявкам и отзывам, изменения ролей и прав.
 * Данные – из API: GET /api/admin/audit?page&limit (таблица audit_log, новые сверху).
 * Записи пишет сервер при каждом действии модератора; details – что именно изменилось.
 */
const ROLE_NAMES = { client: 'Клиент', psychologist: 'Психолог', moderator: 'Модератор' };
const ACTIONS = {
  'user.block': { name: 'Блокировка', type: 'user', st: 'bad' },
  'user.unblock': { name: 'Разблокировка', type: 'user', st: 'ok' },
  'user.edit': { name: 'Правка профиля', type: 'user', st: 'muted' },
  'verification.approve': { name: 'Заявка одобрена', type: 'document', st: 'ok' },
  'verification.reject': { name: 'Заявка отклонена', type: 'document', st: 'bad' },
  'review.approve': { name: 'Отзыв опубликован', type: 'review', st: 'ok' },
  'review.reject': { name: 'Отзыв отклонён', type: 'review', st: 'bad' },
  'review.hide': { name: 'Отзыв скрыт', type: 'review', st: 'bad' },
  'review.keep': { name: 'Жалоба отклонена', type: 'review', st: 'muted' },
  'role.grant': { name: 'Роль назначена', type: 'role', st: 'info' },
  'role.revoke': { name: 'Роль снята', type: 'role', st: 'wait' },
  'role.permissions': { name: 'Изменение прав', type: 'role', st: 'info' },
};
/* Поля профиля – для «Правка профиля» */
const FIELD_NAMES = { firstName: 'имя', lastName: 'фамилия', phone: 'телефон', birthDate: 'дата рождения', about: 'о себе' };

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, dayLabel, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  const searchEl = $('[data-search]');
  let log = [];
  let tab = 'all';
  const typeOf = (e) => (ACTIONS[e.action] || {}).type;
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const list = (codes) => codes.map((c) => `«${c}»`).join(', ');

  /** Над чем действие и что именно сделано – из details записи */
  const describe = (e) => {
    const d = e.details || {};
    const reason = (text) => (text ? `Причина: ${text}` : '');
    switch (e.action) {
      case 'user.block': return [d.user, reason(d.reason)];
      case 'user.unblock': return [d.user, d.reason ? `Доступ восстановлен (была причина: ${d.reason})` : 'Доступ восстановлен'];
      case 'user.edit': return [d.user, `Изменено: ${(d.fields || []).map((f) => FIELD_NAMES[f] || f).join(', ') || '–'}`];
      case 'role.grant': return [d.user, `Назначена роль «${ROLE_NAMES[d.role] || d.role}»`];
      case 'role.revoke': return [d.user, `Снята роль «${ROLE_NAMES[d.role] || d.role}»`];
      case 'role.permissions': return [`Роль «${d.role}»`, [d.added?.length ? `Выданы права ${list(d.added)}` : '', d.removed?.length ? `Сняты права ${list(d.removed)}` : ''].filter(Boolean).join('; ')];
      case 'verification.approve': return [`Заявка: ${d.psychologist}`, 'Статус специалиста подтверждён'];
      case 'verification.reject': return [`Заявка: ${d.psychologist}`, reason(d.comment)];
      case 'review.approve': return [`Отзыв: ${d.psychologist}`, `Опубликован${d.rating ? `, оценка ${d.rating}` : ''}`];
      case 'review.reject': return [`Отзыв: ${d.psychologist}`, reason(d.comment)];
      case 'review.hide': return [`Отзыв: ${d.psychologist}`, `Скрыт по жалобе «${d.report || ''}»: ${d.comment || ''}`];
      case 'review.keep': return [`Отзыв: ${d.psychologist}`, `Жалоба «${d.report || ''}» отклонена: ${d.comment || ''}`];
      default: return [e.entityType || '–', JSON.stringify(d)];
    }
  };

  const render = () => {
    ['all', 'user', 'document', 'review', 'role'].forEach((t) => {
      $(`[data-count="${t}"]`).textContent = log.filter((e) => t === 'all' || typeOf(e) === t).length;
    });
    const q = searchEl.value.trim().toLowerCase();
    const rows = log.filter((e) => (tab === 'all' || typeOf(e) === tab)
      && (!q || e.text.join(' ').toLowerCase().includes(q)));
    $('[data-rows]').innerHTML = rows.length ? rows.map((e) => {
      const a = ACTIONS[e.action] || { name: e.action, st: 'muted' };
      const [object, details] = e.text;
      return `<tr class="row">
        <td class="jt__soft">${dayLabel(e.createdAt)}<br>${hhmm(e.createdAt)}</td>
        <td><span class="st st--${a.st}">${a.name}</span></td>
        <td style="min-width:230px"><b>${escapeHtml(object || '–')}</b></td>
        <td class="jt__soft" style="white-space:normal">${escapeHtml(details || '')}</td>
        <td class="jt__soft">${escapeHtml(e.actor ? e.actor.name : 'система')}</td>
      </tr>`;
    }).join('') : '<tr class="jt-empty"><td colspan="5"><b>Записей нет</b>Попробуйте другой фильтр</td></tr>';
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; render(); });
  searchEl.addEventListener('input', render);

  /** Весь журнал – по 100 записей за запрос; фильтр и поиск – на странице */
  (async () => {
    try {
      const all = [];
      let page = 1, pages = 1;
      do {
        const res = await API.get('/admin/audit', { page, limit: 100 });
        all.push(...res.items);
        pages = res.pages;
        page += 1;
      } while (page <= pages);
      log = all.map((e) => ({ ...e, text: describe(e) }));
      render();
    } catch (err) {
      toast(`Не удалось загрузить журнал: ${err.message}`, true);
    }
  })();
});
