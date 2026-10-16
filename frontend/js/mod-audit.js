/**
 * «Рядом» – панель модератора: журнал действий (mod-audit.html).
 * Кто, когда и что сделал: блокировки, решения по заявкам и отзывам, изменения ролей.
 * Данные пока из data.js (MOD_AUDIT). Позже: GET /api/admin/audit?type=…&q=… (таблица audit_log).
 */
const ACTIONS = {
  'user.block': { name: 'Блокировка', type: 'user', st: 'bad' },
  'user.unblock': { name: 'Разблокировка', type: 'user', st: 'ok' },
  'user.edit': { name: 'Правка профиля', type: 'user', st: 'muted' },
  'document.approve': { name: 'Заявка одобрена', type: 'document', st: 'ok' },
  'document.reject': { name: 'Заявка отклонена', type: 'document', st: 'bad' },
  'document.request': { name: 'Запрос документов', type: 'document', st: 'wait' },
  'review.approve': { name: 'Отзыв опубликован', type: 'review', st: 'ok' },
  'review.reject': { name: 'Отзыв отклонён', type: 'review', st: 'bad' },
  'review.hide': { name: 'Отзыв скрыт', type: 'review', st: 'bad' },
  'review.report_keep': { name: 'Жалоба отклонена', type: 'review', st: 'muted' },
  'role.grant': { name: 'Изменение ролей', type: 'role', st: 'info' },
  'role.permission': { name: 'Изменение прав', type: 'role', st: 'info' },
};

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, dateAt, dayLabel } = UI;
  const $ = (sel) => document.querySelector(sel);
  const log = MOD_AUDIT;
  const searchEl = $('[data-search]');
  let tab = 'all';
  const typeOf = (e) => (ACTIONS[e.action] || {}).type;

  const render = () => {
    ['all', 'user', 'document', 'review', 'role'].forEach((t) => {
      $(`[data-count="${t}"]`).textContent = log.filter((e) => t === 'all' || typeOf(e) === t).length;
    });
    const q = searchEl.value.trim().toLowerCase();
    const list = log.filter((e) => (tab === 'all' || typeOf(e) === tab)
      && (!q || `${e.object} ${e.details}`.toLowerCase().includes(q)));
    $('[data-rows]').innerHTML = list.length ? list.map((e) => {
      const a = ACTIONS[e.action] || { name: e.action, st: 'muted' };
      return `<tr class="row">
        <td class="jt__soft">${dayLabel(dateAt(e.k))}<br>${e.time}</td>
        <td><span class="st st--${a.st}">${a.name}</span></td>
        <td style="min-width:230px"><b>${escapeHtml(e.object)}</b></td>
        <td class="jt__soft" style="white-space:normal">${escapeHtml(e.details)}</td>
        <td class="jt__soft">${escapeHtml(e.who)}</td>
      </tr>`;
    }).join('') : '<tr class="jt-empty"><td colspan="5"><b>Записей нет</b>Попробуйте другой фильтр</td></tr>';
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; render(); });
  searchEl.addEventListener('input', render);
  render();
});
