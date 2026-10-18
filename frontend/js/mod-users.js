/**
 * «Рядом» – панель модератора: пользователи (mod-users.html).
 * Поиск и фильтр по роли, правка имени и ролей, блокировка и разблокировка с причиной.
 * Данные – из API (каждое действие сервер пишет в журнал audit_log):
 *   GET   /api/admin/users?page&limit           – все пользователи (по 100 за запрос)
 *   GET   /api/admin/users/:id                  – карточка: профиль и история блокировок
 *   PATCH /api/admin/users/:id { firstName, lastName } – почту модератор не меняет
 *   PUT   /api/admin/users/:id/roles { roles }  – клиент и/или психолог
 *   POST  /api/admin/users/:id/block { reason } – запись в user_blocks, сессии входа завершаются
 *   POST  /api/admin/users/:id/unblock
 */
document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dayLabel, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  let users = [];
  let me = null;                                    // модератор, который вошёл
  const ROLE_NAMES = { client: 'Клиент', psychologist: 'Психолог', moderator: 'Модератор' };

  /** Маленькое фото: у демо-фото психологов есть квадратная версия -sq */
  const thumb = (url) => (url && url.includes('/img/psychologists/') ? url.replace(/(\.\w+)$/, '-sq$1') : url);
  const userAva = (u, size) => avatar(u.name, thumb(u.avatarUrl), size);
  /** «сегодня», «3 дня назад», «12 сент»; null – «не входил» */
  const ago = (iso) => {
    if (!iso) return 'не входил';
    const k = UI.daysFrom(iso);
    if (k === 0) return 'сегодня';
    if (k === -1) return 'вчера';
    if (k > -7) return `${-k} ${plural(-k, 'день', 'дня', 'дней')} назад`;
    return UI.shortDate(iso);
  };
  /** С модераторами и с собой действия недоступны – как на сервере */
  const canManage = (u) => u.id !== me?.id && !u.roles.includes('moderator');

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
    const self = u.id === me?.id;
    const status = blocked
      ? '<span class="st st--bad">Заблокирован</span>'
      : u.status === 'deleted' ? '<span class="st st--muted">Удалил аккаунт</span>'
        : u.verificationStatus === 'pending' ? '<a href="mod-verification.html" class="st st--wait">Ждёт проверки</a>' : '<span class="st st--ok">Активен</span>';
    const blockBtn = !canManage(u) ? ''
      : blocked
        ? '<button type="button" class="icon-btn" data-act="unblock" aria-label="Разблокировать" title="Разблокировать"><svg><use href="#i-unlock"/></svg></button>'
        : '<button type="button" class="icon-btn" data-act="block" aria-label="Заблокировать" title="Заблокировать"><svg><use href="#i-ban"/></svg></button>';
    return `
      <tr class="row${blocked ? ' row--blocked' : ''}" data-id="${u.id}">
        <td><span class="u">${userAva(u, 36)}<span><b>${escapeHtml(u.name)}${self ? ' (вы)' : ''}</b><small>${escapeHtml(u.email)}</small></span></span></td>
        <td>${u.roles.map((r) => `<span class="role-b role-b--${r}">${ROLE_NAMES[r]}</span>`).join('')}</td>
        <td>${status}</td>
        <td class="jt__soft" data-label="Регистрация">${UI.shortDate(u.createdAt)}</td>
        <td class="jt__soft" data-label="Был в сети">${ago(u.lastLoginAt)}</td>
        <td><div class="acts">
          ${canManage(u) ? '<button type="button" class="icon-btn" data-act="edit" aria-label="Изменить" title="Изменить профиль и роли"><svg><use href="#i-edit"/></svg></button>' : ''}
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
  const M = (n) => modal.querySelector(`[name="${n}"]`);
  let editing = null;                               // карточка пользователя с сервера
  const openEdit = async (u) => {
    try {
      editing = await API.get(`/admin/users/${u.id}`);
    } catch (err) { toast(err.message, true); return; }
    const p = editing.profile;
    modal.querySelector('[data-user-head]').innerHTML = `${userAva(editing, 52)}<span><b>${escapeHtml(editing.name)}</b><small>ID ${editing.id} · с нами с ${UI.fullDate(editing.createdAt)}</small></span>`;
    M('first').value = p ? p.firstName || '' : '';
    M('last').value = p ? p.lastName || '' : '';
    // Анкету психолог мог удалить – тогда имя править негде
    M('first').disabled = M('last').disabled = !p;
    modal.querySelector('[data-last-req]').hidden = !editing.roles.includes('psychologist');
    M('email').value = editing.email;
    modal.querySelectorAll('[data-user-roles] input').forEach((i) => { i.checked = editing.roles.includes(i.value); });
    modal.querySelectorAll('.f').forEach((f) => f.classList.remove('is-error'));
    const { asClient, asPsychologist } = editing.appointments;
    const blocks = editing.blocks || [];
    modal.querySelector('[data-user-blocks]').innerHTML = `
      <h4>Записи</h4><p>Как клиент – ${asClient}, как психолог – ${asPsychologist}</p>
      <h4>История блокировок</h4>${blocks.length
        ? blocks.map((b) => `<p>${b.unblockedAt ? 'Был заблокирован' : 'Заблокирован'}: ${escapeHtml(b.reason)}<small>${dayLabel(b.blockedAt)}${b.unblockedAt ? ` · разблокирован ${dayLabel(b.unblockedAt)}` : ''}</small></p>`).join('')
        : '<p>Блокировок не было</p>'}`;
    modal.showModal();
  };
  /** Пользователь изменился – строка таблицы по ответу сервера */
  const replace = (fresh) => {
    const { profile, appointments, blocks, ...row } = fresh;
    users = users.map((x) => (x.id === row.id ? row : x));
    render();
  };

  const saveBtn = modal.querySelector('[data-user-save]');
  saveBtn.addEventListener('click', async () => {
    const p = editing.profile;
    const first = M('first').value.trim(), last = M('last').value.trim();
    const roles = [...modal.querySelectorAll('[data-user-roles] input:checked')].map((i) => i.value);
    let ok = true;
    if (p && !first) { M('first').closest('.f').classList.add('is-error'); ok = false; }
    if (p && !last && roles.includes('psychologist') && editing.roles.includes('psychologist')) { M('last').closest('.f').classList.add('is-error'); ok = false; }
    if (!roles.length) { toast('Оставьте пользователю хотя бы одну роль', true); ok = false; }
    if (!ok) return;
    const namesChanged = p && (first !== (p.firstName || '') || last !== (p.lastName || ''));
    const rolesChanged = roles.length !== editing.roles.length || roles.some((r) => !editing.roles.includes(r));
    if (!namesChanged && !rolesChanged) { modal.close(); return; }
    saveBtn.disabled = true;
    try {
      if (namesChanged) await API.patch(`/admin/users/${editing.id}`, { firstName: first, lastName: last || null });
      replace(rolesChanged ? await API.put(`/admin/users/${editing.id}/roles`, { roles }) : await API.get(`/admin/users/${editing.id}`));
      modal.close();
      toast(rolesChanged ? 'Сохранено. Пользователю нужно будет войти заново' : 'Изменения сохранены');
    } catch (err) {
      const f = err.fields || {};
      if (f.firstName) M('first').closest('.f').classList.add('is-error');
      if (f.lastName) M('last').closest('.f').classList.add('is-error');
      toast(Object.values(f)[0] || err.message, true);
    } finally {
      saveBtn.disabled = false;
    }
  });
  modal.addEventListener('input', (e) => e.target.closest('.f')?.classList.remove('is-error'));

  /* ---------- Блокировка и разблокировка ---------- */
  const block = async (u) => {
    const reason = await UI.askReason({
      title: `Заблокировать ${u.name}?`,
      text: 'Пользователь сразу выйдет со всех устройств и не сможет войти; анкета психолога пропадёт из каталога. Причину увидит пользователь при входе.',
      confirm: 'Заблокировать',
      danger: true,
      presets: ['Оскорбления в чате', 'Спам или реклама', 'Мошенничество', 'Фальшивые документы'],
    });
    if (!reason) return;
    try {
      replace(await API.post(`/admin/users/${u.id}/block`, { reason }));
      toast(`${u.name} заблокирован(а)`);
    } catch (err) { toast(err.fields ? Object.values(err.fields)[0] : err.message, true); }
  };
  const unblock = async (u) => {
    const ok = await UI.confirmAction({
      title: 'Разблокировать пользователя?',
      text: `${escapeHtml(u.name)} снова сможет входить, записываться и писать в&nbsp;чат.`,
      confirm: 'Разблокировать',
    });
    if (!ok) return;
    try {
      replace(await API.post(`/admin/users/${u.id}/unblock`));
      toast(`${u.name} разблокирован(а)`);
    } catch (err) { toast(err.message, true); }
  };

  $('[data-rows]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const u = users.find((x) => x.id === Number(btn.closest('[data-id]').dataset.id));
    ({ edit: openEdit, block, unblock })[btn.dataset.act](u);
  });

  /** Все пользователи – по 100 за запрос; фильтры и поиск – на странице */
  const load = async () => {
    try {
      me = await Session.user();
      const all = [];
      let page = 1, pages = 1;
      do {
        const res = await API.get('/admin/users', { page, limit: 100 });
        all.push(...res.items);
        pages = res.pages;
        page += 1;
      } while (page <= pages);
      users = all;
      render();
    } catch (err) {
      toast(`Не удалось загрузить пользователей: ${err.message}`, true);
    }
  };
  load();
});
