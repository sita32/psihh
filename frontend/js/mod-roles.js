/**
 * «Рядом» – панель модератора: роли и права (mod-roles.html).
 * Матрица «право × роль»: какие модули приложения доступны клиенту, психологу и модератору.
 * Данные – из API (таблицы roles, permissions, role_permissions):
 *   GET /api/admin/roles                                    – роли с правами и все права
 *   PUT /api/admin/roles/:code/permissions { permissions }  – права одной роли целиком
 * Сервер пишет изменения в журнал и сбрасывает права в кэше у всех пользователей.
 */
/* Права, которые нельзя снять с роли – иначе управлять доступом станет некому
   (снятие roles.assign с модератора запрещает и сервер) */
const LOCKED = { moderator: ['roles.assign', 'users.view'] };
/* Разделы приложения – коды модулей из таблицы permissions */
const MODULE_NAMES = {
  profile: 'Профиль', catalog: 'Каталог', appointments: 'Записи', schedule: 'Расписание', documents: 'Документы',
  chat: 'Чат', reviews: 'Отзывы', moderation: 'Модерация',
};

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, toast } = UI;
  const $ = (sel) => document.querySelector(sel);

  let roles = [];                // [{ code, name, description, permissions: [коды] }] – как сохранено
  let perms = [];                // [{ code, module, description }]
  let draft = {};                // рабочая копия: роль → Set кодов (до сохранения)

  const has = (role, code) => role.permissions.includes(code);
  /** Сколько клеток матрицы отличается от сохранённого состояния */
  const changes = () => roles.reduce((n, r) => n + perms.filter((p) => has(r, p.code) !== draft[r.code].has(p.code)).length, 0);

  const render = () => {
    $('table thead').innerHTML = `<tr><th>Право</th>${roles.map((r) => `<th title="${escapeHtml(r.description || '')}">${escapeHtml(r.name)}</th>`).join('')}</tr>`;
    const modules = [...new Set(perms.map((p) => p.module))];
    $('[data-rows]').innerHTML = modules.map((m) => `<tr class="grp"><td colspan="${roles.length + 1}">${MODULE_NAMES[m] || m}</td></tr>`
      + perms.filter((p) => p.module === m).map((p) => {
        const changed = roles.some((r) => has(r, p.code) !== draft[r.code].has(p.code));
        return `<tr class="${changed ? 'is-changed' : ''}">
          <td>${escapeHtml(p.description)}<small>${p.code}</small></td>
          ${roles.map((r) => {
            const locked = (LOCKED[r.code] || []).includes(p.code);
            return `<td><label class="toggle" title="${locked ? 'Это право нельзя снять' : `${escapeHtml(r.name)}: ${escapeHtml(p.description)}`}">
              <input type="checkbox" data-perm="${p.code}" data-role="${r.code}"${draft[r.code].has(p.code) ? ' checked' : ''}${locked ? ' disabled' : ''}
                aria-label="${escapeHtml(r.name)}: ${escapeHtml(p.description)}"><span class="toggle__sw"${locked ? ' style="opacity:.5"' : ''}></span></label></td>`;
          }).join('')}
        </tr>`;
      }).join('')).join('');
    const n = changes();
    $('[data-savebar]').classList.toggle('is-shown', n > 0);
    $('[data-save-text]').textContent = `Изменено ${n} ${plural(n, 'право', 'права', 'прав')}`;
  };

  /** Роли с сервера → таблица; черновик – как сохранено */
  const apply = (overview) => {
    ({ roles, permissions: perms } = overview);
    draft = Object.fromEntries(roles.map((r) => [r.code, new Set(r.permissions)]));
    render();
  };

  $('[data-rows]').addEventListener('change', (e) => {
    const box = e.target.closest('[data-perm]');
    if (!box) return;
    const set = draft[box.dataset.role];
    if (box.checked) set.add(box.dataset.perm); else set.delete(box.dataset.perm);
    render();
  });

  $('[data-reset]').addEventListener('click', () => apply({ roles, permissions: perms }));

  const saveBtn = $('[data-save]');
  saveBtn.addEventListener('click', async () => {
    // Каждая изменённая роль – одним запросом со всем набором её прав
    const changed = roles.filter((r) => perms.some((p) => has(r, p.code) !== draft[r.code].has(p.code)));
    saveBtn.disabled = true;
    let last = null;
    try {
      for (const r of changed) {
        last = await API.put(`/admin/roles/${r.code}/permissions`, { permissions: perms.map((p) => p.code).filter((c) => draft[r.code].has(c)) });
      }
      toast('Права ролей сохранены – действуют сразу');
    } catch (err) {
      last = null;                                  // часть ролей могла сохраниться – покажем, как на сервере
      toast(err.message, true);
    } finally {
      saveBtn.disabled = false;
    }
    try {
      apply(last || await API.get('/admin/roles'));
    } catch (err) { toast(err.message, true); }
  });

  API.get('/admin/roles').then(apply, (err) => toast(`Не удалось загрузить роли: ${err.message}`, true));
});
