// Данные аккаунта для интерфейса: кто вошёл, его роли и права.
const userRepository = require('../repositories/user.repository');
const accessService = require('./access.service');
const { HttpError } = require('../errors');

async function getAccount(userId) {
  const row = await userRepository.findAccountById(userId);
  if (!row) throw new HttpError(404, 'Пользователь не найден');
  return {
    id: Number(row.id),
    email: row.email,
    status: row.status,
    roles: row.roles,
    permissions: await accessService.getPermissions(userId),
    firstName: row.first_name, // у модератора профиля нет – null
    lastName: row.last_name,
    verificationStatus: row.verification_status || undefined, // только у психолога
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

module.exports = { getAccount };
