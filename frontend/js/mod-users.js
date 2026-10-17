/**
 * «Рядом» – панель модератора: пользователи (mod-users.html).
 * Поиск и фильтр по роли, правка профиля и ролей, блокировка и разблокировка с причиной.
 * Данные пока из data.js (MOD_USERS, MOD_AUDIT).
 * Позже:
 *   GET   /api/admin/users?role=…&status=…&q=…
 *   PATCH /api/admin/users/:id            { name, roles }   – почту модератор не меняет
 *   POST  /api/admin/users/:id/block      { reason }   – запись в user_blocks
 *   POST  /api/admin/users/:id/unblock
 */
const MODERATOR = { id: 201, name: 'Ирина Литвин' };

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dateAt, dayLabel, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const users = MOD_USERS;
  const ROLE_NAMES = { client: 'Клиент', psychologist: 'Психолог', moderator: 'Модератор' };
  const nowTime = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  /** Запись в журнал действий (таблица audit_log) */
  const audit = (action, object, details) => MOD_AUDIT.unshift({ k: 0, time: nowTime(), who: MODERATOR.name, action, object, details });

  const userAva = (u, size) => avatar(u.name, u.photo ? `assets/img/psychologists/${u.photo}-sq.webp` : u.avatar ? `assets/img/avatars/${u.avatar}.webp` : null, size);
  /** «сегодня», «3 дня назад», «12 сент» */
  const ago = (k) => {
    if (k === 0) return 'сегодня';
    if (k === -1) return 'вчера';
    if (k > -7) return `${-k} ${plural(-k, 'день', 'дня', 'дней')} назад`;
    return UI.shortDate(dateAt(k));
  };

  /* ---------- Фильтры ---------- */
  let tab = 'all';
  const FILTER = {
    all: () => true,
    client: (u) => u.roles.includes('client'),
    psychologist: (u) => u.roles.includes('psychologist'),
    blocked: (u) => u.status === 'blocked',
  };
  const searchEl = $('[data-search]');
  const matches = (u) => {
    const q = searchEl.value.trim().toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  };

  /* ---------- Строка таблицы ---------- */
  const row = (u) => {
    const blocked = u.status === 'blocked';
    const self = u.id === MODERATOR.id;
    const status = blocked
      ? '<span class="st st--bad">Заблокирован</span>'
      : u.pending ? '<a href="mod-verification.html" class="st st--wait">Ждёт проверки</a>' : '<span class="st st--ok">Активен</span>';
    const blockBtn = self ? ''
      : blocked
        ? '<button type="button" class="icon-btn" data-act="unblock" aria-label="Разблокировать" title="Разблокировать"><svg><use href="#i-unlock"/></svg></button>'
        : '<button type="button" class="icon-btn" data-act="block" aria-label="Заблокировать" title="Заблокировать"><svg><use href="#i-ban"/></svg></button>';
    return `
      <tr class="row${blocked ? ' row--blocked' : ''}" data-id="${u.id}">
        <td><span class="u">${userAva(u, 36)}<span><b>${escapeHtml(u.name)}${self ? ' (вы)' : ''}</b><small>${escapeHtml(u.email)}</small></span></span></td>
        <td>${u.roles.map((r) => `<span class="role-b role-b--${r}">${ROLE_NAMES[r]}</span>`).join('')}</td>
        <td>${status}</td>
        <td class="jt__soft" data-label="Регистрация">${UI.shortDate(dateAt(u.reg))}</td>
        <td class="jt__soft" data-label="Был в сети">${ago(u.last)}</td>
        <td><div class="acts">
          <button type="button" class="icon-btn" data-act="edit" aria-label="Изменить" title="Изменить профиль и роли"><svg><use href="#i-edit"/></svg></button>
          ${blockBtn}
        </div></td>
      </tr>`;
  };

  const render = () => {
    Object.keys(FILTER).forEach((t) => { $(`[data-count="${t}"]`).textContent = users.filter(FILTER[t]).length; });
    const list = users.filter((u) => FILTER[tab](u) && matches(u));
    $('[data-rows]').innerHTML = list.length ? list.map(row).join('')
      : '<tr class="jt-empty"><td colspan="6"><b>Никого не нашли</b>Проверьте написание имени или почты</td></tr>';
  };
  UI.initTabs($('[data-tabs]'), (t) => { tab = t; render(); });
  searchEl.addEventListener('input', render);

  /* ---------- Диалог «Пользователь»: профиль, роли, история блокировок ---------- */
  const modal = document.getElementById('user-modal');
  let editing = null;
  const openEdit = (u) => {
    editing = u;
    modal.querySelector('[data-user-head]').innerHTML = `${userAva(u, 52)}<span><b>${escapeHtml(u.name)}</b><small>ID ${u.id} · с нами с ${UI.fullDate(dateAt(u.reg))}</small></span>`;
    modal.querySelector('[name="name"]').value = u.name;
    modal.querySelector('[name="email"]').value = u.email;
    modal.querySelectorAll('[data-user-roles] input').forEach((i) => {
      i.checked = u.roles.includes(i.value);
      i.disabled = u.id === MODERATOR.id && i.value === 'moderator';   // нельзя снять роль модератора с себя
    });
    modal.querySelectorAll('.f').forEach((f) => f.classList.remove('is-error'));
    const blocks = u.blocks || [];
    modal.querySelector('[data-user-blocks]').innerHTML = `<h4>История блокировок</h4>${blocks.length
      ? blocks.map((b) => `<p>${b.unblocked ? 'Был заблокирован' : 'Заблокирован'}: ${escapeHtml(b.reason)}<small>${dayLabel(dateAt(b.k))} · ${escapeHtml(b.by)}${b.unblocked ? ` · разблокирован ${dayLabel(dateAt(b.unblocked))}` : ''}</small></p>`).join('')
      : '<p>Блокировок не было</p>'}`;
    modal.showModal();
  };
  modal.querySelector('[data-user-save]').addEventListener('click', () => {
    const name = modal.querySelector('[name="name"]');
    let ok = true;
    if (!name.value.trim()) { name.closest('.f').classList.add('is-error'); ok = false; }
    const roles = [...modal.querySelectorAll('[data-user-roles] input:checked')].map((i) => i.value);
    if (!roles.length) { toast('Оставьте пользователю хотя бы одну роль', true); ok = false; }
    if (!ok) return;
    const added = roles.filter((r) => !editing.roles.includes(r));
    const removed = editing.roles.filter((r) => !roles.includes(r));
    Object.assign(editing, { name: name.value.trim(), roles });
    if (added.length || removed.length) {
      audit('role.grant', editing.name, [...added.map((r) => `назначена роль «${ROLE_NAMES[r]}»`), ...removed.map((r) => `снята роль «${ROLE_NAMES[r]}»`)].join(', '));
    } else {
      audit('user.edit', editing.name, 'Изменены данные профиля');
    }
    modal.close();
    render();
    toast('Изменения сохранены');
  });
  modal.addEventListener('input', (e) => e.target.closest('.f')?.classList.remove('is-error'));

  /* ---------- Блокировка и разблокировка ---------- */
  const block = async (u) => {
    const reason = await UI.askReason({
      title: `Заблокировать ${u.name}?`,
      text: 'Пользователь не сможет войти, его будущие записи будут отменены, а сессии – завершены. Причину увидит пользователь.',
      confirm: 'Заблокировать',
      danger: true,
      presets: ['Оскорбления в чате', 'Спам или реклама', 'Мошенничество', 'Фальшивые документы'],
    });
    if (!reason) return;
    u.status = 'blocked';
    u.blocks = [{ k: 0, by: MODERATOR.name, reason }, ...(u.blocks || [])];
    audit('user.block', u.name, `Причина: ${reason}`);
    render();
    toast(`${u.name} заблокирован(а)`);
  };
  const unblock = async (u) => {
    const ok = await UI.confirmAction({
      title: 'Разблокировать пользователя?',
      text: `${escapeHtml(u.name)} снова сможет входить, записываться и писать в&nbsp;чат.`,
      confirm: 'Разблокировать',
    });
    if (!ok) return;
    u.status = 'active';
    if (u.blocks?.[0]) u.blocks[0].unblocked = 0;
    audit('user.unblock', u.name, 'Доступ восстановлен');
    render();
    toast(`${u.name} разблокирован(а)`);
  };

  $('[data-rows]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const u = users.find((x) => x.id === Number(btn.closest('[data-id]').dataset.id));
    ({ edit: openEdit, block, unblock })[btn.dataset.act](u);
  });

  render();
});
