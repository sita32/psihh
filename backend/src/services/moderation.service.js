// Панель модератора: пользователи (просмотр, правка профиля, блокировка, роли),
// права ролей и журнал действий. Каждое действие модератора пишется в audit_log.
const { transaction } = require('../db/postgres');
const moderationRepository = require('../repositories/moderation.repository');
const userRepository = require('../repositories/user.repository');
const roleRepository = require('../repositories/role.repository');
const auditRepository = require('../repositories/audit.repository');
const catalogCache = require('../repositories/catalog-cache.repository');
const authService = require('./auth.service');
const accessService = require('./access.service');
const profileService = require('./profile.service');
const realtime = require('../realtime');
const v = require('./validation');
const { HttpError } = require('../errors');

const ASSIGNABLE_ROLES = ['client', 'psychologist']; // по заданию модератор назначает клиента и психолога
const fullName = (first, last) => [first, last].filter(Boolean).join(' ');

function userView(row) {
  return {
    id: row.id,
    email: row.email,
    name: fullName(row.first_name, row.last_name) || row.email.split('@')[0],
    roles: row.roles,
    status: row.status,
    avatarUrl: row.avatar_key ? `/${row.avatar_key}` : null,
    verificationStatus: row.verification_status || undefined,
    isPublished: row.is_published ?? undefined,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    block: row.block_id ? { id: row.block_id, reason: row.block_reason, blockedAt: row.blocked_at, until: row.blocked_until } : null,
  };
}

async function findTarget(id) {
  const row = Number.isSafeInteger(id) ? await moderationRepository.findUser(id) : null;
  if (!row) throw new HttpError(404, 'Пользователь не найден');
  return row;
}

// С модераторами и с собой эти действия недоступны
function assertCanManage(moderator, target) {
  if (target.id === moderator.id) throw new HttpError(403, 'Это действие нельзя применить к себе');
  if (target.roles.includes('moderator')) throw new HttpError(403, 'Модераторов этой панелью не изменить');
}

// ---------- Пользователи ----------

async function listUsers(query) {
  const fields = {};
  const page = v.intParam(query.page, 'page', { min: 1, max: 10000 }, fields) || 1;
  const limit = v.intParam(query.limit, 'limit', { min: 1, max: 100 }, fields) || 20;
  if (query.status && !['active', 'blocked', 'deleted'].includes(query.status)) fields.status = 'active, blocked или deleted';
  if (query.role && !['client', 'psychologist', 'moderator'].includes(query.role)) fields.role = 'client, psychologist или moderator';
  v.throwIfInvalid(fields);
  const { rows, total } = await moderationRepository.listUsers({
    q: v.text(query.q).slice(0, 100), role: query.role, status: query.status, limit, offset: (page - 1) * limit,
  });
  return { items: rows.map(userView), total, page, pages: Math.ceil(total / limit) };
}

async function getUser(id) {
  const row = await findTarget(id);
  const [blocks, appointments, profile] = await Promise.all([
    moderationRepository.listBlocks(row.id),
    moderationRepository.countAppointments(row.id),
    row.roles.some((r) => ASSIGNABLE_ROLES.includes(r)) ? profileService.getOwn({ id: row.id, roles: row.roles }) : null,
  ]);
  return {
    ...userView(row),
    profile: profile && profile.profile,
    appointments: { asClient: appointments.as_client, asPsychologist: appointments.as_psychologist },
    blocks: blocks.map((b) => ({ id: b.id, reason: b.reason, blockedAt: b.blocked_at, until: b.blocked_until,
      unblockedAt: b.unblocked_at, blockedBy: b.blocked_by })),
  };
}

// PATCH /api/admin/users/:id – правка профиля теми же правилами, что у самого пользователя (почта не меняется)
async function updateUser(moderator, id, body, ip) {
  const target = await findTarget(id);
  assertCanManage(moderator, target);
  if (body && body.email !== undefined) throw new HttpError(422, 'Почту модератор не меняет', { fields: { email: 'Меняет только сам пользователь' } });
  const result = await profileService.updateOwn({ id: target.id, roles: target.roles }, body);
  await auditRepository.log({ actorId: moderator.id, action: 'user.edit', entityType: 'user', entityId: target.id, ip,
    details: { user: userView(target).name, fields: Object.keys(body || {}) } });
  return result;
}

// POST /api/admin/users/:id/block { reason, until? } – блокировка: все сессии завершаются сразу
async function blockUser(moderator, id, body, ip) {
  const target = await findTarget(id);
  assertCanManage(moderator, target);
  if (target.status === 'blocked') throw new HttpError(409, 'Пользователь уже заблокирован', { code: 'ALREADY_BLOCKED' });
  const fields = {};
  const reason = v.requiredText(body && body.reason, 'reason', 500, fields, 'Укажите причину блокировки');
  if (reason === undefined && !fields.reason) fields.reason = 'Укажите причину блокировки';
  let until = null;
  if (body && body.until) {
    if (!v.isIsoDate(body.until) || body.until <= new Date().toISOString().slice(0, 10)) fields.until = 'Дата в будущем, ГГГГ-ММ-ДД';
    else until = `${body.until}T00:00:00Z`;
  }
  v.throwIfInvalid(fields);

  await transaction(async (db) => {
    await moderationRepository.createBlock(target.id, moderator.id, reason, until, db);
    await auditRepository.log({ actorId: moderator.id, action: 'user.block', entityType: 'user', entityId: target.id, ip,
      details: { user: userView(target).name, reason, until: body && body.until } }, db);
  });
  await authService.revokeAllSessions(target.id);              // refresh-токены и действующие access-токены
  realtime.emit('disconnect-user', { userId: target.id });     // закрыть открытые чаты
  if (target.roles.includes('psychologist')) await catalogCache.invalidate(); // анкета пропадёт из каталога
  return getUser(target.id);
}

async function unblockUser(moderator, id, ip) {
  const target = await findTarget(id);
  assertCanManage(moderator, target);
  if (!target.block_id) throw new HttpError(409, 'Пользователь не заблокирован', { code: 'NOT_BLOCKED' });
  await transaction(async (db) => {
    await userRepository.liftBlock(target.block_id, moderator.id, db);
    await auditRepository.log({ actorId: moderator.id, action: 'user.unblock', entityType: 'user', entityId: target.id, ip,
      details: { user: userView(target).name, reason: target.block_reason } }, db);
  });
  if (target.roles.includes('psychologist')) await catalogCache.invalidate();
  return getUser(target.id);
}

// PUT /api/admin/users/:id/roles { roles: ['client', 'psychologist'] }
async function setRoles(moderator, id, body, ip) {
  const target = await findTarget(id);
  assertCanManage(moderator, target);
  const roles = Array.isArray(body && body.roles) ? [...new Set(body.roles.map(String))] : null;
  if (!roles || !roles.length) throw new HttpError(422, 'Нужна хотя бы одна роль', { fields: { roles: 'client и/или psychologist' } });
  if (roles.some((r) => !ASSIGNABLE_ROLES.includes(r))) throw new HttpError(422, 'Назначить можно роли client и psychologist', { fields: { roles: 'client, psychologist' } });

  const added = roles.filter((r) => !target.roles.includes(r));
  const removed = target.roles.filter((r) => !roles.includes(r));
  if (!added.length && !removed.length) return getUser(target.id);

  await transaction(async (db) => {
    for (const role of added) {
      await userRepository.addRole(target.id, role, moderator.id, db);
      // Клиенту нужен профиль: имя берём из анкеты психолога или из почты
      if (role === 'client' && !(await moderationRepository.hasClientProfile(target.id, db))) {
        await userRepository.createClientProfile(target.id, { firstName: target.first_name || target.email.split('@')[0] }, db);
      }
    }
    for (const role of removed) {
      await moderationRepository.removeRole(target.id, role, db);
      if (role === 'psychologist') await moderationRepository.unpublishPsychologist(target.id, db);
    }
    for (const [action, list] of [['role.grant', added], ['role.revoke', removed]]) {
      for (const role of list) {
        await auditRepository.log({ actorId: moderator.id, action, entityType: 'user', entityId: target.id, ip,
          details: { user: userView(target).name, role } }, db);
      }
    }
  });
  await roleRepository.dropCachedPermissions(target.id);
  if (removed.includes('psychologist') || added.includes('psychologist')) await catalogCache.invalidate();
  // Роли записаны в токене входа – завершаем сессии, чтобы при следующем входе роли были новые
  await authService.revokeAllSessions(target.id);
  realtime.emit('disconnect-user', { userId: target.id });
  return getUser(target.id);
}

// ---------- Права ролей ----------

// PUT /api/admin/roles/:code/permissions { permissions: [коды] }
async function setRolePermissions(moderator, code, body, ip) {
  const role = await moderationRepository.findRole(code);
  if (!role) throw new HttpError(404, 'Роль не найдена');
  const known = new Set((await roleRepository.findAllPermissions()).map((p) => p.code));
  const codes = Array.isArray(body && body.permissions) ? [...new Set(body.permissions.map(String))] : null;
  if (!codes) throw new HttpError(422, 'permissions – список кодов прав', { fields: { permissions: 'Список кодов' } });
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length) throw new HttpError(422, `Неизвестные права: ${unknown.join(', ')}`, { fields: { permissions: unknown.join(', ') } });
  // Защита от «запереть самих себя»: без этого права роли больше никто не поменяет
  if (role.code === 'moderator' && !codes.includes('roles.assign')) {
    throw new HttpError(409, 'У модератора должно остаться право roles.assign – иначе роли больше никто не изменит', { code: 'LOCKOUT' });
  }

  const before = await moderationRepository.rolePermissions(role.id);
  const added = codes.filter((c) => !before.includes(c));
  const removed = before.filter((c) => !codes.includes(c));
  if (added.length || removed.length) {
    await transaction(async (db) => {
      await moderationRepository.replaceRolePermissions(role.id, codes, db);
      await auditRepository.log({ actorId: moderator.id, action: 'role.permissions', entityType: 'role', ip,
        details: { role: role.name, added, removed } }, db);
    });
    await roleRepository.dropAllCachedPermissions(); // права в кэше у всех пользователей этой роли устарели
  }
  return accessService.getRolesOverview();
}

// ---------- Журнал ----------

async function listAudit(query) {
  const fields = {};
  const page = v.intParam(query.page, 'page', { min: 1, max: 10000 }, fields) || 1;
  const limit = v.intParam(query.limit, 'limit', { min: 1, max: 100 }, fields) || 30;
  const actorId = v.intParam(query.actorId, 'actorId', { min: 1, max: Number.MAX_SAFE_INTEGER }, fields);
  v.throwIfInvalid(fields);
  const { rows, total } = await auditRepository.list({
    action: v.text(query.action).slice(0, 64), actorId, q: v.text(query.q).slice(0, 100), limit, offset: (page - 1) * limit,
  });
  return {
    items: rows.map((r) => ({
      id: r.id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, details: r.details,
      ip: r.ip, createdAt: r.created_at, actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, email: r.actor_email } : null,
    })),
    total, page, pages: Math.ceil(total / limit),
  };
}

module.exports = { listUsers, getUser, updateUser, blockUser, unblockUser, setRoles, setRolePermissions, listAudit };
