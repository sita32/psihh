// Права ролей (RBAC по таблице role_permissions): кто куда может зайти.
const { browser, loginAs, DEMO } = require('../helpers');

let client;
let psychologist;
let moderator;

beforeAll(async () => {
  [client, psychologist, moderator] = await Promise.all([
    loginAs(DEMO.client), loginAs(DEMO.psychologist), loginAs(DEMO.moderator),
  ]);
});

// [адрес, ожидаемый статус для гостя / клиента / психолога / модератора]
const MATRIX = [
  ['/api/profile', 401, 200, 200, 404],               // у модератора нет профиля
  ['/api/appointments?scope=all', 401, 200, 200, 403],
  ['/api/schedule/slots', 401, 403, 200, 403],
  ['/api/reviews', 401, 200, 403, 403],                // свои отзывы – только клиент
  ['/api/psychologists/me/reviews', 401, 403, 200, 403],
  ['/api/admin/users', 401, 403, 403, 200],
  ['/api/admin/roles', 401, 403, 403, 200],
  ['/api/admin/audit', 401, 403, 403, 200],
  ['/api/psychologists', 200, 200, 200, 200],          // каталог открыт всем
];

describe.each(MATRIX)('%s', (url, guest, asClient, asPsy, asMod) => {
  test(`гость ${guest}, клиент ${asClient}, психолог ${asPsy}, модератор ${asMod}`, async () => {
    const statuses = [];
    for (const agent of [browser(), client, psychologist, moderator]) {
      statuses.push((await agent.get(url)).status);
    }
    expect(statuses).toEqual([guest, asClient, asPsy, asMod]);
  });
});

test('ответ 403 – в едином формате, без подробностей', async () => {
  const res = await client.get('/api/admin/users');
  expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Недостаточно прав для этого действия' } });
});
