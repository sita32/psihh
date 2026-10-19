/**
 * «Рядом» – чат клиента с психологом (client-chat.html и psy-chat.html).
 * Роль – из <body data-role>: у клиента – диалоги с психологами, у психолога – с клиентами.
 * Данные – из API: GET /api/conversations (список), …/:id/messages (переписка и события записей),
 * отправка – Socket.IO «message:send» (или POST …/messages), файл – POST …/attachments,
 * «прочитано» – «messages:read». В реальном времени приходят message:new, messages:read,
 * typing («печатает…») и presence («в сети»).
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Кто открыл чат: клиент (по умолчанию) или психолог
  const isPsy = document.body.dataset.role === 'psychologist';
  const chat = document.querySelector('[data-chat]');
  const listEl = document.querySelector('[data-dialogs]');
  const messagesEl = document.querySelector('[data-messages]');
  const form = document.querySelector('[data-composer]');
  const input = document.querySelector('[data-input]');
  const sendBtn = form.querySelector('.send');
  const search = document.querySelector('[data-search]');

  let me = null;              // кто вошёл
  let list = [];              // диалоги
  let current = null;         // открытый диалог
  let thread = { messages: [], events: [] };   // переписка открытого диалога
  let socket = null;          // соединение Socket.IO (только с сервером)

  /* ---------- Помощники ---------- */
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  /** «Сегодня», «Вчера», «12 октября» */
  const dayLabel = (iso) => {
    const k = Math.round((dayStart(new Date()) - dayStart(iso)) / 86400000);
    if (k === 0) return 'Сегодня';
    if (k === 1) return 'Вчера';
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };
  /** Время в списке диалогов: сегодня – часы, раньше – дата */
  const listTime = (iso) => (dayLabel(iso) === 'Сегодня' ? hhmm(iso) : new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''));

  /** Цвет «заглушки без фото» зависит от имени */
  const COLORS = ['#F0886B', '#4AA597', '#E9B526', '#4C8FE6', '#A08BEA', '#2E4C86'];
  const colorFor = (name) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  /** Маленькое фото: у демо-фото психологов есть квадратная версия -sq */
  const thumb = (url) => (url && url.includes('/img/psychologists/') ? url.replace(/(\.\w+)$/, '-sq$1') : url);
  /** Квадратный аватар: фото или первая буква на цветном фоне */
  const avatar = (p, size) => (p.avatarUrl
    ? `<span class="ava-sq" style="--s:${size}px"><img src="${escapeHtml(thumb(p.avatarUrl))}" alt=""></span>`
    : `<span class="ava-sq" style="--s:${size}px;--c:${colorFor(p.name)}">${escapeHtml(p.name[0])}</span>`);

  /** Подпись под именем: «в сети», «был(а) в сети …» или роль */
  const statusText = (c) => {
    if (c.online) return 'в сети';
    if (c.lastSeenText) return c.lastSeenText;
    if (c.lastSeenAt) {
      const min = Math.round((Date.now() - new Date(c.lastSeenAt)) / 60000);
      const ago = min < 60 ? `${Math.max(1, min)} мин назад` : dayLabel(c.lastSeenAt) === 'Сегодня' ? `в ${hhmm(c.lastSeenAt)}` : dayLabel(c.lastSeenAt).toLowerCase();
      return `был(а) в сети ${ago}`;
    }
    return c.partner.role === 'client' ? `Клиент${c.sessionsCount ? ` · сессий: ${c.sessionsCount}` : ''}` : (c.partner.headline || 'Психолог');
  };

  /* ---------- Список диалогов ---------- */
  const lastText = (c) => {
    const m = c.lastMessage;
    if (!m) return '';
    return (m.senderId === me.id ? 'Вы: ' : '') + (m.body || (m.attachment ? `📎 ${m.attachment.name}` : ''));
  };

  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    const items = list.filter((c) => c.partner.name.toLowerCase().includes(q));
    listEl.innerHTML = items.length ? items.map((c) => `
        <button type="button" class="dlg${c === current ? ' is-active' : ''}" data-id="${c.id}">
          <span class="dlg__ava">${avatar(c.partner, 48)}${c.online ? '<span class="online" aria-label="в сети"></span>' : ''}</span>
          <span class="dlg__body">
            <span class="dlg__top"><span class="dlg__name">${escapeHtml(c.partner.name)}</span><span class="dlg__time">${c.lastMessage ? listTime(c.lastMessage.createdAt) : ''}</span></span>
            <span class="dlg__bottom"><span class="dlg__last">${escapeHtml(lastText(c))}</span>${c.unread ? `<span class="dlg__unread">${c.unread}</span>` : ''}</span>
          </span>
        </button>`).join('')
      : `<p class="dialogs__empty">${list.length ? 'Никого не нашли' : isPsy ? 'Диалогов пока нет' : 'Диалогов пока нет – напишите психологу со страницы его профиля'}</p>`;
  };

  /** Счётчик непрочитанных в меню кабинета */
  const renderBadge = () => {
    const total = list.reduce((a, c) => a + c.unread, 0);
    document.querySelectorAll('.cab-nav a[href$="chat.html"]').forEach((a) => {
      let b = a.querySelector('.badge');
      if (!total) { b?.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'badge'; a.appendChild(b); }
      b.textContent = total;
    });
  };

  /* ---------- Переписка ---------- */
  const EVENT_ICONS = { booked: 'i-calendar', rescheduled: 'i-clock', cancelled: 'i-x', completed: 'i-check', no_show: 'i-alert' };
  const slotText = (slot) => `${new Date(`${slot.date}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}, ${slot.time}`;
  /** Событие записи в ленте: «Вы записались на сессию · чт, 15 октября, 12:30» */
  const eventText = (e) => {
    const why = e.reason ? ` · причина: ${escapeHtml(e.reason.toLowerCase())}` : '';
    if (e.type === 'booked') return `${isPsy ? 'Клиент записался' : 'Вы записались'} на&nbsp;сессию · <b>${slotText(e.slot)}</b>`;
    if (e.type === 'rescheduled') return `Сессия перенесена${e.to ? ` на&nbsp;<b>${slotText(e.to)}</b>` : ''}${why}`;
    if (e.type === 'cancelled') return `Сессия <b>${slotText(e.slot)}</b> отменена${why}`;
    if (e.type === 'completed') return `Сессия состоялась · <b>${slotText(e.slot)}</b>`;
    return `Сессия <b>${slotText(e.slot)}</b> пропущена`;
  };
  const EVENT_CLASS = { rescheduled: 'moved', cancelled: 'moved', completed: 'done', no_show: 'moved' };

  const fileUrl = (m) => API.fileUrl(`/conversations/${m.conversationId}/messages/${m.id}/attachment`);
  const messageHtml = (m) => {
    const out = m.senderId === me.id;
    const file = m.attachment ? `
      <a class="file" href="${escapeHtml(fileUrl(m))}" target="_blank" rel="noopener">
        <span class="file__ic">${escapeHtml(m.attachment.name.split('.').pop().toUpperCase().slice(0, 4))}</span>
        <span><b>${escapeHtml(m.attachment.name)}</b><small>Открыть</small></span>
      </a>` : '';
    const text = m.body ? escapeHtml(m.body).replace(/\n/g, '<br>') : '';
    const read = out && m.readAt ? '<svg aria-label="прочитано"><use href="#i-read"/></svg>' : '';
    return `<div class="msg${out ? ' msg--out' : ''}" data-msg="${m.id}">${file}${text}<div class="msg__meta">${hhmm(m.createdAt)}${read}</div></div>`;
  };

  /** Сообщения и события по времени, с разделителями дней */
  const timelineHtml = () => {
    const items = [
      ...thread.messages.map((m) => ({ at: m.createdAt, html: messageHtml(m) })),
      ...thread.events.map((e) => ({ at: e.at, html: `<div class="event event--${EVENT_CLASS[e.type] || 'booked'}"><svg><use href="#${EVENT_ICONS[e.type] || 'i-calendar'}"/></svg><span>${eventText(e)}</span></div>` })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));
    let day = '';
    return items.map((it) => {
      const d = dayLabel(it.at);
      const sep = d !== day ? `<div class="day">${d}</div>` : '';
      day = d;
      return sep + it.html;
    }).join('');
  };

  const scrollDown = () => { messagesEl.scrollTop = messagesEl.scrollHeight; };

  const renderHeader = () => {
    const c = current;
    const ava = document.querySelector('[data-conv-ava]');
    ava.outerHTML = avatar(c.partner, 44).replace('class="ava-sq"', 'class="ava-sq" data-conv-ava');
    document.querySelector('[data-conv-name]').textContent = c.partner.name;
    const status = document.querySelector('[data-conv-status]');
    status.textContent = statusText(c);
    status.classList.toggle('is-online', c.online);

    const session = document.querySelector('[data-conv-session]');
    session.hidden = !c.nextSession;
    if (c.nextSession) session.querySelector('span').textContent = `Сессия: ${c.nextSession.label || slotText(c.nextSession)}`;

    const profile = document.querySelector('[data-conv-profile]');
    profile.hidden = c.partner.role !== 'psychologist';
    if (!profile.hidden) profile.href = `psychologist.html?id=${c.partner.id}`;
  };

  const renderThread = () => {
    messagesEl.innerHTML = `<div class="privacy"><svg><use href="#i-lock"/></svg>Переписка видна только вам и&nbsp;${isPsy ? 'клиенту' : 'специалисту'}</div>`
      + timelineHtml();
    scrollDown();
  };

  /** Отметить входящие открытого диалога прочитанными */
  const markRead = async () => {
    if (!current || !current.unread) return;
    current.unread = 0;
    renderList(); renderBadge();
    try {
      if (socket && socket.connected) socket.emit('messages:read', { conversationId: current.id });
      else await API.post(`/conversations/${current.id}/read`);
    } catch { /* не страшно – отметится при следующем открытии */ }
  };

  /** Открыть диалог */
  const open = async (c) => {
    current = c;
    renderList();
    renderHeader();
    messagesEl.innerHTML = '';
    chat.classList.add('is-open');     // на телефоне – переключение со списка на переписку
    try {
      const data = await API.get(`/conversations/${c.id}/messages`, { limit: 100 });
      if (current !== c) return;       // пока грузилось, открыли другой диалог
      thread = { messages: data.messages, events: data.events || [] };
    } catch (err) {
      messagesEl.innerHTML = `<div class="event event--moved"><span>${escapeHtml(err.message)}</span></div>`;
      return;
    }
    renderThread();
    markRead();
    if (window.matchMedia('(min-width: 761px)').matches) input.focus();
  };

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.dlg');
    if (btn) open(list.find((c) => String(c.id) === btn.dataset.id));
  });
  document.querySelector('[data-back]').addEventListener('click', () => chat.classList.remove('is-open'));
  search.addEventListener('input', renderList);

  /* ---------- «Печатает…» ---------- */
  let typingTimer = null;
  const hideTyping = () => { clearTimeout(typingTimer); document.querySelector('[data-typing]')?.remove(); };
  const showTyping = (ttlSec = 4) => {
    if (!document.querySelector('[data-typing]')) {
      messagesEl.insertAdjacentHTML('beforeend', '<div class="typing" data-typing><i></i><i></i><i></i></div>');
      scrollDown();
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(hideTyping, ttlSec * 1000);
  };

  /* ---------- Новое сообщение (своё или собеседника) ---------- */
  const receive = (m) => {
    const c = list.find((x) => x.id === m.conversationId);
    if (!c) return;
    c.lastMessage = m;
    if (c === current) {
      if (!thread.messages.some((x) => x.id === m.id)) {
        hideTyping();
        thread.messages.push(m);
        messagesEl.insertAdjacentHTML('beforeend', messageHtml(m));
        scrollDown();
      }
      if (m.senderId !== me.id) { c.unread = 1; markRead(); }
    } else if (m.senderId !== me.id) {
      c.unread += 1;
    }
    // Диалог с новым сообщением – наверх списка
    list = [c, ...list.filter((x) => x !== c)];
    renderList(); renderBadge();
  };

  let typingSentAt = 0;
  input.addEventListener('input', () => {
    // Сообщаем собеседнику не чаще раза в 3 секунды
    if (!socket || !current || Date.now() - typingSentAt < 3000) return;
    typingSentAt = Date.now();
    socket.emit('typing', { conversationId: current.id });
  });

  /* ---------- Отправка ---------- */
  /** Отправка через сокет с подтверждением; без сокета – обычным запросом */
  const sendBySocket = (c, text) => new Promise((resolve, reject) => {
    socket.timeout(10000).emit('message:send', { conversationId: c.id, body: text }, (err, res) => {
      if (err) reject(new API.Error(0, { message: 'Сервер не ответил – попробуйте ещё раз' }));
      else if (res.error) reject(new API.Error(0, res.error));
      else resolve(res.message);
    });
  });

  const send = async () => {
    const text = input.value.trim();
    if (!text || !current) return;
    const c = current;
    input.value = '';
    autosize();
    try {
      const m = socket && socket.connected ? await sendBySocket(c, text) : await API.post(`/conversations/${c.id}/messages`, { body: text });
      receive(m);
    } catch (err) {
      input.value = text;              // текст не потерялся – можно отправить ещё раз
      autosize();
      alertInChat(err.message);
    }
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  // Enter – отправить, Shift+Enter – новая строка
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });

  /** Поле ввода растёт вместе с текстом */
  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    sendBtn.disabled = !input.value.trim();
  };
  input.addEventListener('input', autosize);

  /** Прикрепление файла (до 10 МБ): PDF или картинка – тип проверит сервер */
  document.querySelector('[data-attach]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !current) return;
    if (file.size > 10 * 1024 * 1024) { alertInChat('Файл больше 10 МБ'); return; }
    try {
      receive(await API.upload(`/conversations/${current.id}/attachments`, file));
    } catch (err) {
      alertInChat(err.message);
    }
  });

  /** Короткое системное сообщение внутри переписки (вместо alert) */
  const alertInChat = (text) => {
    messagesEl.insertAdjacentHTML('beforeend', `<div class="event event--moved"><svg><use href="#i-clock"/></svg><span>${escapeHtml(text)}</span></div>`);
    scrollDown();
  };

  /* ---------- Реальное время: Socket.IO (клиентскую библиотеку отдаёт сам сервер) ---------- */
  const connectSocket = () => new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onerror = () => resolve(null);  // без сокета чат работает обычными запросами
    script.onload = () => {
      // Только websocket: при нескольких экземплярах сервера не нужны «липкие» сессии
      const s = io({ transports: ['websocket'] });
      s.on('connect_error', async (err) => {
        // Вход истёк – обновляем сессию обычным запросом и подключаемся снова
        if (err.data && err.data.code === 'TOKEN_EXPIRED') {
          try { await API.get('/auth/me'); s.connect(); } catch { /* войти заново придётся вручную */ }
        }
      });
      s.on('message:new', receive);
      s.on('messages:read', ({ conversationId, readerId, messageIds, readAt }) => {
        if (readerId === me.id || !current || current.id !== conversationId) return;
        thread.messages.forEach((m) => { if (messageIds.includes(m.id)) m.readAt = readAt; });
        messageIds.forEach((id) => {
          const meta = messagesEl.querySelector(`[data-msg="${id}"] .msg__meta`);
          if (meta && !meta.querySelector('svg')) meta.insertAdjacentHTML('beforeend', '<svg aria-label="прочитано"><use href="#i-read"/></svg>');
        });
      });
      s.on('typing', ({ conversationId, ttlSec }) => { if (current && current.id === conversationId) showTyping(ttlSec); });
      s.on('presence', ({ userId, online, lastSeenAt }) => {
        list.filter((c) => c.partner.id === userId).forEach((c) => {
          Object.assign(c, { online, lastSeenAt, lastSeenText: null });
          if (c === current) renderHeader();
        });
        renderList();
      });
      resolve(s);
    };
    document.head.appendChild(script);
  });

  /* ---------- Старт ---------- */
  try {
    [me, { items: list }] = await Promise.all([Session.user(), API.get('/conversations')]);
  } catch (err) {
    listEl.innerHTML = `<p class="dialogs__empty">Не удалось загрузить диалоги: ${escapeHtml(err.message)}</p>`;
    return;
  }
  if (!me) return;                     // не вошёл – Session уже ведёт на страницу входа
  renderList();
  renderBadge();
  socket = await connectSocket();

  // Диалог из ссылки (?with=id собеседника) или первый; на телефоне – сначала список
  const withId = new URLSearchParams(location.search).get('with');
  const start = list.find((c) => String(c.partner.id) === withId) || list[0];
  if (start && (withId || window.matchMedia('(min-width: 761px)').matches)) open(start);
  else if (!start) {
    document.querySelector('[data-conv-name]').textContent = 'Нет диалогов';
    form.hidden = true;
  }
});
