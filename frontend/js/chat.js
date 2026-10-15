/**
 * «Рядом» – чат клиента с психологом.
 * Пока данные лежат прямо в этом файле (массив DIALOGS), ответы психолога имитируются.
 * Позже: список диалогов и сообщения придут с сервера (API на NodeJS),
 * а новые сообщения – в реальном времени через WebSocket (например, Socket.IO).
 */

/* ---------- Демо-данные ---------- */
const DIALOGS = [
  {
    id: 1,
    name: 'Марина Волкова',
    role: 'Клинический психолог',
    photo: 'assets/img/psychologists/p01-sq.webp',
    online: true,
    profile: 'psychologist.html?id=1',
    nextSession: 'Чт, 15 октября, 15:00',
    unread: 2,
    messages: [
      { day: '12 октября' },
      { from: 'psy', time: '18:02', text: 'Здравствуйте, Анна! Я получила вашу анкету. Перед первой встречей можно коротко написать, что сейчас беспокоит больше всего?' },
      { from: 'me', time: '18:20', text: 'Здравствуйте! В последнее время сложно уснуть – постоянно прокручиваю мысли о работе.' },
      { from: 'psy', time: '18:24', text: 'Спасибо, что поделились. Обсудим это на сессии. Если до встречи станет тяжело – пишите.' },
      { event: 'booked', text: 'Вы записались на сессию · <b>чт, 15 октября, 12:30</b>' },
      { day: 'Вчера' },
      { from: 'me', time: '10:15', text: 'Марина, можно перенести встречу на попозже? На работе совещание.' },
      { event: 'moved', text: 'Сессия перенесена на <b>15:00</b> · причина: рабочее совещание' },
      { from: 'psy', time: '10:31', text: 'Конечно, перенесла на 15:00. Жду вас 🙂' },
      { day: 'Сегодня' },
      { from: 'psy', time: '09:12', file: { name: 'Дневник мыслей.pdf', size: '240 КБ' } },
      { from: 'psy', time: '09:13', text: 'Если будет время – попробуйте заполнить этот дневник пару дней. Обсудим на встрече.' },
    ],
  },
  {
    id: 2,
    name: 'Дмитрий Соколов',
    role: 'Гештальт-терапевт',
    photo: 'assets/img/psychologists/p06-sq.webp',
    online: false,
    lastSeen: 'был в сети 2 часа назад',
    profile: 'psychologist.html?id=2',
    unread: 0,
    messages: [
      { day: '28 сентября' },
      { event: 'done', text: 'Сессия состоялась · <b>пн, 28 сентября, 19:00</b>' },
      { from: 'psy', time: '20:05', text: 'Спасибо за встречу. Если захотите продолжить – свободные окна есть в моём расписании.' },
      { from: 'me', time: '20:40', text: 'Спасибо! Пока попробую поработать с Мариной, но буду иметь в виду.' },
    ],
  },
  {
    id: 3,
    name: 'Поддержка «Рядом»',
    role: 'Служба поддержки',
    photo: null,
    color: '#4AA597',
    online: true,
    unread: 0,
    messages: [
      { day: '10 октября' },
      { from: 'psy', time: '12:00', text: 'Здравствуйте! Мы на связи каждый день с 9:00 до 21:00. Напишите, если что-то не получается с записью или оплатой.' },
    ],
  },
];

/* Ответы психолога для демонстрации (по кругу) */
const DEMO_REPLIES = [
  'Спасибо, что написали. Давайте обсудим это подробнее на нашей встрече.',
  'Понимаю. Если станет тяжелее – напишите, я отвечу, как только смогу.',
  'Хорошо, отметила для себя 🙂',
];

document.addEventListener('DOMContentLoaded', () => {
  const chat = document.querySelector('[data-chat]');
  const listEl = document.querySelector('[data-dialogs]');
  const messagesEl = document.querySelector('[data-messages]');
  const form = document.querySelector('[data-composer]');
  const input = document.querySelector('[data-input]');
  const sendBtn = form.querySelector('.send');
  const search = document.querySelector('[data-search]');
  let current = DIALOGS[0];
  let replyIndex = 0;

  /* ---------- Помощники ---------- */
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  /** Квадратный аватар: фото или первая буква на цветном фоне */
  const avatar = (d, size) => (d.photo
    ? `<span class="ava-sq" style="--s:${size}px"><img src="${d.photo}" alt=""></span>`
    : `<span class="ava-sq" style="--s:${size}px;--c:${d.color}">${d.name[0]}</span>`);

  /** Последнее текстовое сообщение диалога – для превью в списке */
  const lastOf = (d) => {
    const m = [...d.messages].reverse().find((x) => x.text || x.file);
    if (!m) return { text: '', time: '' };
    const prefix = m.from === 'me' ? 'Вы: ' : '';
    return { text: prefix + (m.file ? `📎 ${m.file.name}` : m.text), time: m.time };
  };

  /* ---------- Список диалогов ---------- */
  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    const items = DIALOGS.filter((d) => d.name.toLowerCase().includes(q));
    listEl.innerHTML = items.length ? items.map((d) => {
      const last = lastOf(d);
      return `
        <button type="button" class="dlg${d === current ? ' is-active' : ''}" data-id="${d.id}">
          <span class="dlg__ava">${avatar(d, 48)}${d.online ? '<span class="online" aria-label="в сети"></span>' : ''}</span>
          <span class="dlg__body">
            <span class="dlg__top"><span class="dlg__name">${d.name}</span><span class="dlg__time">${last.time}</span></span>
            <span class="dlg__bottom"><span class="dlg__last">${escapeHtml(last.text)}</span>${d.unread ? `<span class="dlg__unread">${d.unread}</span>` : ''}</span>
          </span>
        </button>`;
    }).join('') : '<p class="dialogs__empty">Никого не нашли</p>';
  };

  /* ---------- Сообщения ---------- */
  const EVENT_ICONS = { booked: 'i-calendar', moved: 'i-clock', done: 'i-check' };

  const messageHtml = (m) => {
    if (m.day) return `<div class="day">${m.day}</div>`;
    if (m.event) return `<div class="event event--${m.event}"><svg><use href="#${EVENT_ICONS[m.event]}"/></svg><span>${m.text}</span></div>`;
    const out = m.from === 'me';
    const file = m.file ? `
      <span class="file">
        <span class="file__ic">${escapeHtml(m.file.name.split('.').pop().toUpperCase().slice(0, 4))}</span>
        <span><b>${escapeHtml(m.file.name)}</b><small>${m.file.size}</small></span>
      </span>` : '';
    const text = m.text ? escapeHtml(m.text).replace(/\n/g, '<br>') : '';
    const read = out ? '<svg aria-label="прочитано"><use href="#i-read"/></svg>' : '';
    return `<div class="msg${out ? ' msg--out' : ''}">${file}${text}<div class="msg__meta">${m.time}${read}</div></div>`;
  };

  const scrollDown = () => { messagesEl.scrollTop = messagesEl.scrollHeight; };

  const renderConversation = () => {
    const d = current;
    const ava = document.querySelector('[data-conv-ava]');
    ava.outerHTML = avatar(d, 44).replace('class="ava-sq"', 'class="ava-sq" data-conv-ava');
    document.querySelector('[data-conv-name]').textContent = d.name;
    const status = document.querySelector('[data-conv-status]');
    status.textContent = d.online ? 'в сети' : (d.lastSeen || d.role);
    status.classList.toggle('is-online', d.online);

    const session = document.querySelector('[data-conv-session]');
    session.hidden = !d.nextSession;
    if (d.nextSession) session.querySelector('span').textContent = `Сессия: ${d.nextSession}`;

    const profile = document.querySelector('[data-conv-profile]');
    profile.hidden = !d.profile;
    if (d.profile) profile.href = d.profile;

    messagesEl.innerHTML = '<div class="privacy"><svg><use href="#i-lock"/></svg>Переписка видна только вам и&nbsp;специалисту</div>'
      + d.messages.map(messageHtml).join('');
    scrollDown();
  };

  /** Открыть диалог */
  const open = (d) => {
    current = d;
    d.unread = 0;                      // API: отметить сообщения прочитанными
    renderList();
    renderConversation();
    chat.classList.add('is-open');     // на телефоне – переключение со списка на переписку
    scrollDown();                      // прокрутка к последним сообщениям, когда переписка уже видна
    if (window.matchMedia('(min-width: 761px)').matches) input.focus();
  };

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.dlg');
    if (btn) open(DIALOGS.find((d) => d.id === Number(btn.dataset.id)));
  });
  document.querySelector('[data-back]').addEventListener('click', () => chat.classList.remove('is-open'));
  search.addEventListener('input', renderList);

  /* ---------- Отправка ---------- */
  const push = (d, m) => {
    d.messages.push(m);
    if (d === current) { messagesEl.insertAdjacentHTML('beforeend', messageHtml(m)); scrollDown(); }
    renderList();
  };

  /** Имитация ответа: «печатает…», затем сообщение (только для демонстрации) */
  const fakeReply = (d) => {
    if (!d.online) return;
    setTimeout(() => {
      if (d !== current) return;
      messagesEl.insertAdjacentHTML('beforeend', '<div class="typing" data-typing><i></i><i></i><i></i></div>');
      scrollDown();
      setTimeout(() => {
        document.querySelector('[data-typing]')?.remove();
        push(d, { from: 'psy', time: now(), text: DEMO_REPLIES[replyIndex++ % DEMO_REPLIES.length] });
      }, 1600);
    }, 700);
  };

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    // API: socket.emit('message', { dialogId: current.id, text })
    push(current, { from: 'me', time: now(), text });
    input.value = '';
    autosize();
    fakeReply(current);
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

  /** Прикрепление файла (до 10 МБ) */
  document.querySelector('[data-attach]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alertInChat('Файл больше 10 МБ'); return; }
    const size = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(file.size / 1024))} КБ`;
    // API: загрузка файла на сервер, затем отправка ссылки в чат
    push(current, { from: 'me', time: now(), file: { name: file.name, size } });
  });

  /** Короткое системное сообщение внутри переписки (вместо alert) */
  const alertInChat = (text) => {
    messagesEl.insertAdjacentHTML('beforeend', `<div class="event event--moved"><svg><use href="#i-clock"/></svg><span>${escapeHtml(text)}</span></div>`);
    scrollDown();
  };

  /* ---------- Старт ---------- */
  // На компьютере сразу открыт первый диалог, на телефоне – список
  if (window.matchMedia('(min-width: 761px)').matches) current.unread = 0;
  renderList();
  renderConversation();
});
