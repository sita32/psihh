// Разграничение доступа (RBAC): права пользователя = права всех его ролей (role_permissions).
// Права читаются из кэша Redis, при промахе – из БД с записью в кэш на 10 минут.
const roleRepository = require('../repositories/role.repository');

const CACHE_TTL_SEC = 10 * 60;

async function getPermissions(userId) {
  const cached = await roleRepository.getCachedPermissions(userId);
  if (cached.length) return cached.sort();
  const permissions = await roleRepository.findUserPermissions(userId);
  await roleRepository.cachePermissions(userId, permissions, CACHE_TTL_SEC);
  return permissions;
}

// Есть ли у пользователя хотя бы одно из прав
async function hasAnyPermission(userId, codes) {
  const permissions = await getPermissions(userId);
  return codes.some((code) => permissions.includes(code));
}

// Роли и права для страницы «Роли и права» модератора
async function getRolesOverview() {
  const [roles, permissions] = await Promise.all([
    roleRepository.findRolesWithPermissions(),
    roleRepository.findAllPermissions(),
  ]);
  return { roles, permissions };
}

module.exports = { getPermissions, hasAnyPermission, getRolesOverview };
