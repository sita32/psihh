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
    // Психолог, зарегистрированный в этом браузере, входит снова психологом (его анкета – в ryadom-demo-psy)
    const psy = !ACCOUNTS[email] && (load(PSY_KEY) || {})[email];
    const user = account(email, psy ? { id: 100, roles: ['psychologist'], firstName: psy.profile?.firstName || null,
      lastName: psy.profile?.lastName || null, avatarUrl: psy.profile?.avatarUrl || null } : {});
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
    if (psy) {
      // Новая анкета: пол и дата начала практики – из формы регистрации
      const store = newPsyStore(user);
      Object.assign(store.profile, { gender: body.gender === 'male' ? 'male' : 'female', practiceSince: body.practiceSince || null });
      savePsy(user, store);
    }
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

  /* ---------- Кабинет психолога: анкета, фото, документы, заявка на проверку ----------
     Марина – из data.js, новый психолог (регистрация в демо) – пустая анкета.
     Хранится в localStorage по почте, фото – уменьшенной картинкой (data:URL). */

  const PSY_KEY = 'ryadom-demo-psy';
  const isPsy = (u) => u.roles.includes('psychologist');
  const psyOnly = (who) => { const u = who(); if (!isPsy(u)) fail(403, 'FORBIDDEN', 'Недостаточно прав для этого действия'); return u; };
  const yearsSince = (date) => {
    if (!date) return null;
    const d = new Date(`${date}T00:00:00`), now = new Date();
    let y = now.getFullYear() - d.getFullYear();
    if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) y -= 1;
    return Math.max(0, y);
  };

  const newPsyStore = (u) => {
    if (u.email !== 'marina@ryadom.by') {
      return { profile: { firstName: u.firstName || '', lastName: u.lastName || '', middleName: null, gender: 'female', birthDate: null,
        phone: null, avatarUrl: null, headline: null, bio: null, approach: null, practiceSince: null, experienceYears: null,
        verificationStatus: 'draft', verifiedAt: null, isPublished: false, rating: 0, reviewsCount: 0,
        methods: [], topics: [], services: [] }, documents: [], requests: [], nextId: 1 };
    }
    const p = findPsy(1);
    const c = card(p);
    const [uni, year] = p.edu.split(' · ');
    const [institution, specialty] = uni.split(', ');
    const at = (k) => demoDateAt(k).toISOString();
    // Дата, когда исполнится ровно n полных лет (на day дней раньше)
    const yearsAgo = (n, day) => { const d = new Date(DEMO_TODAY); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - day); return isoDate(d); };
    const doc = (id, type, inst, spec, y, fileName) => ({ id, type, institution: inst, specialty: spec, year: y, fileName,
      mimeType: 'application/pdf', size: 1048576, status: 'approved', comment: null, reviewedAt: at(-110), uploadedAt: at(-116) });
    return {
      profile: { firstName: c.firstName, lastName: c.lastName, middleName: null, gender: c.gender,
        birthDate: yearsAgo(p.age, 90), phone: null, avatarUrl: c.avatarUrl,
        headline: p.role, bio: p.about, approach: PSY_EXTRA.steps.join('. '),
        practiceSince: yearsAgo(p.exp, 30), experienceYears: null,
        verificationStatus: 'verified', verifiedAt: at(-110), isPublished: true, rating: p.rating, reviewsCount: p.reviews,
        methods: c.methods, topics: c.topics, services: c.services },
      documents: [doc(15, 'diploma', institution, specialty, Number(year), 'Диплом.pdf'),
        doc(16, 'certificate', PSY_EXTRA.courses[0].place, PSY_EXTRA.courses[0].title, PSY_EXTRA.courses[0].year, 'Сертификат.pdf')],
      requests: [{ id: 1, status: 'approved', submittedAt: at(-116), reviewedAt: at(-110), comment: null }],
      nextId: 100,
    };
  };
  const psyStore = (u) => {
    const all = load(PSY_KEY) || {};
    if (!all[u.email]) { all[u.email] = newPsyStore(u); save(PSY_KEY, all); }
    return all[u.email];
  };
  const savePsy = (u, store) => { const all = load(PSY_KEY) || {}; all[u.email] = store; save(PSY_KEY, all); };
  /** Анкета в виде ответа API: опыт – от даты начала практики, документы – кратко */
  const psyProfile = (store) => (store.profile ? {
    ...store.profile, experienceYears: yearsSince(store.profile.practiceSince),
    documents: store.documents.map(({ id, type, institution, specialty, year, fileName, status, comment }) => ({ id, type, institution, specialty, year, fileName, status, comment })),
  } : null);
  /** Имя и фото в шапке – по анкете */
  const syncUser = (store) => {
    const user = load(USER_KEY);
    if (user && store.profile) save(USER_KEY, { ...user, firstName: store.profile.firstName, lastName: store.profile.lastName, avatarUrl: store.profile.avatarUrl });
  };
  const needPsyProfile = (store) => store.profile || fail(409, 'NO_PROFILE', 'Сначала заполните анкету психолога');

  const patchPsy = (u, body) => {
    const store = psyStore(u);
    const fields = {};
    const text = (v) => (v === null || v === undefined ? v : String(v).trim() || null);
    ['firstName', 'lastName'].forEach((k) => { if (body[k] !== undefined && !text(body[k])) fields[k] = k === 'firstName' ? 'Укажите имя' : 'Укажите фамилию'; });
    if (body.gender !== undefined && !['female', 'male'].includes(body.gender)) fields.gender = 'Укажите пол';
    if (body.practiceSince !== undefined && !/^\d{4}-\d\d-\d\d$/.test(body.practiceSince || '')) fields.practiceSince = 'Укажите дату начала практики';
    if (body.practiceSince && body.practiceSince > isoDate(new Date())) fields.practiceSince = 'Дата начала практики не может быть в будущем';
    const codes = (list, value) => (value === undefined ? undefined : value.map((code) => byCode(list, code)).filter(Boolean));
    let services;
    if (body.services !== undefined) {
      services = [];
      body.services.forEach((x) => {
        const f = byCode(REFERENCES.formats, x.format);
        if (!f) fields.services = `Неизвестный формат: ${x.format}`;
        else if (!(x.price > 0 && x.price <= 10000)) fields.services = 'Цена – от 1 до 10 000 BYN';
        else services.push({ ...f, price: Math.round(x.price * 100) / 100, durationMin: x.durationMin || 50 });
      });
    }
    if (!store.profile) {
      // Анкеты нет (удалена) – создаём заново, для этого нужны обязательные поля
      [['firstName', 'имя'], ['lastName', 'фамилию'], ['gender', 'пол'], ['practiceSince', 'дату начала практики']]
        .forEach(([k, label]) => { if (body[k] === undefined && !fields[k]) fields[k] = `Укажите ${label}`; });
    }
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', fields);
    store.profile ??= { ...newPsyStore({ email: '' }).profile };
    const pr = store.profile;
    if (body.isPublished && pr.verificationStatus !== 'verified') {
      fail(409, 'NOT_VERIFIED', 'Анкету можно опубликовать после проверки документов модератором');
    }
    ['firstName', 'lastName', 'middleName', 'headline', 'bio', 'approach', 'phone'].forEach((k) => { if (body[k] !== undefined) pr[k] = text(body[k]); });
    ['gender', 'birthDate', 'practiceSince', 'isPublished'].forEach((k) => { if (body[k] !== undefined) pr[k] = body[k]; });
    if (body.methods !== undefined) pr.methods = codes(REFERENCES.methods, body.methods);
    if (body.topics !== undefined) pr.topics = codes(REFERENCES.topics, body.topics);
    if (services) pr.services = services;
    savePsy(u, store);
    syncUser(store);
    return { role: 'psychologist', profile: psyProfile(store) };
  };

  const deletePsy = (u) => {
    const store = psyStore(u);
    needPsyProfile(store);
    // У Марины есть записи из data.js – как на сервере, удалить анкету с историей нельзя
    if (u.email === 'marina@ryadom.by') {
      const upcoming = PSY_SESSIONS.filter((x) => x.status === 'scheduled' && x.k >= 0).length;
      if (upcoming) fail(409, 'HAS_UPCOMING_APPOINTMENTS', `Сначала отмените предстоящие записи (${upcoming})`);
      fail(409, 'HAS_APPOINTMENTS', 'По анкете есть история консультаций – её нельзя удалить, но можно скрыть из каталога');
    }
    store.profile = null;
    store.documents = [];
    store.requests = [];
    savePsy(u, store);
    return null;
  };

  /** Фото в демо – уменьшенная копия (до 480 px), чтобы поместиться в localStorage */
  const shrinkImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });

  route('POST', /^\/profile\/avatar$/, async (form, { me: who }) => {
    const u = psyOnly(who);
    const store = psyStore(u);
    needPsyProfile(store);
    const file = form instanceof FormData ? form.get('file') : null;
    if (!file) fail(422, 'VALIDATION_ERROR', 'Прикрепите фото', { file: 'JPG, PNG или WEBP' });
    const src = await shrinkImage(file).catch(() => fail(422, 'VALIDATION_ERROR', 'Неподходящий формат фото', { file: 'JPG, PNG или WEBP' }));
    store.profile.avatarUrl = src;
    savePsy(u, store);
    syncUser(store);
    return { role: 'psychologist', profile: psyProfile(store) };
  });
  route('DELETE', /^\/profile\/avatar$/, (_, { me: who }) => {
    const u = psyOnly(who);
    const store = psyStore(u);
    if (store.profile) store.profile.avatarUrl = null;
    savePsy(u, store);
    syncUser(store);
    return { role: 'psychologist', profile: psyProfile(store) };
  });

  const verificationView = (store) => ({ status: needPsyProfile(store).verificationStatus, documents: store.documents, requests: store.requests });
  route('GET', /^\/profile\/verification$/, (_, { me: who }) => verificationView(psyStore(psyOnly(who))));
  route('POST', /^\/profile\/verification$/, (_, { me: who }) => {
    const u = psyOnly(who);
    const store = psyStore(u);
    const pr = needPsyProfile(store);
    if (pr.verificationStatus === 'verified') fail(409, 'ALREADY_VERIFIED', 'Статус специалиста уже подтверждён');
    if (pr.verificationStatus === 'pending') fail(409, 'REQUEST_PENDING', 'Заявка уже на проверке');
    const fields = {};
    if (!pr.headline) fields.headline = 'Добавьте короткую подпись: кто вы как специалист';
    if (!pr.bio) fields.bio = 'Расскажите об опыте';
    if (!pr.methods.length) fields.methods = 'Выберите методы работы';
    if (!pr.topics.length) fields.topics = 'Выберите темы, с которыми работаете';
    if (!pr.services.length) fields.services = 'Укажите цену хотя бы одного формата';
    if (!store.documents.some((d) => d.status !== 'rejected')) fields.documents = 'Загрузите диплом о психологическом образовании';
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Перед проверкой заполните анкету', fields);
    pr.verificationStatus = 'pending';
    pr.isPublished = false;
    store.requests.unshift({ id: store.nextId++, status: 'pending', submittedAt: new Date().toISOString(), reviewedAt: null, comment: null });
    savePsy(u, store);
    return verificationView(store);
  });

  route('POST', /^\/profile\/documents$/, (form, { me: who }) => {
    const u = psyOnly(who);
    const store = psyStore(u);
    needPsyProfile(store);
    const get = (k) => (form instanceof FormData ? String(form.get(k) || '').trim() : '');
    const file = form instanceof FormData ? form.get('file') : null;
    if (!file) fail(422, 'VALIDATION_ERROR', 'Прикрепите файл', { file: 'PDF, JPG, PNG или WEBP' });
    const type = get('type') || 'diploma';
    if (type === 'diploma' && !get('institution')) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', { institution: 'Укажите, кто выдал диплом' });
    if (store.documents.length >= 10) fail(409, 'TOO_MANY_DOCUMENTS', 'Можно загрузить не больше 10 документов');
    const doc = { id: store.nextId++, type, institution: get('institution') || null, specialty: get('specialty') || null,
      year: get('year') ? Number(get('year')) : null, fileName: file.name, mimeType: file.type, size: file.size,
      status: 'pending', comment: null, reviewedAt: null, uploadedAt: new Date().toISOString() };
    store.documents.push(doc);
    savePsy(u, store);
    return doc;
  });
  route('DELETE', /^\/profile\/documents\/(\d+)$/, (_, { me: who, params: [id] }) => {
    const u = psyOnly(who);
    const store = psyStore(u);
    const doc = store.documents.find((d) => String(d.id) === id) || fail(404, 'NOT_FOUND', 'Документ не найден');
    if (doc.status === 'approved') fail(409, 'DOCUMENT_APPROVED', 'Проверенный документ удалить нельзя');
    store.documents = store.documents.filter((d) => d !== doc);
    savePsy(u, store);
    return null;
  });

  /* ---------- Кабинет психолога: записи и расписание ----------
     У Марины – записи PSY_SESSIONS и окна по шаблону недели PSY_TEMPLATE (неделя назад … 6 недель вперёд),
     у нового психолога – пусто. Хранится вместе с анкетой (ryadom-demo-psy). */

  const DEMO_PAST_DAYS = 7;
  const DEMO_AHEAD_DAYS = 42;
  // Собеседник в демо-чате с тем же именем – чтобы «Написать клиенту» открывал его диалог
  const demoClient = (c) => {
    const d = PSY_DIALOGS.find((x) => x.name === c.name);
    return { id: d ? d.id * 1000 : 5000 + c.id, name: c.name, avatarUrl: c.avatar ? `assets/img/avatars/${c.avatar}.webp` : null };
  };
  const psyEvent = (type, extra = {}) => ({ type, at: new Date().toISOString(), by: { role: 'psychologist', name: 'Вы' }, reason: null, ...extra });

  /** Записи и окна Марины при первом обращении */
  const buildBook = (u) => {
    const book = { appointments: [], slots: [], nextSlot: 1 };
    if (u.email !== 'marina@ryadom.by') return book;
    const addSlot = (k, time, status) => {
      const slot = { id: book.nextSlot++, date: isoDate(demoDateAt(k)), time, startsAt: startsAt(k, time), status };
      book.slots.push(slot);
      return slot;
    };
    for (let k = -DEMO_PAST_DAYS; k <= DEMO_AHEAD_DAYS; k += 1) {
      if (!PSY_TEMPLATE.days.includes(demoDateAt(k).getDay())) continue;
      // для демо часть окон закрыта (личное время) – как раньше на странице расписания
      PSY_TEMPLATE.times.forEach((time, i) => addSlot(k, time, (k + 21 + i * 2) % 11 === 0 ? 'blocked' : 'free'));
    }
    PSY_SESSIONS.forEach((x) => {
      const date = isoDate(demoDateAt(x.k));
      let slot = book.slots.find((sl) => sl.date === date && sl.time === x.time);
      if (!slot) slot = addSlot(x.k, x.time, 'free');
      if (x.status !== 'cancelled') slot.status = 'booked';
      const c = PSY_CLIENTS.find((y) => y.id === x.client);
      book.appointments.push({
        id: x.id, status: x.status, startsAt: slot.startsAt, date, time: x.time, slotId: x.status === 'cancelled' ? null : slot.id,
        format: { code: 'individual', name: x.format, durationMin: 50 }, price: x.price, note: x.note || null, meetingUrl: null,
        nth: x.nth, client: demoClient(c), psychologist: psyRef(findPsy(1)),
        history: x.hist.map((h) => {
          const m = /с (\d\d:\d\d) на (\d\d:\d\d)/.exec(h.text);
          return {
            type: (HIST_TYPES.find(([re]) => re.test(h.text)) || [, 'created'])[1], at: atOf(h.k, h.time), reason: h.reason || null,
            by: h.by === 'Вы' ? { role: 'psychologist', name: 'Вы' } : { role: 'client', name: h.by },
            ...(m && { from: { date, time: m[1] }, to: { date, time: m[2] } }),
          };
        }),
      });
    });
    book.slots.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    return book;
  };
  /** Анкета + записи + окна психолога (записи и окна досоздаются у старых демо-хранилищ) */
  const psyBook = (u) => {
    const store = psyStore(u);
    if (!store.book) { store.book = buildBook(u); savePsy(u, store); }
    return store;
  };
  /** Запись глазами психолога: доступные действия – как на сервере */
  const psyAppointmentView = (a) => {
    const started = new Date(a.startsAt) <= new Date();
    const open = a.status === 'scheduled';
    return { ...a, needsMark: open && started, hasReview: false, review: null,
      actions: { cancel: open && !started, reschedule: open && !started, markCompleted: open && started, markNoShow: open && started, review: false } };
  };
  const findPsyAppt = (store, id) => store.book.appointments.find((a) => String(a.id) === String(id)) || fail(404, 'NOT_FOUND', 'Запись не найдена');

  const listPsyAppointments = (u, query) => {
    const store = psyBook(u);
    const now = new Date();
    const SCOPES = {
      upcoming: (a) => a.status === 'scheduled' && new Date(a.startsAt) > now,
      past: (a) => ['scheduled', 'completed', 'no_show'].includes(a.status) && new Date(a.startsAt) <= now,
      cancelled: (a) => a.status === 'cancelled',
      all: () => true,
    };
    const scope = query.scope || 'upcoming';
    const items = store.book.appointments.filter(SCOPES[scope])
      .sort((x, y) => (scope === 'upcoming' ? 1 : -1) * (new Date(x.startsAt) - new Date(y.startsAt)));
    return { as: 'psychologist', scope, items: items.map(psyAppointmentView) };
  };

  const changePsyAppointment = (u, id, body) => {
    const store = psyBook(u);
    const a = findPsyAppt(store, id);
    const view = psyAppointmentView(a);
    if (body.status === 'cancelled') {
      if (String(body.reason || '').trim().length < 3) fail(422, 'VALIDATION_ERROR', 'Укажите причину', { reason: 'Напишите причину – её увидит другая сторона' });
      if (!view.actions.cancel) fail(409, 'CANNOT_CANCEL', 'Отменить можно только запланированную встречу до её начала');
      const slot = store.book.slots.find((x) => x.id === a.slotId);
      if (slot) slot.status = 'free';                  // окно снова свободно
      a.status = 'cancelled';
      a.history.push(psyEvent('cancelled', { reason: String(body.reason).trim() }));
    } else if (body.status === 'completed' || body.status === 'no_show') {
      if (!view.actions.markCompleted) fail(409, 'CANNOT_MARK', a.status === 'scheduled' ? 'Консультация ещё не началась' : 'Встреча уже отмечена');
      a.status = body.status;
      a.history.push(psyEvent(body.status));
    } else {
      fail(422, 'VALIDATION_ERROR', 'status – cancelled, completed или no_show', { status: 'cancelled, completed, no_show' });
    }
    savePsy(u, store);
    return psyAppointmentView(a);
  };

  const reschedulePsyAppointment = (u, id, body) => {
    const store = psyBook(u);
    const a = findPsyAppt(store, id);
    if (String(body.reason || '').trim().length < 3) fail(422, 'VALIDATION_ERROR', 'Укажите причину', { reason: 'Напишите причину – её увидит другая сторона' });
    if (!psyAppointmentView(a).actions.reschedule) fail(409, 'CANNOT_RESCHEDULE', 'Перенести можно только запланированную встречу до её начала');
    const slot = store.book.slots.find((x) => String(x.id) === String(body.slotId)) || fail(404, 'NOT_FOUND', 'Окно не найдено');
    if (new Date(slot.startsAt) <= new Date()) fail(409, 'SLOT_PAST', 'Это время уже прошло');
    if (slot.status !== 'free') fail(409, 'SLOT_TAKEN', 'Это время уже заняли – выберите другое');
    const old = store.book.slots.find((x) => x.id === a.slotId);
    if (old) old.status = 'free';
    slot.status = 'booked';
    const from = { date: a.date, time: a.time };
    Object.assign(a, { startsAt: slot.startsAt, date: slot.date, time: slot.time, slotId: slot.id });
    a.history.push(psyEvent('rescheduled', { reason: String(body.reason).trim(), from, to: { date: slot.date, time: slot.time } }));
    savePsy(u, store);
    return psyAppointmentView(a);
  };

  /** Окно расписания в виде ответа API: у занятого – кто записан */
  const psySlotView = (store, slot) => {
    const a = slot.status === 'booked' && store.book.appointments.find((x) => x.slotId === slot.id && x.status !== 'cancelled');
    return { id: slot.id, startsAt: slot.startsAt, endsAt: new Date(new Date(slot.startsAt).getTime() + 50 * 60000).toISOString(),
      date: slot.date, time: slot.time, status: slot.status,
      ...(a && { appointment: { id: a.id, status: a.status, client: { id: a.client.id, name: a.client.name },
        format: { code: a.format.code, name: a.format.name }, price: a.price, note: a.note } }) };
  };
  route('GET', /^\/schedule\/slots$/, (_, { me: who, query }) => {
    const u = psyOnly(who);
    const store = psyBook(u);
    const from = query.from || isoDate(new Date());
    const to = query.to || from;
    return { from, to, timezone: 'Europe/Minsk',
      slots: store.book.slots.filter((x) => x.date >= from && x.date <= to).map((x) => psySlotView(store, x)) };
  });

  /** Своё окно, которое ещё можно менять – те же проверки, что на сервере */
  const ownSlot = (store, id) => {
    const slot = store.book.slots.find((x) => String(x.id) === String(id)) || fail(404, 'NOT_FOUND', 'Окно не найдено');
    if (new Date(slot.startsAt) <= new Date()) fail(409, 'SLOT_PAST', 'Это время уже прошло');
    if (slot.status === 'booked') fail(409, 'SLOT_BOOKED', 'На это окно записан клиент – сначала отмените или перенесите запись');
    return slot;
  };
  route('POST', /^\/schedule\/slots$/, (body, { me: who }) => {
    const u = psyOnly(who);
    const store = psyBook(u);
    needPsyProfile(store);
    const items = Array.isArray(body.slots) ? body.slots : [];
    if (!items.length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', { slots: 'Передайте хотя бы одно окно: [{ date, time }]' });
    if (items.length > 300) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', { slots: 'Не больше 300 окон за раз' });
    const len = (body.durationMin || 50) * 60000;
    let created = 0;
    const skipped = [];
    items.forEach(({ date, time }) => {
      const start = new Date(`${date}T${time}:00`);
      if (start <= new Date()) { skipped.push({ date, time, reason: 'past' }); return; }
      // Две сессии психолога не могут идти одновременно (в базе – ограничение ex_slots_no_overlap)
      if (store.book.slots.some((x) => Math.abs(new Date(x.startsAt) - start) < len)) { skipped.push({ date, time, reason: 'overlap' }); return; }
      store.book.slots.push({ id: store.book.nextSlot++, date, time, startsAt: start.toISOString(), status: 'free' });
      created += 1;
    });
    store.book.slots.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    savePsy(u, store);
    return { created, skipped };
  });
  route('PATCH', /^\/schedule\/slots\/(\d+)$/, (body, { me: who, params: [id] }) => {
    const u = psyOnly(who);
    const store = psyBook(u);
    if (!['free', 'blocked'].includes(body.status)) fail(422, 'VALIDATION_ERROR', 'Статус окна – free или blocked', { status: 'free или blocked' });
    const slot = ownSlot(store, id);
    slot.status = body.status;
    savePsy(u, store);
    return { id: slot.id, status: slot.status };
  });
  route('DELETE', /^\/schedule\/slots\/(\d+)$/, (_, { me: who, params: [id] }) => {
    const u = psyOnly(who);
    const store = psyBook(u);
    const slot = ownSlot(store, id);
    if (store.book.appointments.some((a) => a.slotId === slot.id)) {
      fail(409, 'SLOT_HAS_HISTORY', 'С этим окном связана история записей – его можно закрыть, но не удалить');
    }
    store.book.slots = store.book.slots.filter((x) => x !== slot);
    savePsy(u, store);
    return null;
  });
  route('POST', /^\/schedule\/block-day$/, (body, { me: who }) => {
    const u = psyOnly(who);
    const store = psyBook(u);
    const free = store.book.slots.filter((x) => x.date === body.date && x.status === 'free' && new Date(x.startsAt) > new Date());
    free.forEach((x) => { x.status = 'blocked'; });
    savePsy(u, store);
    return { date: body.date, blocked: free.length };
  });

  /* ---------- Кабинет психолога: отзывы о себе (у Марины – из REVIEWS), ответ и жалоба ---------- */

  const psyReviews = (u) => {
    const store = psyStore(u);
    if (!store.reviews) {
      store.reviews = u.email !== 'marina@ryadom.by' ? [] : REVIEWS.filter((r) => r.psy === 1).map((r, i) => ({
        id: 100 + i, author: r.name, anonymous: r.name === 'Аноним', rating: r.rating, body: r.text, sessions: r.sessions,
        createdAt: new Date(`${r.date}T12:00:00`).toISOString(), reply: r.reply ? { text: r.reply, at: null } : null,
        status: 'approved', report: null,
      }));
      // Жалоба на анонимную «тройку» уже на рассмотрении – как в демо-базе (MOD_REVIEWS)
      const rep = MOD_REVIEWS.find((x) => x.kind === 'report' && x.psy === 1);
      const target = rep && store.reviews.find((r) => r.body === rep.text);
      if (target) target.report = { id: store.nextId++, status: 'pending', reason: rep.report.reason, createdAt: demoDateAt(rep.report.k).toISOString(), comment: null, resolvedAt: null };
      savePsy(u, store);
    }
    return store;
  };
  const findMyReview = (store, id) => store.reviews.find((r) => String(r.id) === id) || fail(404, 'NOT_FOUND', 'Отзыв не найден');

  route('GET', /^\/psychologists\/me\/reviews$/, (_, { me: who }) => {
    const u = psyOnly(who);
    const items = psyReviews(u).reviews.filter((r) => r.status === 'approved').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    items.forEach((r) => { dist[r.rating] += 1; });
    const avg = items.length ? Math.round((items.reduce((sum, r) => sum + r.rating, 0) / items.length) * 100) / 100 : null;
    // На проверке у модератора – отзывы Анны о Марине со статусом pending
    const pending = u.email === 'marina@ryadom.by' ? CLIENT_REVIEWS.filter((r) => r.psy === 1 && r.status === 'pending').length : 0;
    return { summary: { rating: avg, count: items.length, distribution: dist, pending }, items, page: 1, pages: 1 };
  });
  route('PUT', /^\/reviews\/(\d+)\/reply$/, (body, { me: who, params: [id] }) => {
    const u = psyOnly(who);
    const store = psyReviews(u);
    const r = findMyReview(store, id);
    const text = String(body.text || '').trim();
    if (!text) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', { text: 'Напишите ответ' });
    r.reply = { text, at: new Date().toISOString() };
    savePsy(u, store);
    return r;
  });
  route('DELETE', /^\/reviews\/(\d+)\/reply$/, (_, { me: who, params: [id] }) => {
    const u = psyOnly(who);
    const store = psyReviews(u);
    const r = findMyReview(store, id);
    r.reply = null;
    savePsy(u, store);
    return r;
  });
  route('POST', /^\/reviews\/(\d+)\/report$/, (body, { me: who, params: [id] }) => {
    const u = psyOnly(who);
    const store = psyReviews(u);
    const r = findMyReview(store, id);
    const reason = String(body.reason || '').trim();
    if (!reason) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', { reason: 'Опишите, что не так с отзывом' });
    if (r.report && r.report.status === 'pending') fail(409, 'REPORT_PENDING', 'Жалоба на этот отзыв уже на рассмотрении');
    r.report = { id: store.nextId++, status: 'pending', reason, createdAt: new Date().toISOString(), comment: null, resolvedAt: null };
    savePsy(u, store);
    return r;
  });

  // Профиль: психолог – анкета (выше), клиент – личные данные
  route('GET', /^\/profile$/, (_, { me: who }) => (isPsy(who())
    ? { role: 'psychologist', profile: psyProfile(psyStore(who())) }
    : { role: 'client', profile: clientStore(clientOnly(who)).profile }));
  route('PATCH', /^\/profile$/, (body, { me: who }) => {
    if (isPsy(who())) return patchPsy(who(), body);
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
    if (isPsy(who())) return deletePsy(who());
    clientOnly(who);
    const upcoming = clientStore().appointments.filter((a) => a.status === 'scheduled' && new Date(a.startsAt) > new Date()).length;
    if (upcoming) fail(409, 'HAS_UPCOMING_APPOINTMENTS', `Сначала отмените предстоящие сессии (${upcoming})`);
    forget(CLIENT_KEY);
    forget(USER_KEY);
    return null;
  });

  route('GET', /^\/appointments$/, (_, { me: who, query }) => {
    if (isPsy(who())) return listPsyAppointments(who(), query);
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
    if (isPsy(who())) return changePsyAppointment(who(), id, body);
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
    if (isPsy(who())) return reschedulePsyAppointment(who(), id, body);
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

  /* ---------- Панель модератора: пользователи (MOD_USERS из data.js) ----------
     Изменения и журнал действий хранятся в localStorage 'ryadom-demo-mod'. */

  const MOD_KEY = 'ryadom-demo-mod';
  const modOnly = (who, permission) => {
    const u = who();
    if (!u.permissions.includes(permission)) fail(403, 'FORBIDDEN', 'Недостаточно прав для этого действия');
    return u;
  };
  const modStore = () => {
    const saved = load(MOD_KEY);
    if (saved) return saved;
    const at = (k) => demoDateAt(k).toISOString();
    const users = MOD_USERS.map((x) => {
      const [firstName, ...rest] = x.name.split(' ');
      // id демо-аккаунтов (Марина, модератор) – как у вошедшего, чтобы «это вы» совпадало; остальные – с 500, чтобы не пересечься
      const id = (ACCOUNTS[x.email] || {}).id || 500 + x.id;
      const blocks = (x.blocks || []).map((b, i) => ({ id: i + 1, reason: b.reason, blockedAt: at(b.k), until: null, unblockedAt: null, blockedBy: 3 }));
      return {
        id, email: x.email, name: x.name, roles: x.roles, status: x.status,
        avatarUrl: x.photo ? `assets/img/psychologists/${x.photo}.webp` : x.avatar ? `assets/img/avatars/${x.avatar}.webp` : null,
        verificationStatus: x.roles.includes('psychologist') ? (x.pending ? 'pending' : 'verified') : undefined,
        createdAt: at(x.reg), lastLoginAt: at(x.last),
        block: x.status === 'blocked' && blocks[0] ? { id: blocks[0].id, reason: blocks[0].reason, blockedAt: blocks[0].blockedAt, until: null } : null,
        profile: x.roles.includes('moderator') ? null : { firstName, lastName: rest.join(' ') || null },
        appointments: { asClient: x.roles.includes('client') ? (x.id === 1 ? CLIENT_SESSIONS.length : 1) : 0,
          asPsychologist: x.roles.includes('psychologist') ? (x.id === 101 ? PSY_SESSIONS.length : 0) : 0 },
        blocks,
      };
    });
    const store = { users, audit: [], nextId: 1000 };
    save(MOD_KEY, store);
    return store;
  };
  const saveMod = (store) => save(MOD_KEY, store);
  const modUserView = ({ profile, appointments, blocks, ...row }) => row;
  const findModUser = (store, id) => store.users.find((x) => String(x.id) === String(id)) || fail(404, 'NOT_FOUND', 'Пользователь не найден');
  /** С модераторами и с собой эти действия недоступны – как на сервере */
  const assertCanManage = (moderator, target) => {
    if (target.id === moderator.id) fail(403, 'FORBIDDEN', 'Это действие нельзя применить к себе');
    if (target.roles.includes('moderator')) fail(403, 'FORBIDDEN', 'Модераторов этой панелью не изменить');
  };
  /** Запись в журнал действий – в том же виде, что GET /api/admin/audit */
  const modAudit = (store, moderator, action, entityType, entityId, details) => {
    store.audit.unshift({ id: store.nextId++, action, entityType, entityId, details, ip: null, createdAt: new Date().toISOString(),
      actor: { id: moderator.id, name: moderator.email.split('@')[0], email: moderator.email } });
  };

  route('GET', /^\/admin\/users$/, (_, { me: who, query }) => {
    modOnly(who, 'users.view');
    const store = modStore();
    const q = String(query.q || '').trim().toLowerCase();
    const items = store.users.filter((x) => (!q || x.name.toLowerCase().includes(q) || x.email.includes(q))
      && (!query.role || x.roles.includes(query.role)) && (!query.status || x.status === query.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const limit = Number(query.limit) || 20, page = Number(query.page) || 1;
    return { items: items.slice((page - 1) * limit, page * limit).map(modUserView), total: items.length, page, pages: Math.ceil(items.length / limit) };
  });
  route('GET', /^\/admin\/users\/(\d+)$/, (_, { me: who, params: [id] }) => {
    modOnly(who, 'users.view');
    return findModUser(modStore(), id);
  });
  route('PATCH', /^\/admin\/users\/(\d+)$/, (body, { me: who, params: [id] }) => {
    const moderator = modOnly(who, 'users.edit');
    const store = modStore();
    const target = findModUser(store, id);
    assertCanManage(moderator, target);
    const fields = {};
    if (body.firstName !== undefined && !String(body.firstName).trim()) fields.firstName = 'Укажите имя';
    if (target.roles.includes('psychologist') && body.lastName !== undefined && !String(body.lastName || '').trim()) fields.lastName = 'Укажите фамилию';
    if (Object.keys(fields).length) fail(422, 'VALIDATION_ERROR', 'Проверьте поля формы', fields);
    if (!target.profile) fail(409, 'NO_PROFILE', 'У пользователя нет профиля');
    if (body.firstName !== undefined) target.profile.firstName = String(body.firstName).trim();
    if (body.lastName !== undefined) target.profile.lastName = String(body.lastName || '').trim() || null;
    target.name = [target.profile.firstName, target.profile.lastName].filter(Boolean).join(' ');
    modAudit(store, moderator, 'user.edit', 'user', target.id, { user: target.name, fields: Object.keys(body) });
    saveMod(store);
    return { role: target.roles.includes('psychologist') ? 'psychologist' : 'client', profile: target.profile };
  });
  route('PUT', /^\/admin\/users\/(\d+)\/roles$/, (body, { me: who, params: [id] }) => {
    const moderator = modOnly(who, 'roles.assign');
    const store = modStore();
    const target = findModUser(store, id);
    assertCanManage(moderator, target);
    const roles = Array.isArray(body.roles) ? [...new Set(body.roles)] : [];
    if (!roles.length) fail(422, 'VALIDATION_ERROR', 'Нужна хотя бы одна роль', { roles: 'client и/или psychologist' });
    if (roles.some((r) => !['client', 'psychologist'].includes(r))) fail(422, 'VALIDATION_ERROR', 'Назначить можно роли client и psychologist', { roles: 'client, psychologist' });
    const added = roles.filter((r) => !target.roles.includes(r));
    const removed = target.roles.filter((r) => !roles.includes(r));
    added.forEach((role) => modAudit(store, moderator, 'role.grant', 'user', target.id, { user: target.name, role }));
    removed.forEach((role) => modAudit(store, moderator, 'role.revoke', 'user', target.id, { user: target.name, role }));
    target.roles = roles;
    if (!roles.includes('psychologist')) target.verificationStatus = undefined;
    else if (!target.verificationStatus) target.verificationStatus = 'draft';
    saveMod(store);
    return target;
  });
  route('POST', /^\/admin\/users\/(\d+)\/block$/, (body, { me: who, params: [id] }) => {
    const moderator = modOnly(who, 'users.block');
    const store = modStore();
    const target = findModUser(store, id);
    assertCanManage(moderator, target);
    if (target.status === 'blocked') fail(409, 'ALREADY_BLOCKED', 'Пользователь уже заблокирован');
    const reason = String(body.reason || '').trim();
    if (!reason) fail(422, 'VALIDATION_ERROR', 'Укажите причину блокировки', { reason: 'Укажите причину блокировки' });
    const b = { id: store.nextId++, reason, blockedAt: new Date().toISOString(), until: null, unblockedAt: null, blockedBy: moderator.id };
    target.blocks.unshift(b);
    target.status = 'blocked';
    target.block = { id: b.id, reason, blockedAt: b.blockedAt, until: null };
    modAudit(store, moderator, 'user.block', 'user', target.id, { user: target.name, reason });
    saveMod(store);
    return target;
  });
  route('POST', /^\/admin\/users\/(\d+)\/unblock$/, (_, { me: who, params: [id] }) => {
    const moderator = modOnly(who, 'users.block');
    const store = modStore();
    const target = findModUser(store, id);
    assertCanManage(moderator, target);
    if (!target.block) fail(409, 'NOT_BLOCKED', 'Пользователь не заблокирован');
    const b = target.blocks.find((x) => x.id === target.block.id);
    if (b) b.unblockedAt = new Date().toISOString();
    modAudit(store, moderator, 'user.unblock', 'user', target.id, { user: target.name, reason: target.block.reason });
    target.status = 'active';
    target.block = null;
    saveMod(store);
    return target;
  });

  /* ---------- Панель модератора: заявки психологов ----------
     Демо-заявки – MOD_APPLICATIONS из data.js (решения – в 'ryadom-demo-mod');
     к ним добавляются заявки, отправленные из демо-кабинета психолога (ryadom-demo-psy), –
     решение модератора сразу видно психологу. */

  const DOC_KIND = { Диплом: 'diploma', Сертификат: 'certificate', Справка: 'other' };
  const mimeOf = (name) => ({ pdf: 'application/pdf', png: 'image/png', webp: 'image/webp' }[name.split('.').pop().toLowerCase()] || 'image/jpeg');
  const bytesOf = (size) => { const [n, unit] = size.split(' '); return Math.round(parseFloat(n.replace(',', '.')) * (unit === 'МБ' ? 1048576 : 1024)); };

  /** Заявки из data.js в виде ответа API (при первом обращении – в хранилище модератора) */
  const demoApplications = (store) => {
    if (store.applications) return store.applications;
    const at = (k) => (k === undefined ? null : demoDateAt(k).toISOString());
    store.applications = MOD_APPLICATIONS.map((a) => {
      const u = MOD_USERS.find((x) => x.id === a.user);
      const docStatus = a.status === 'pending' ? 'pending' : a.status;
      return {
        id: a.id, status: a.status, submittedAt: at(a.sent), reviewedAt: at(a.decided), comment: a.comment || null,
        reviewedBy: a.by ? { id: 3, login: 'moderator' } : null,
        psychologist: {
          id: u ? (ACCOUNTS[u.email] || {}).id || 500 + u.id : 600 + a.id, email: u ? u.email : 'viktor.n@mail.ru',
          name: u ? u.name : a.name, middleName: null, gender: null, headline: a.role, bio: a.about, approach: null,
          avatarUrl: u && u.photo ? `assets/img/psychologists/${u.photo}.webp` : null,
          experienceYears: a.exp, priceFrom: a.price, methods: a.methods,
        },
        documents: a.docs.map((d, i) => {
          const edu = a.edu[i] || a.edu[a.edu.length - 1];
          const [institution, specialty] = edu.title.split(', ');
          return { id: a.id * 10 + i, type: DOC_KIND[d.kind] || 'other', institution, specialty: specialty || null, year: edu.year,
            fileName: d.name, mimeType: mimeOf(d.name), size: bytesOf(d.size), status: docStatus,
            comment: a.status === 'rejected' ? a.comment : null };
        }),
      };
    });
    saveMod(store);
    return store.applications;
  };

  /** Заявки из демо-кабинетов психологов (кроме Марины – она проверена давно) */
  const psyApplications = () => {
    const all = load(PSY_KEY) || {};
    return Object.keys(all).sort().flatMap((email, i) => {
      const st = all[email];
      if (email === 'marina@ryadom.by' || !st.profile || !st.requests || !st.requests.length) return [];
      const r = st.requests[0];
      const pr = st.profile;
      const prices = pr.services.map((x) => x.price);
      return [{
        id: 900000 + i * 1000 + r.id, status: r.status, submittedAt: r.submittedAt, reviewedAt: r.reviewedAt, comment: r.comment,
        reviewedBy: r.reviewedAt ? { id: 3, login: 'moderator' } : null, psyEmail: email,
        psychologist: { id: 700 + i, email, name: [pr.firstName, pr.lastName].filter(Boolean).join(' '), middleName: pr.middleName,
          gender: pr.gender, headline: pr.headline, bio: pr.bio, approach: pr.approach, avatarUrl: pr.avatarUrl,
          experienceYears: yearsSince(pr.practiceSince), priceFrom: prices.length ? Math.min(...prices) : null,
          methods: pr.methods.map((m) => m.name) },
        documents: st.documents.map((d) => ({ id: d.id, type: d.type, institution: d.institution, specialty: d.specialty, year: d.year,
          fileName: d.fileName, mimeType: d.mimeType, size: d.size, status: d.status, comment: d.comment })),
      }];
    });
  };

  route('GET', /^\/admin\/verification-requests$/, (_, { me: who, query }) => {
    modOnly(who, 'psychologists.verify');
    const status = query.status || 'pending';
    if (!['pending', 'approved', 'rejected'].includes(status)) fail(422, 'VALIDATION_ERROR', 'status – pending, approved или rejected');
    const items = [...demoApplications(modStore()), ...psyApplications()].filter((a) => a.status === status)
      .sort((a, b) => (status === 'pending' ? 1 : -1) * (new Date(status === 'pending' ? a.submittedAt : a.reviewedAt)
        - new Date(status === 'pending' ? b.submittedAt : b.reviewedAt)));
    return { status, items: items.map(({ psyEmail, ...a }) => a) };
  });

  route('PATCH', /^\/admin\/verification-requests\/(\d+)$/, (body, { me: who, params: [id] }) => {
    const moderator = modOnly(who, 'psychologists.verify');
    const store = modStore();
    const a = [...demoApplications(store), ...psyApplications()].find((x) => String(x.id) === id) || fail(404, 'NOT_FOUND', 'Заявка не найдена');
    if (a.status !== 'pending') fail(409, 'ALREADY_DECIDED', 'По заявке уже есть решение');
    const status = body.status;
    const comment = String(body.comment || '').trim() || null;
    if (!['approved', 'rejected'].includes(status)) fail(422, 'VALIDATION_ERROR', 'status – approved или rejected', { status: 'approved, rejected' });
    if (status === 'rejected' && !comment) fail(422, 'VALIDATION_ERROR', 'Напишите психологу, почему заявка отклонена', { comment: 'Обязательно при отклонении' });
    const now = new Date().toISOString();
    const docComment = status === 'rejected' ? comment : null;
    if (a.psyEmail) {
      // Заявка из демо-кабинета психолога – решение записывается прямо в его анкету
      const all = load(PSY_KEY);
      const st = all[a.psyEmail];
      Object.assign(st.requests[0], { status, comment, reviewedAt: now });
      st.profile.verificationStatus = status === 'approved' ? 'verified' : 'rejected';
      st.profile.verifiedAt = status === 'approved' ? now : null;
      st.documents.filter((d) => d.status === 'pending').forEach((d) => Object.assign(d, { status, comment: docComment, reviewedAt: now }));
      save(PSY_KEY, all);
    } else {
      Object.assign(a, { status, comment, reviewedAt: now, reviewedBy: { id: moderator.id, login: moderator.email.split('@')[0] } });
      a.documents.filter((d) => d.status === 'pending').forEach((d) => Object.assign(d, { status, comment: docComment }));
      const u = store.users && store.users.find((x) => x.email === a.psychologist.email);
      if (u) u.verificationStatus = status === 'approved' ? 'verified' : 'rejected';
    }
    modAudit(store, moderator, status === 'approved' ? 'verification.approve' : 'verification.reject', 'psychologist',
      a.psychologist.id, { psychologist: a.psychologist.name, comment });
    saveMod(store);
    return { id: a.id, status, comment };
  });

  /* ---------- Панель модератора: отзывы и жалобы ----------
     Источники: MOD_REVIEWS из data.js (решения – в 'ryadom-demo-mod'), отзывы Анны из демо-кабинета клиента
     и жалобы из демо-кабинета Марины – решение модератора сразу видно им. */

  const MARINA = { email: 'marina@ryadom.by' };
  const REPORT_ID = 700000;      // жалобы из кабинета Марины – отдельный диапазон номеров

  /** Отзывы из data.js, которых нет в кабинетах (у Анны и Марины – свои, живые) */
  const staticModReviews = (store) => {
    if (store.reviews) return store.reviews;
    const at = (k) => demoDateAt(k).toISOString();
    store.reviews = MOD_REVIEWS.filter((x) => !(x.kind === 'new' && x.client === 'Анна Петрова') && !(x.kind === 'report' && x.psy === 1))
      .map((x) => {
        const p = findPsy(x.psy);
        return {
          id: 800 + x.id, appointmentId: null, psychologist: { id: p.id, name: p.name, avatarUrl: `assets/img/psychologists/${p.photo}.webp` },
          author: x.client, anonymous: x.client === 'Аноним', rating: x.rating, body: x.text, sessions: 1,
          sessionAt: at(x.session), createdAt: at(x.k), reply: null, status: x.kind === 'new' ? 'pending' : 'approved',
          moderationComment: null, moderatedAt: x.kind === 'report' ? at(x.k + 1) : null, client: { id: 0, name: x.client },
          report: x.report ? { id: 800 + x.id, status: 'pending', reason: x.report.reason, createdAt: at(x.report.k), comment: null, resolvedAt: null } : null,
        };
      });
    saveMod(store);
    return store.reviews;
  };
  /** Отзывы Анны из демо-кабинета клиента – глазами модератора */
  const clientModReviews = () => {
    const cs = clientStore();
    return cs.reviews.map((r) => {
      const a = cs.appointments.find((x) => x.id === r.appointmentId);
      return { ...r, author: 'Анна Петрова', client: { id: 4, name: 'Анна Петрова' }, sessions: 1,
        sessionAt: a ? a.startsAt : r.createdAt, moderatedAt: r.moderatedAt || null, report: null, fromClient: true };
    });
  };
  /** Жалобы из демо-кабинета Марины – в виде ответа API */
  const marinaReports = () => {
    const store = psyReviews(MARINA);
    const p = findPsy(1);
    return store.reviews.filter((r) => r.report).map((r) => ({
      ...r.report, id: REPORT_ID + r.report.id, fromPsy: true, reviewId: r.id,
      review: { ...r, appointmentId: null, psychologist: { id: p.id, name: p.name, avatarUrl: `assets/img/psychologists/${p.photo}.webp` },
        sessionAt: r.createdAt, moderationComment: r.moderationComment || null, moderatedAt: r.moderatedAt || null,
        client: { id: 0, name: r.author } },
    }));
  };
  const staticReports = (store) => staticModReviews(store).filter((r) => r.report).map((r) => ({ ...r.report, review: r }));
  const clean = ({ fromClient, fromPsy, reviewId, ...x }) => x;

  route('GET', /^\/admin\/reviews$/, (_, { me: who, query }) => {
    modOnly(who, 'reviews.moderate');
    const status = query.status || 'pending';
    const items = [...staticModReviews(modStore()), ...clientModReviews()].filter((r) => r.status === status)
      .sort((a, b) => (status === 'pending' ? 1 : -1) * (new Date(a.createdAt) - new Date(b.createdAt)));
    return { status, items: items.map(clean) };
  });
  route('GET', /^\/admin\/review-reports$/, (_, { me: who, query }) => {
    modOnly(who, 'reviews.moderate');
    const status = query.status || 'pending';
    const items = [...staticReports(modStore()), ...marinaReports()].filter((r) => r.status === status);
    return { status, items: items.map(clean) };
  });

  route('PATCH', /^\/admin\/reviews\/(\d+)$/, (body, { me: who, params: [id] }) => {
    const moderator = modOnly(who, 'reviews.moderate');
    const store = modStore();
    const status = body.status;
    const comment = String(body.comment || '').trim() || null;
    if (!['approved', 'rejected'].includes(status)) fail(422, 'VALIDATION_ERROR', 'status – approved или rejected', { status: 'approved, rejected' });
    if (status === 'rejected' && !comment) fail(422, 'VALIDATION_ERROR', 'Напишите клиенту, почему отзыв не опубликован', { comment: 'Обязательно при отклонении' });
    const now = new Date().toISOString();
    let r = staticModReviews(store).find((x) => String(x.id) === id);
    if (r) {
      Object.assign(r, { status, moderationComment: comment, moderatedAt: now });
    } else {
      // Отзыв Анны – решение записывается в её демо-кабинет
      const cs = clientStore();
      r = cs.reviews.find((x) => String(x.id) === id) || fail(404, 'NOT_FOUND', 'Отзыв не найден');
      Object.assign(r, { status, moderationComment: comment, moderatedAt: now });
      saveClient(cs);
    }
    modAudit(store, moderator, status === 'approved' ? 'review.approve' : 'review.reject', 'review', r.id,
      { psychologist: r.psychologist.name, rating: r.rating, comment });
    saveMod(store);
    return r;
  });

  route('PATCH', /^\/admin\/review-reports\/(\d+)$/, (body, { me: who, params: [id] }) => {
    const moderator = modOnly(who, 'reviews.moderate');
    const store = modStore();
    const decision = body.decision;
    const comment = String(body.comment || '').trim();
    if (!['hide', 'keep'].includes(decision)) fail(422, 'VALIDATION_ERROR', 'decision – hide или keep', { decision: 'hide, keep' });
    if (!comment) fail(422, 'VALIDATION_ERROR', 'Напишите комментарий к решению', { comment: 'Обязательно' });
    const now = new Date().toISOString();
    const resolve = (review) => {
      if (review.report.status !== 'pending') fail(409, 'ALREADY_RESOLVED', 'По жалобе уже есть решение');
      Object.assign(review.report, { status: decision === 'hide' ? 'approved' : 'rejected', comment, resolvedAt: now });
      if (decision === 'hide') Object.assign(review, { status: 'rejected', moderationComment: comment, moderatedAt: now });
    };
    let review = staticModReviews(store).find((x) => x.report && String(x.report.id) === id);
    if (review) resolve(review);
    else {
      // Жалоба Марины – решение видно в её кабинете (скрытый отзыв пропадает из списка)
      const ps = psyReviews(MARINA);
      review = ps.reviews.find((x) => x.report && String(REPORT_ID + x.report.id) === id) || fail(404, 'NOT_FOUND', 'Жалоба не найдена');
      resolve(review);
      savePsy(MARINA, ps);
    }
    modAudit(store, moderator, decision === 'hide' ? 'review.hide' : 'review.keep', 'review', review.id,
      { psychologist: review.psychologist ? review.psychologist.name : 'Марина Волкова', report: review.report.reason, comment });
    saveMod(store);
    return { id: Number(id), decision, comment };
  });

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
