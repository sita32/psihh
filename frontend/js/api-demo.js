/**
 * «Рядом» – демо-слой API: ответы без сервера (tools/dev-server.py или страница открыта файлом).
 * js/api.js обращается сюда сам, когда сервера нет. Ответы – в том же виде, что у сервера,
 * поэтому страницам всё равно, откуда данные. Источник – демо-данные (js/data.js и др.),
 * «вошедший» пользователь хранится в localStorage этого браузера.
 * Новые адреса добавляются через route(метод, шаблон пути, обработчик).
 */
const DEMO_API = (() => {
  const USER_KEY = 'ryadom-demo-user';

  /* Права ролей – как в database/seed.sql */
  const PERMISSIONS = {
    client: ['appointments.book', 'appointments.manage_own', 'catalog.view', 'chat.use', 'profile.edit_own', 'reviews.create'],
    psychologist: ['appointments.manage_own', 'catalog.view', 'chat.use', 'documents.upload', 'profile.edit_own', 'reviews.reply', 'schedule.manage'],
    moderator: ['audit.view', 'catalog.view', 'psychologists.verify', 'reviews.moderate', 'roles.assign', 'users.block', 'users.edit', 'users.view'],
  };

  /* Демо-аккаунты: роль определяется по почте, как раньше на странице входа */
  const ACCOUNTS = {
    'marina@ryadom.by': { id: 10, roles: ['psychologist'], firstName: 'Марина', lastName: 'Волкова',
      avatarUrl: 'assets/img/psychologists/p01.webp', verificationStatus: 'verified' },
    'moderator@ryadom.by': { id: 3, roles: ['moderator'], firstName: null, lastName: null, avatarUrl: null },
  };
  const CLIENT = { id: 4, roles: ['client'], firstName: 'Анна', lastName: 'Петрова', avatarUrl: 'assets/img/avatars/a03.webp' };

  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

  /** Ошибка в том же виде, что у сервера */
  const fail = (status, code, message, fields) => { throw { status, error: { code, message, fields } }; };

  const load = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ } };
  const forget = (key) => { try { localStorage.removeItem(key); } catch { /* приватный режим */ } };

  /** Текущий «вошедший» или 401, как у сервера */
  const me = () => load(USER_KEY) || fail(401, 'UNAUTHORIZED', 'Требуется вход');

  const account = (email, extra = {}) => {
    const base = ACCOUNTS[email] || CLIENT;
    const user = { ...base, ...extra, email, status: 'active' };
    user.permissions = [...new Set(user.roles.flatMap((r) => PERMISSIONS[r]))].sort();
    return user;
  };

  /* ---------- Вход и регистрация ---------- */

  route('POST', /^\/auth\/login$/, (body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const fields = {};
    if (!email) fields.email = 'Укажите почту';
    if (!body.password) fields.password = 'Введите пароль';
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', fields);
    const user = account(email);
    save(USER_KEY, user);
    return { user };
  });

  route('POST', /^\/auth\/register$/, (body) => {
    const email = String(body.email || '').trim().toLowerCase();
    const fields = {};
    if (!String(body.name || '').trim()) fields.name = 'Укажите имя';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Проверьте адрес почты';
    if (String(body.password || '').length < 8) fields.password = 'Пароль должен быть не короче 8 символов';
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', fields);
    if (ACCOUNTS[email]) fail(409, 'EMAIL_TAKEN', 'Эта почта уже зарегистрирована', { email: 'Эта почта уже зарегистрирована – войдите' });
    const psy = body.role === 'psychologist';
    const user = account(email, {
      id: 100, roles: [psy ? 'psychologist' : 'client'], firstName: String(body.name).trim(),
      lastName: psy ? body.lastName : null, avatarUrl: null, verificationStatus: psy ? 'draft' : undefined,
    });
    save(USER_KEY, user);
    return { user };
  });

  route('GET', /^\/auth\/me$/, () => ({ user: me() }));

  route('POST', /^\/auth\/logout$/, () => { forget(USER_KEY); return null; });

  /* ---------- Справочники (как database/seed.sql) ---------- */

  const REFERENCES = {
    methods: [['cbt', 'КПТ'], ['gestalt', 'Гештальт'], ['schema', 'Схема-терапия'], ['act', 'ACT'],
      ['psychoanalysis', 'Психоанализ'], ['emdr', 'EMDR'], ['family', 'Системная семейная']].map(([code, name]) => ({ code, name })),
    topics: [['anxiety', 'Тревожность'], ['stress', 'Стресс'], ['burnout', 'Выгорание'], ['relationships', 'Отношения'],
      ['self_esteem', 'Самооценка'], ['apathy', 'Апатия'], ['procrastination', 'Прокрастинация'], ['grief', 'Утрата'],
      ['crisis', 'Кризис'], ['panic', 'Панические атаки']].map(([code, name]) => ({ code, name })),
    formats: [['individual', 'Индивидуальная'], ['couple', 'Парная'], ['child', 'С ребёнком']].map(([code, name]) => ({ code, name })),
  };
  const byName = (list, name) => list.find((x) => x.name === name);
  const byCode = (list, code) => list.find((x) => x.code === code);
  const FORMAT_EXTRA = { individual: 0, couple: 20, child: 10 };   // надбавка к цене индивидуальной сессии

  route('GET', /^\/references$/, () => REFERENCES);

  /* ---------- Психологи из data.js в виде ответа API ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const kOf = (date) => Math.round((new Date(`${date}T00:00:00`) - DEMO_TODAY) / 86400000);
  const startsAt = (k, time) => { const d = demoDateAt(k); d.setHours(...time.split(':').map(Number)); return d.toISOString(); };
  const slotId = (p, k, time) => `${p.id}:${isoDate(demoDateAt(k))}:${time}`;
  /** Свободное время психолога через k дней (минус окна, занятые записями клиента в этом браузере) */
  const freeOn = (p, k) => {
    const b = new Set(takenByClient());
    return demoSlotsOn(p, k).filter((t) => !b.has(slotId(p, k, t)));
  };
  const findPsy = (id) => PSYCHOLOGISTS.find((p) => String(p.id) === String(id)) || fail(404, 'NOT_FOUND', 'Психолог не найден');

  const card = (p, next) => {
    const [firstName, lastName] = p.name.split(' ');
    return {
      id: p.id, name: p.name, firstName, lastName, gender: p.gender === 'f' ? 'female' : 'male', age: p.age,
      headline: p.role, avatarUrl: `assets/img/psychologists/${p.photo}.webp`, experienceYears: p.exp,
      rating: p.rating, reviewsCount: p.reviews, priceFrom: p.price,
      methods: p.methods.map((n) => byName(REFERENCES.methods, n)),
      topics: p.topics.map((n) => byName(REFERENCES.topics, n)),
      services: p.formats.map((n) => { const f = byName(REFERENCES.formats, n); return { ...f, price: p.price + FORMAT_EXTRA[f.code], durationMin: 50 }; }),
      nextSlot: next ? startsAt(next.k, next.time) : null,
    };
  };

  /** Ближайшее свободное окно, подходящее под выбор дня / времени / части дня */
  const PART_RANGES = { morning: [0, 720], day: [720, 1020], evening: [1020, 1440] };
  const nextFree = (p, { date, times = [], parts = [] } = {}) => {
    const ks = date ? [kOf(date)] : Array.from({ length: 30 }, (_, k) => k);
    for (const k of ks) {
      const t = freeOn(p, k).find((x) => (!times.length || times.includes(x))
        && (!parts.length || parts.some((part) => demoMins(x) >= PART_RANGES[part][0] && demoMins(x) < PART_RANGES[part][1])));
      if (t) return { k, time: t };
    }
    return null;
  };

  /* ---------- Каталог: те же фильтры, сортировки и подсказки, что у сервера ---------- */

  const list = (v) => (v ? String(v).split(',').filter(Boolean) : []);
  const catalogFilters = (q) => ({
    q: String(q.q || '').trim().toLowerCase(),
    topics: list(q.topic).map((c) => byCode(REFERENCES.topics, c)?.name),
    methods: list(q.method).map((c) => byCode(REFERENCES.methods, c)?.name),
    formats: list(q.format).map((c) => byCode(REFERENCES.formats, c)?.name),
    gender: { female: 'f', male: 'm', f: 'f', m: 'm' }[q.gender] || null,
    expMin: q.expMin ? Number(q.expMin) : null,
    expMax: q.expMax ? Number(q.expMax) : null,
    priceMax: q.priceMax ? Number(q.priceMax) : null,
    date: q.date || null,
    times: list(q.time),
    parts: list(q.part),
  });

  const matchesCatalog = (p, f, omit = []) => {
    if (f.q) {
      const hay = [p.name, p.role, ...p.methods, ...p.topics, p.about].join(' ').toLowerCase();
      if (!hay.includes(f.q.length > 5 ? f.q.slice(0, 5) : f.q)) return false;
    }
    if (f.topics.length && !f.topics.some((t) => p.topics.includes(t))) return false;
    if (!omit.includes('methods') && f.methods.length && !f.methods.some((m) => p.methods.includes(m))) return false;
    if (!omit.includes('formats') && f.formats.length && !f.formats.every((x) => p.formats.includes(x))) return false;
    if (f.gender && p.gender !== f.gender) return false;
    if (f.expMin !== null && p.exp < f.expMin) return false;
    if (f.expMax !== null && p.exp > f.expMax) return false;
    if (f.priceMax !== null && p.price > f.priceMax) return false;
    const slotFilter = { date: omit.includes('date') ? null : f.date, times: omit.includes('times') ? [] : f.times, parts: f.parts };
    if ((slotFilter.date || slotFilter.times.length || slotFilter.parts.length) && !nextFree(p, slotFilter)) return false;
    return true;
  };

  const CATALOG_SORTS = {
    rating: (a, b) => b.p.rating - a.p.rating || b.p.reviews - a.p.reviews,
    soon: (a, b) => (a.next ? a.next.k * 1440 + demoMins(a.next.time) : 1e9) - (b.next ? b.next.k * 1440 + demoMins(b.next.time) : 1e9),
    cheap: (a, b) => a.p.price - b.p.price,
    expensive: (a, b) => b.p.price - a.p.price,
    exp: (a, b) => b.p.exp - a.p.exp,
  };

  route('GET', /^\/psychologists$/, (_, { query }) => {
    const f = catalogFilters(query);
    const found = PSYCHOLOGISTS.filter((p) => matchesCatalog(p, f))
      .map((p) => ({ p, next: nextFree(p, f) }))
      .sort(CATALOG_SORTS[query.sort] || CATALOG_SORTS.rating);
    const limit = Number(query.limit) || 6;
    const page = Number(query.page) || 1;

    // Подсказки к фильтрам
    const countBy = (pool, keysOf) => pool.reduce((acc, p) => { keysOf(p).forEach((k) => { acc[k] = (acc[k] || 0) + 1; }); return acc; }, {});
    const methods = countBy(PSYCHOLOGISTS.filter((p) => matchesCatalog(p, f, ['methods'])), (p) => p.methods.map((n) => byName(REFERENCES.methods, n).code));
    const formats = countBy(PSYCHOLOGISTS.filter((p) => matchesCatalog(p, f, ['formats'])), (p) => p.formats.map((n) => byName(REFERENCES.formats, n).code));
    const dayPool = PSYCHOLOGISTS.filter((p) => matchesCatalog(p, f, ['date', 'times']));
    const days = {};
    for (let k = 0; k < 14; k += 1) {
      const n = dayPool.filter((p) => nextFree(p, { date: isoDate(demoDateAt(k)), parts: f.parts })).length;
      if (n) days[isoDate(demoDateAt(k))] = n;
    }
    let times = null;
    if (f.date) {
      times = countBy(PSYCHOLOGISTS.filter((p) => matchesCatalog(p, f, ['times'])), (p) => freeOn(p, kOf(f.date)));
    }
    return {
      items: found.slice((page - 1) * limit, page * limit).map(({ p, next }) => card(p, next)),
      total: found.length, page, limit, pages: Math.ceil(found.length / limit),
      facets: { methods, formats, days, times },
    };
  });

  /* ---------- Страница психолога ---------- */

  route('GET', /^\/psychologists\/(\d+)$/, (_, { params: [id] }) => {
    const p = findPsy(id);
    const [uni, year] = p.edu.split(' · ');
    const [institution, specialty] = uni.split(', ');
    return {
      ...card(p, nextFree(p)),
      middleName: null, bio: p.about, approach: PSY_EXTRA.steps.join(' '),
      practiceSince: `${new Date().getFullYear() - p.exp}-09-01`, verifiedAt: null,
      education: [{ type: 'diploma', institution, specialty, year: Number(year) },
        ...PSY_EXTRA.courses.map((c) => ({ type: 'certificate', institution: c.place, specialty: c.title, year: c.year }))],
    };
  });

  route('GET', /^\/psychologists\/(\d+)\/reviews$/, (_, { params: [id] }) => {
    const p = findPsy(id);
    const items = REVIEWS.filter((r) => r.psy === p.id).map((r, i) => ({
      id: p.id * 100 + i, author: r.name, anonymous: r.name === 'Аноним', rating: r.rating, body: r.text,
      sessions: r.sessions, createdAt: new Date(`${r.date}T12:00:00`).toISOString(),
      reply: r.reply ? { text: r.reply, at: null } : null,
    }));
    // Распределение оценок для демо – из рейтинга и общего числа отзывов
    const fives = Math.round(p.reviews * (p.rating - 4));
    const third = p.rating < 4.8 ? 1 : 0;
    return {
      summary: { rating: p.rating, count: p.reviews, distribution: { 5: fives, 4: p.reviews - fives - third, 3: third, 2: 0, 1: 0 } },
      items, page: 1, pages: 1,
    };
  });

  route('GET', /^\/psychologists\/(\d+)\/slots$/, (_, { params: [id], query }) => {
    const p = findPsy(id);
    const from = query.from ? kOf(query.from) : 0;
    const to = query.to ? kOf(query.to) : from + 13;
    const slots = [];
    for (let k = Math.max(0, from); k <= to; k += 1) {
      freeOn(p, k).forEach((time) => slots.push({
        id: slotId(p, k, time), startsAt: startsAt(k, time), date: isoDate(demoDateAt(k)), time, status: 'free',
      }));
    }
    return { from: isoDate(demoDateAt(from)), to: isoDate(demoDateAt(to)), timezone: 'Europe/Minsk', slots };
  });

  /* ---------- Кабинет клиента: профиль, записи и отзывы Анны из data.js ----------
     Изменения хранятся в localStorage – переходы между страницами их не теряют. */

  const CLIENT_KEY = 'ryadom-demo-client';
  const HIST_TYPES = [[/^Запись создана/, 'created'], [/^Перенесена/, 'rescheduled'], [/^Отменена/, 'cancelled'],
    [/^Сессия состоялась/, 'completed'], [/^Отмечено/, 'no_show']];
  const psyRef = (p) => ({ id: p.id, name: p.name, headline: p.role, avatarUrl: `assets/img/psychologists/${p.photo}.webp` });
  const atOf = (k, time) => startsAt(k, time);

  /** Записи и отзывы клиента: при первом обращении – из CLIENT_SESSIONS и CLIENT_REVIEWS */
  const clientStore = () => {
    const saved = load(CLIENT_KEY);
    if (saved) return saved;
    const store = { profile: { firstName: 'Анна', lastName: 'Петрова', birthDate: null, gender: 'female', phone: null,
      avatarUrl: 'assets/img/avatars/a03.webp', about: null }, appointments: [], reviews: [], nextId: 1000 };
    CLIENT_SESSIONS.forEach((x) => {
      const p = findPsy(x.psy);
      store.appointments.push({
        id: x.id, status: x.status, startsAt: atOf(x.k, x.time), date: isoDate(demoDateAt(x.k)), time: x.time,
        format: { code: 'individual', name: x.format, durationMin: 50 }, price: x.price, note: x.note || null, meetingUrl: null,
        psychologist: psyRef(p),
        history: x.hist.map((h) => {
          const m = /с (\d\d:\d\d) на (\d\d:\d\d)/.exec(h.text);
          return {
            type: (HIST_TYPES.find(([re]) => re.test(h.text)) || [, 'created'])[1], at: atOf(h.k, h.time), reason: h.reason || null,
            by: h.by === 'Вы' ? { role: 'client', name: 'Анна' } : { role: 'psychologist', name: h.by },
            ...(m && { from: { date: isoDate(demoDateAt(x.k)), time: m[1] }, to: { date: isoDate(demoDateAt(x.k)), time: m[2] } }),
          };
        }),
        reviewId: x.review || null,
      });
    });
    CLIENT_REVIEWS.forEach((r) => {
      const session = CLIENT_SESSIONS.find((x) => x.id === r.session);
      store.reviews.push({ id: r.id, appointmentId: session ? session.id : null, psychologist: psyRef(findPsy(r.psy)),
        rating: r.rating, body: r.text, anonymous: r.anon, status: r.status, moderationComment: r.modComment || null,
        reply: r.reply ? { text: r.reply, at: null } : null, createdAt: atOf(r.created, '12:00') });
    });
    save(CLIENT_KEY, store);
    return store;
  };
  const saveClient = (store) => save(CLIENT_KEY, store);

  /** Запись в виде ответа API: доступные действия и статус отзыва считаются как на сервере */
  const appointmentView = (a, store) => {
    const started = new Date(a.startsAt) <= new Date();
    const review = store.reviews.find((r) => r.appointmentId === a.id);
    const open = a.status === 'scheduled' && !started;
    return { ...a, needsMark: a.status === 'scheduled' && started, review: review ? { id: review.id, status: review.status } : null,
      actions: { cancel: open, reschedule: open, markCompleted: false, markNoShow: false, review: a.status === 'completed' && !review } };
  };
  const clientOnly = (who) => { const u = who(); if (!u.roles.includes('client')) fail(403, 'FORBIDDEN', 'Недостаточно прав для этого действия'); return u; };
  const findAppt = (store, id) => store.appointments.find((a) => String(a.id) === String(id)) || fail(404, 'NOT_FOUND', 'Запись не найдена');
  const event = (type, extra = {}) => ({ type, at: new Date().toISOString(), by: { role: 'client', name: 'Вы' }, reason: null, ...extra });
  /** Окна, занятые записями клиента, – больше не свободны */
  const takenByClient = () => { try { return clientStore().appointments.filter((a) => a.status === 'scheduled').map((a) => a.slotId).filter(Boolean); } catch { return []; } };

  route('GET', /^\/profile$/, (_, { me: who }) => ({ role: 'client', profile: clientStore(clientOnly(who)).profile }));
  route('PATCH', /^\/profile$/, (body, { me: who }) => {
    clientOnly(who);
    const store = clientStore();
    const fields = {};
    if (body.firstName !== undefined && !String(body.firstName).trim()) fields.firstName = 'Укажите имя';
    const phone = body.phone ? String(body.phone).replace(/[\s()-]/g, '') : body.phone;
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) fields.phone = 'Телефон в формате +375291234567';
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', fields);
    const { avatar, ...rest } = body;
    Object.assign(store.profile, rest, phone !== undefined ? { phone } : {});
    if (avatar !== undefined) store.profile.avatarUrl = avatar ? `assets/img/avatars/${avatar}.webp` : null;
    saveClient(store);
    const user = load(USER_KEY);
    save(USER_KEY, { ...user, firstName: store.profile.firstName, avatarUrl: store.profile.avatarUrl });   // шапка – по профилю
    return { role: 'client', profile: store.profile };
  });
  route('DELETE', /^\/profile$/, (_, { me: who }) => {
    clientOnly(who);
    const upcoming = clientStore().appointments.filter((a) => a.status === 'scheduled' && new Date(a.startsAt) > new Date()).length;
    if (upcoming) fail(409, 'HAS_UPCOMING_APPOINTMENTS', `Сначала отмените предстоящие сессии (${upcoming})`);
    forget(CLIENT_KEY);
    forget(USER_KEY);
    return null;
  });

  route('GET', /^\/appointments$/, (_, { me: who, query }) => {
    clientOnly(who);
    const store = clientStore();
    const now = new Date();
    const SCOPES = {
      upcoming: (a) => a.status === 'scheduled' && new Date(a.startsAt) > now,
      past: (a) => ['scheduled', 'completed', 'no_show'].includes(a.status) && new Date(a.startsAt) <= now,
      cancelled: (a) => a.status === 'cancelled',
      all: () => true,
    };
    const items = store.appointments.filter(SCOPES[query.scope || 'upcoming'])
      .sort((x, y) => (query.scope === 'upcoming' ? 1 : -1) * (new Date(x.startsAt) - new Date(y.startsAt)));
    return { as: 'client', scope: query.scope || 'upcoming', items: items.map((a) => appointmentView(a, store)) };
  });

  route('POST', /^\/appointments$/, (body, { me: who }) => {
    clientOnly(who);
    // Номер окна в демо: «психолог:дата:время»
    const [, pid, date, time] = /^(\d+):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/.exec(String(body.slotId || ''))
      || fail(404, 'NOT_FOUND', 'Окно не найдено');
    const p = findPsy(pid);
    const k = kOf(date);
    if (!freeOn(p, k).includes(time)) fail(409, 'SLOT_TAKEN', 'Это время уже заняли – выберите другое');
    const service = card(p).services.find((x) => x.code === (body.format || 'individual'))
      || fail(422, 'VALIDATION_ERROR', 'Психолог не работает в этом формате', { format: 'Выберите другой формат' });
    const store = clientStore();
    const a = { id: store.nextId++, status: 'scheduled', startsAt: startsAt(k, time), date, time, slotId: body.slotId,
      format: { code: service.code, name: service.name, durationMin: 50 }, price: service.price, note: body.note || null,
      meetingUrl: null, psychologist: psyRef(p), history: [event('created')] };
    store.appointments.push(a);
    saveClient(store);
    return appointmentView(a, store);
  });

  route('PATCH', /^\/appointments\/(\d+)$/, (body, { me: who, params: [id] }) => {
    clientOnly(who);
    const store = clientStore();
    const a = findAppt(store, id);
    if (body.status !== 'cancelled') fail(403, 'FORBIDDEN', 'Отметить встречу может только психолог');
    if (String(body.reason || '').trim().length < 3) fail(422, 'VALIDATION_ERROR', 'Укажите причину', { reason: 'Напишите причину' });
    if (!appointmentView(a, store).actions.cancel) fail(409, 'CANNOT_CANCEL', 'Отменить можно только запланированную встречу до её начала');
    a.status = 'cancelled';
    a.history.push(event('cancelled', { reason: body.reason }));
    saveClient(store);
    return appointmentView(a, store);
  });

  route('POST', /^\/appointments\/(\d+)\/reschedule$/, (body, { me: who, params: [id] }) => {
    clientOnly(who);
    const store = clientStore();
    const a = findAppt(store, id);
    if (String(body.reason || '').trim().length < 3) fail(422, 'VALIDATION_ERROR', 'Укажите причину', { reason: 'Напишите причину' });
    const [, pid, date, time] = /^(\d+):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/.exec(String(body.slotId || '')) || fail(404, 'NOT_FOUND', 'Окно не найдено');
    if (String(pid) !== String(a.psychologist.id) || !freeOn(findPsy(pid), kOf(date)).includes(time)) fail(409, 'SLOT_TAKEN', 'Это время уже заняли – выберите другое');
    const from = { date: a.date, time: a.time };
    Object.assign(a, { startsAt: startsAt(kOf(date), time), date, time, slotId: body.slotId });
    a.history.push(event('rescheduled', { reason: body.reason, from, to: { date, time } }));
    saveClient(store);
    return appointmentView(a, store);
  });

  route('GET', /^\/reviews$/, (_, { me: who }) => {
    clientOnly(who);
    return { items: [...clientStore().reviews].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)) };
  });
  const reviewBody = (body) => {
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', { rating: 'Оценка от 1 до 5' });
    return { rating, body: body.body || null, anonymous: body.anonymous === true };
  };
  route('POST', /^\/reviews$/, (body, { me: who }) => {
    clientOnly(who);
    const store = clientStore();
    const a = findAppt(store, body.appointmentId);
    if (!appointmentView(a, store).actions.review) fail(409, 'ALREADY_REVIEWED', 'Отзыв по этой консультации уже есть');
    const r = { id: store.nextId++, appointmentId: a.id, psychologist: a.psychologist, ...reviewBody(body),
      status: 'pending', moderationComment: null, reply: null, createdAt: new Date().toISOString() };
    store.reviews.push(r);
    saveClient(store);
    return r;
  });
  route('PATCH', /^\/reviews\/(\d+)$/, (body, { me: who, params: [id] }) => {
    clientOnly(who);
    const store = clientStore();
    const r = store.reviews.find((x) => String(x.id) === id) || fail(404, 'NOT_FOUND', 'Отзыв не найден');
    Object.assign(r, reviewBody(body), { status: 'pending', moderationComment: null });   // снова на проверку
    saveClient(store);
    return r;
  });
  route('DELETE', /^\/reviews\/(\d+)$/, (_, { me: who, params: [id] }) => {
    clientOnly(who);
    const store = clientStore();
    store.reviews = store.reviews.filter((x) => String(x.id) !== id);
    saveClient(store);
    return null;
  });

  /* ---------- Подбор по анкете: те же правила, что у сервера ---------- */

  route('POST', /^\/matching$/, (a) => {
    const want = {
      format: byCode(REFERENCES.formats, a.format)?.name || '',
      topics: (a.topics || []).map((c) => byCode(REFERENCES.topics, c)?.name).filter(Boolean),
      method: byCode(REFERENCES.methods, a.method)?.name || '',
      gender: { female: 'f', male: 'm' }[a.gender] || '',
      age: a.age || '', parts: a.parts || [], soon: a.soon === true,
    };
    const candidates = PSYCHOLOGISTS.map((p) => {
      const free = nextFree(p, { parts: want.parts });
      const miss = [];
      if (want.format && !p.formats.includes(want.format)) miss.push('format');
      if (want.topics.length && !p.topics.some((t) => want.topics.includes(t))) miss.push('topics');
      if (want.gender && p.gender !== want.gender) miss.push('gender');
      if (want.age === 'young' && p.age >= 35) miss.push('age');
      if (want.age === 'older' && p.age < 35) miss.push('age');
      if (want.method && !p.methods.includes(want.method)) miss.push('method');
      if (want.parts.length && !free) miss.push('time');
      if (want.soon && !(free && free.k <= 2)) miss.push('soon');
      const hits = p.topics.filter((t) => want.topics.includes(t));
      const score = hits.length * 10 + (want.method && p.methods.includes(want.method) ? 4 : 0) + p.rating + (free ? Math.max(0, 4 - free.k) : 0) * 0.5;
      return { p, free: free || nextFree(p), miss, hits, score };
    });
    const exact = candidates.filter((c) => !c.miss.length).sort((x, y) => y.score - x.score);
    const closest = candidates.filter((c) => c.miss.length && !c.miss.includes('format') && !c.miss.includes('topics'))
      .sort((x, y) => x.miss.length - y.miss.length || y.score - x.score);
    return {
      total: exact.length,
      exact: exact.length > 0,
      results: [...exact.slice(0, 3), ...closest].slice(0, 3).map((c) => ({
        ...card(c.p, c.free),
        match: { topics: c.hits.map((n) => byName(REFERENCES.topics, n)), method: Boolean(want.method) && c.p.methods.includes(want.method), misses: c.miss },
      })),
    };
  });

  /* ---------- Чат: демо-переписка из data.js (DIALOGS / PSY_DIALOGS) в виде ответов API ---------- */

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  /** «Сегодня», «Вчера», «12 октября» → дата */
  const parseDay = (label) => {
    const rel = { 'Сегодня': 0, 'Вчера': -1, 'Позавчера': -2 }[label];
    if (rel !== undefined) return demoDateAt(rel);
    const [d, m] = label.split(' ');
    return new Date(DEMO_TODAY.getFullYear(), MONTHS.indexOf(m), Number(d));
  };

  let chat = null;   // переписка собирается один раз на страницу
  const chatState = (user) => {
    if (chat) return chat;
    const isPsy = user.roles.includes('psychologist');
    let msgId = 1;
    const conversations = (isPsy ? PSY_DIALOGS : DIALOGS).filter((d) => d.photo).map((d) => {
      const partnerId = d.profile ? Number(new URLSearchParams(d.profile.split('?')[1]).get('id')) : d.id * 1000;
      let day = DEMO_TODAY;
      const messages = [];
      const events = [];
      d.messages.forEach((m) => {
        if (m.day) { day = parseDay(m.day); return; }
        const at = new Date(day);
        const [h, mi] = (m.time || '12:00').split(':').map(Number);
        at.setHours(h, mi);
        if (m.event) {
          events.push({ type: { booked: 'booked', moved: 'rescheduled', done: 'completed' }[m.event], at: at.toISOString(), label: m.text });
          return;
        }
        messages.push({
          id: msgId++, conversationId: d.id, senderId: m.from === 'me' ? user.id : partnerId,
          body: m.text || null, attachment: m.file ? { name: m.file.name } : null,
          createdAt: (at > new Date() ? new Date() : at).toISOString(), readAt: at.toISOString(),
        });
      });
      // Последние входящие – непрочитанные, как в демо
      messages.filter((m) => m.senderId !== user.id).slice(-d.unread).forEach((m) => { if (d.unread) m.readAt = null; });
      return {
        id: d.id, messages, events, typingReplies: 0,
        partner: { id: partnerId, role: isPsy ? 'client' : 'psychologist', name: d.name, headline: d.role, avatarUrl: d.photo },
        online: d.online, lastSeenText: d.lastSeen || null,
        nextSession: d.nextSession ? { label: d.nextSession } : null,
      };
    });
    chat = { conversations, nextId: msgId, replies: isPsy ? PSY_DEMO_REPLIES : DEMO_REPLIES };
    return chat;
  };
  const convOf = (user, id) => chatState(user).conversations.find((c) => String(c.id) === String(id))
    || fail(404, 'NOT_FOUND', 'Диалог не найден');
  const unreadOf = (user, c) => c.messages.filter((m) => m.senderId !== user.id && !m.readAt).length;

  route('GET', /^\/conversations$/, (_, { me: who }) => {
    const user = who();
    return {
      items: chatState(user).conversations.map((c) => ({
        id: c.id, partner: c.partner, online: c.online, lastSeenAt: null, lastSeenText: c.lastSeenText,
        lastMessage: c.messages[c.messages.length - 1] || null, unread: unreadOf(user, c), nextSession: c.nextSession,
      })),
    };
  });

  route('GET', /^\/conversations\/unread$/, (_, { me: who }) => {
    const user = who();
    const byConversation = {};
    chatState(user).conversations.forEach((c) => { const n = unreadOf(user, c); if (n) byConversation[c.id] = n; });
    return { total: Object.values(byConversation).reduce((a, b) => a + b, 0), byConversation };
  });

  route('GET', /^\/conversations\/(\d+)\/messages$/, (_, { me: who, params: [id] }) => {
    const c = convOf(who(), id);
    // Копии – как с сервера: страница не должна видеть изменения демо-хранилища напрямую
    return { conversationId: c.id, messages: c.messages.map((m) => ({ ...m })), events: c.events.map((e) => ({ ...e })), hasMore: false };
  });

  /** Новое сообщение в демо-диалоге (текст или файл – только имя, сам файл никуда не уходит) */
  const addMessage = (user, id, body, fileName) => {
    const c = convOf(user, id);
    const text = String(body || '').trim();
    if (!text && !fileName) fail(422, 'VALIDATION_ERROR', 'Пустое сообщение', { body: 'Напишите сообщение' });
    const m = { id: chat.nextId++, conversationId: c.id, senderId: user.id, body: text || null,
      attachment: fileName ? { name: fileName } : null, createdAt: new Date().toISOString(), readAt: null };
    c.messages.push(m);
    return { ...m };
  };
  route('POST', /^\/conversations\/(\d+)\/messages$/, (body, { me: who, params: [id] }) => addMessage(who(), id, body.body));
  route('POST', /^\/conversations\/(\d+)\/attachments$/, (form, { me: who, params: [id] }) => {
    const file = form instanceof FormData ? form.get('file') : null;
    return addMessage(who(), id, form instanceof FormData ? form.get('body') : '', file ? file.name : 'файл');
  });
  route('POST', /^\/conversations\/(\d+)\/read$/, (_, { me: who, params: [id] }) => {
    const user = who();
    const c = convOf(user, id);
    const unread = c.messages.filter((m) => m.senderId !== user.id && !m.readAt);
    unread.forEach((m) => { m.readAt = new Date().toISOString(); });
    return { conversationId: c.id, read: unread.length };
  });

  /** Ответ собеседника в демо (сервера и живого собеседника нет): следующий из заготовленных */
  const demoReply = (conversationId) => {
    const user = load(USER_KEY);
    if (!user || !chat) return null;
    const c = chat.conversations.find((x) => x.id === conversationId);
    if (!c || !c.online) return null;
    const m = { id: chat.nextId++, conversationId: c.id, senderId: c.partner.id,
      body: chat.replies[c.typingReplies++ % chat.replies.length], attachment: null,
      createdAt: new Date().toISOString(), readAt: null };
    c.messages.push(m);
    return { ...m };
  };

  /* ---------- Разбор запроса ---------- */

  async function handle(method, url, body) {
    const [path, search = ''] = url.split('?');
    const query = Object.fromEntries(new URLSearchParams(search));
    const found = routes.find((r) => r.method === method && r.pattern.test(path));
    if (!found) fail(501, 'DEMO_MISSING', 'В демо-режиме без сервера это действие недоступно');
    const params = path.match(found.pattern).slice(1);
    return found.handler(body || {}, { query, params, me });
  }

  return {
    handle,
    route,
    fail,
    me,
    demoReply,
    /** Файлы в демо – образцы (их нет на диске сайта, поэтому – картинка-заглушка из assets) */
    fileUrl: () => 'assets/img/quiz/start.webp',
  };
})();
