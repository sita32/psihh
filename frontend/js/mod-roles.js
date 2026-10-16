/**
 * «Рядом» – панель модератора: роли и права (mod-roles.html).
 * Матрица «право × роль»: какие модули приложения доступны клиенту, психологу и модератору.
 * Данные пока из data.js (MOD_ROLES, MOD_PERMISSIONS, MOD_AUDIT) – те же коды, что в database/seed.sql.
 * Позже:
 *   GET /api/admin/roles                              – роли с правами
 *   PUT /api/admin/roles/:code/permissions { codes }  – таблица role_permissions
 */
const MODERATOR = { id: 201, name: 'Ирина Литвин' };
/* Права, которые нельзя снять с роли – иначе управлять доступом станет некому */
const LOCKED = { moderator: ['roles.assign', 'users.view'] };

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, toast } = UI;
  const $ = (sel) => document.querySelector(sel);

  const roles = MOD_ROLES;
  const perms = MOD_PERMISSIONS;
  // Рабочая копия: что сейчас включено в матрице (до сохранения)
  let draft = perms.map((p) => new Set(p.roles));
  const nowTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  /** Сколько клеток матрицы отличается от сохранённого состояния */
  const changes = () => perms.reduce((n, p, i) => n + roles.filter((r) => p.roles.includes(r.code) !== draft[i].has(r.code)).length, 0);

  const render = () => {
    const modules = [...new Set(perms.map((p) => p.module))];
    $('[data-rows]').innerHTML = modules.map((m) => `<tr class="grp"><td colspan="${roles.length + 1}">${m}</td></tr>`
      + perms.map((p, i) => {
        if (p.module !== m) return '';
        const changed = roles.some((r) => p.roles.includes(r.code) !== draft[i].has(r.code));
        return `<tr class="${changed ? 'is-changed' : ''}">
          <td>${escapeHtml(p.name)}<small>${p.code}</small></td>
          ${roles.map((r) => {
            const locked = (LOCKED[r.code] || []).includes(p.code);
            return `<td><label class="toggle" title="${locked ? 'Это право нельзя снять' : `${r.name}: ${escapeHtml(p.name)}`}">
              <input type="checkbox" data-i="${i}" data-role="${r.code}"${draft[i].has(r.code) ? ' checked' : ''}${locked ? ' disabled' : ''}
                aria-label="${r.name}: ${escapeHtml(p.name)}"><span class="toggle__sw"${locked ? ' style="opacity:.5"' : ''}></span></label></td>`;
          }).join('')}
        </tr>`;
      }).join('')).join('');
    const n = changes();
    $('[data-savebar]').classList.toggle('is-shown', n > 0);
    $('[data-save-text]').textContent = `Изменено ${n} ${plural(n, 'право', 'права', 'прав')}`;
  };

  $('[data-rows]').addEventListener('change', (e) => {
    const box = e.target.closest('[data-i]');
    if (!box) return;
    const set = draft[Number(box.dataset.i)];
    if (box.checked) set.add(box.dataset.role); else set.delete(box.dataset.role);
    render();
  });

  $('[data-reset]').addEventListener('click', () => { draft = perms.map((p) => new Set(p.roles)); render(); });
  $('[data-save]').addEventListener('click', () => {
    // В журнал – каждое изменение отдельной строкой
    perms.forEach((p, i) => roles.forEach((r) => {
      const was = p.roles.includes(r.code), now = draft[i].has(r.code);
      if (was !== now) {
        MOD_AUDIT.unshift({ k: 0, time: nowTime(), who: MODERATOR.name, action: 'role.permission', object: `Роль «${r.name}»`, details: `${now ? 'Выдано' : 'Снято'} право «${p.name}»` });
      }
    }));
    perms.forEach((p, i) => { p.roles = roles.map((r) => r.code).filter((c) => draft[i].has(c)); });
    render();
    toast('Права ролей сохранены');
  });

  render();
});
