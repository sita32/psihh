/**
 * «Рядом» – кто вошёл: шапка, выход, доступ к кабинетам.
 * Кабинет (<body class="cab-page" data-role="client">) открывается только своей роли:
 * без входа – переход на login.html?next=…, с другой ролью – в свой кабинет.
 * В шапке кабинета – имя, роль и фото из GET /api/auth/me; на публичных страницах
 * кнопка «Войти» у вошедшего ведёт в кабинет. Страница может дождаться пользователя: await Session.user().
 */
const Session = (() => {
  const CABINETS = { client: 'cabinet-client.html', psychologist: 'cabinet-psychologist.html', moderator: 'mod-users.html' };
  const ROLE_NAMES = { client: 'Клиент', psychologist: 'Психолог', moderator: 'Модератор' };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Один запрос «кто я» на страницу; null – не вошёл
  let current = null;
  const user = () => {
    current ??= API.get('/auth/me').then((r) => r.user, (err) => {
      if (err.status === 401) return null;
      current = null; // сервер не ответил – в следующий раз спросим снова
      throw err;
    });
    return current;
  };

  /** Главная роль – определяет, какой кабинет открывать */
  const mainRole = (u) => ['moderator', 'psychologist', 'client'].find((r) => u.roles.includes(r));
  const home = (u) => CABINETS[mainRole(u)] || 'index.html';
  const displayName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ')
    || (u.roles.includes('moderator') ? 'Модератор' : u.email.split('@')[0]);

  /** Вход с возвратом на эту же страницу */
  const loginUrl = () => `login.html?next=${encodeURIComponent((location.pathname.split('/').pop() || 'index.html') + location.search)}`;

  async function logout() {
    try { await API.post('/auth/logout'); } catch { /* сессия уже недействительна – всё равно уходим */ }
    current = null;
    location.href = 'index.html';
  }

  /** Шапка и меню кабинета: имя, роль, фото, «Выйти» */
  function fillCabinet(u, role) {
    document.querySelectorAll('.cab-top .me').forEach((el) => {
      el.href = home(u);
      const name = displayName(u);
      const ava = el.querySelector('.ava-sq');
      if (ava) ava.innerHTML = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : esc(name.charAt(0).toUpperCase());
      const nameEl = el.querySelector('.me__name');
      if (nameEl) nameEl.textContent = name;
      const roleEl = el.querySelector('.me__role');
      if (roleEl) roleEl.textContent = ROLE_NAMES[role];
    });
  }

  /** «Чат» в меню кабинета: число непрочитанных сообщений (или без значка) */
  async function fillChatBadge() {
    const links = document.querySelectorAll('.cab-nav a[href$="chat.html"]');
    if (!links.length) return;
    let total = 0;
    try { ({ total } = await API.get('/conversations/unread')); } catch { /* значок – не главное */ }
    links.forEach((a) => {
      let b = a.querySelector('.badge');
      if (!total) { b?.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'badge'; a.appendChild(b); }
      b.textContent = total;
    });
  }

  /** Публичная шапка: значок «Войти» ведёт в кабинет */
  function fillPublic(u) {
    document.querySelectorAll('a[href="login.html"].btn--icon').forEach((a) => {
      a.href = home(u);
      a.setAttribute('aria-label', 'Личный кабинет');
      a.title = 'Личный кабинет';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // «Выйти» – настоящий выход, а не просто переход на главную
    document.querySelectorAll('.logout').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    }));

    const role = document.body.classList.contains('cab-page') ? document.body.dataset.role : null;
    let u;
    try {
      u = await user();
    } catch (err) {
      console.warn('[session]', err.message); // сервер не ответил – страница покажет свою ошибку
      return;
    }
    if (role) {
      if (!u) { location.replace(loginUrl()); return; }
      if (!u.roles.includes(role)) { location.replace(home(u)); return; }
      fillCabinet(u, role);
      if (role !== 'moderator' && !location.pathname.endsWith('chat.html')) fillChatBadge();   // в чате счётчик ведёт сам чат
    } else if (u) {
      fillPublic(u);
    }
  });

  return { user, home, displayName, logout, CABINETS };
})();
