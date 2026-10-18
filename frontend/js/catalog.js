/**
 * «Рядом» – каталог психологов.
 * Поиск, фильтры и сортировка – на сервере: GET /api/psychologists?topic=…&method=…&priceMax=…&sort=…
 * В ответе – карточки и подсказки к фильтрам (facets): сколько психологов по методам, форматам,
 * дням и времени. Страница только собирает фильтры и рисует ответ.
 * В фильтрах – названия («Тревожность»), в запросе – коды из /api/references («anxiety»).
 */

/* Ссылки с главной: catalog.html?topic=anxiety → «Тревожность» */
const TOPIC_KEYS = {
  anxiety: 'Тревожность', relations: 'Отношения', stress: 'Стресс', apathy: 'Апатия',
  burnout: 'Выгорание', selfesteem: 'Самооценка', motivation: 'Прокрастинация', loss: 'Утрата',
};
const PAGE_SIZE = 6;
const DAYS_AHEAD = 14;   // сколько дней показывать в ленте «Когда удобно» (столько же считает сервер)
const PARTS = [
  { label: 'Утро', icon: 'i-sunrise', test: (m) => m < 12 * 60 },
  { label: 'День', icon: 'i-sun', test: (m) => m >= 12 * 60 && m < 17 * 60 },
  { label: 'Вечер', icon: 'i-moon', test: (m) => m >= 17 * 60 },
];
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('[data-filters]');
  const listEl = document.querySelector('[data-list]');
  const countEl = document.querySelector('[data-results-count]');
  const activeEl = document.querySelector('[data-active]');
  const moreEl = document.querySelector('[data-more]');
  const searchEl = document.querySelector('[data-search]');
  const clearBtn = document.querySelector('[data-search-clear]');
  const sortEl = document.querySelector('[data-sort]');
  const priceRange = form.elements.namedItem('price');
  const priceOut = document.querySelector('[data-price-out]');
  const modal = document.getElementById('filters-modal');
  const showBtn = document.querySelector('[data-show-btn]');
  let shown = PAGE_SIZE;
  let expMax = null;   // «опыт до N лет» – приходит из ссылок страницы «Тарифы» (?expmax=10)

  /* ---------- Помощники ---------- */
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };
  const rating = (r) => r.toFixed(1).replace('.', ',');

  /* ---------- Даты ---------- */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /** Дата через k дней от сегодняшней */
  const dateAt = (k) => { const d = new Date(today); d.setDate(d.getDate() + k); return d; };
  /** «09:30» → минуты от начала дня */
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** Окно из ответа API → { k – через сколько дней, time – «17:00» } */
  const slotWhen = (iso) => {
    const d = new Date(iso);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    return { k: Math.round((day - today) / 86400000), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  };

  /** «сегодня», «завтра», «18 окт» */
  const dayText = (k) => (k === 0 ? 'сегодня' : k === 1 ? 'завтра'
    : dateAt(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''));
  const shortDate = (k) => dateAt(k).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');

  /** Подсветка найденного слова в тексте */
  const highlight = (text, q) => {
    const safe = escapeHtml(text);
    if (!q) return safe;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return safe;
    return escapeHtml(text.slice(0, i)) + '<mark class="hl-text">' + escapeHtml(text.slice(i, i + q.length)) + '</mark>' + escapeHtml(text.slice(i + q.length));
  };

  /* ---------- Состояние фильтров ---------- */
  const values = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  const state = () => ({
    q: searchEl.value.trim().toLowerCase(),
    topics: values('topic'),
    methods: values('method'),
    formats: values('format'),
    gender: form.elements.namedItem('gender').value,
    exp: Number(form.elements.namedItem('exp').value),
    price: Number(priceRange.value),
    expMax,
    day: values('day').length ? Number(values('day')[0]) : null,
    times: values('time'),
    sort: sortEl.value,
  });

  /* ---------- Названия ↔ коды справочников ---------- */
  let refs = { methods: [], topics: [], formats: [] };
  const codeOf = (kind, name) => (refs[kind].find((x) => x.name === name) || {}).code;

  /** Фильтры страницы → параметры GET /api/psychologists */
  const toQuery = (s, limit) => ({
    q: s.q,
    topic: s.topics.map((n) => codeOf('topics', n)),
    method: s.methods.map((n) => codeOf('methods', n)),
    format: s.formats.map((n) => codeOf('formats', n)),
    gender: s.gender === 'any' ? null : s.gender,
    expMin: s.exp || null,
    expMax: s.expMax,
    priceMax: s.price < Number(priceRange.max) ? s.price : null,
    date: s.day === null ? null : isoDate(dateAt(s.day)),
    time: s.times,
    sort: s.sort,
    limit,
  });

  /** «Свободно завтра в 17:00» – ближайшее окно, подходящее под выбранный день и время (считает сервер) */
  const when = (p) => {
    if (!p.nextSlot) return '<span class="pcard__when">Окна – в&nbsp;профиле</span>';
    const { k, time } = slotWhen(p.nextSlot);
    return `<span class="pcard__when${k <= 1 ? ' is-soon' : ''}">Свободно ${dayText(k)} в&nbsp;${time}</span>`;
  };

  /* ---------- Карточка (упрощённая, по 3 в ряд) ----------
     Только главное для выбора: фото, имя, опыт, рейтинг, 2 запроса и цена.
     Метод, образование и расписание – на странице психолога. Вся карточка – ссылка. */
  const card = (p, s, i) => {
    const q = s.q.length > 5 ? s.q.slice(0, 5) : s.q;
    // выбранные в фильтре запросы – первыми; показываем два
    const names = p.topics.map((t) => t.name);
    const topics = names.sort((a, b) => s.topics.includes(b) - s.topics.includes(a)).slice(0, 2);
    const url = `psychologist.html?id=${p.id}`;
    return `
      <a href="${url}" class="pcard" style="animation-delay:${Math.min(i, 6) * 40}ms">
        <span class="pcard__photo">
          ${p.avatarUrl ? `<img src="${escapeHtml(p.avatarUrl)}" alt="" loading="lazy">` : ''}
        </span>
        <span class="pcard__body">
          <span class="pcard__top">
            <span class="pcard__name">${highlight(p.name, q)}</span>
            <span class="rating"><svg><use href="#i-star"/></svg>${rating(p.rating)}</span>
          </span>
          <span class="pcard__meta">${highlight(p.headline || 'Психолог', q)} · опыт ${p.experienceYears} ${plural(p.experienceYears, 'год', 'года', 'лет')}</span>
          <span class="pcard__tags">${topics.map((t) => `<span class="tag tag--sm ${s.topics.includes(t) ? 'tag--yellow' : 'tag--grey'}">${highlight(t, q)}</span>`).join('')}</span>
          <span class="pcard__foot">
            <span class="pcard__price">${p.priceFrom} BYN <small>/ 50 мин</small></span>
            ${when(p)}
          </span>
        </span>
      </a>`;
  };

  /* ---------- Активные фильтры («таблетки» с крестиком) ---------- */
  const renderActive = (s) => {
    const items = [];
    if (s.q) items.push({ label: `«${searchEl.value.trim()}»`, clear: () => { searchEl.value = ''; } });
    s.topics.forEach((t) => items.push({ label: t, clear: () => { form.querySelector(`[name="topic"][value="${t}"]`).checked = false; } }));
    s.methods.forEach((m) => items.push({ label: m, clear: () => { form.querySelector(`[name="method"][value="${m}"]`).checked = false; } }));
    s.formats.forEach((f) => items.push({ label: f, clear: () => { form.querySelector(`[name="format"][value="${f}"]`).checked = false; } }));
    if (s.day !== null) items.push({ label: s.day === 0 ? 'Сегодня' : s.day === 1 ? 'Завтра' : shortDate(s.day), clear: () => { form.querySelector(`[name="day"][value="${s.day}"]`).checked = false; } });
    s.times.forEach((t) => items.push({ label: `в ${t}`, clear: () => { form.querySelector(`[name="time"][value="${t}"]`).checked = false; } }));
    if (s.gender !== 'any') items.push({ label: s.gender === 'f' ? 'Женщина' : 'Мужчина', clear: () => { form.querySelector('[name="gender"][value="any"]').checked = true; } });
    if (s.exp && s.expMax !== null) items.push({ label: `Опыт ${s.exp}–${s.expMax} лет`, clear: () => { form.querySelector('[name="exp"][value="0"]').checked = true; expMax = null; } });
    else if (s.exp) items.push({ label: `Опыт от ${s.exp} лет`, clear: () => { form.querySelector('[name="exp"][value="0"]').checked = true; } });
    else if (s.expMax !== null) items.push({ label: `Опыт до ${s.expMax + 1} лет`, clear: () => { expMax = null; } });
    if (s.price < Number(priceRange.max)) items.push({ label: `До ${s.price} BYN`, clear: () => { priceRange.value = priceRange.max; } });

    activeEl.innerHTML = items.map((it, i) => `<button type="button" class="af" data-af="${i}">${escapeHtml(it.label)}<svg><use href="#i-x"/></svg></button>`).join('');
    if (items.length > 1) activeEl.insertAdjacentHTML('beforeend', '<button type="button" class="af af--clear" data-af-clear>Очистить всё</button>');
    activeEl.querySelector('[data-af-clear]')?.addEventListener('click', resetAll);
    activeEl.querySelectorAll('[data-af]').forEach((btn) => btn.addEventListener('click', () => { items[btn.dataset.af].clear(); update(); }));

    // Счётчик на кнопке «Фильтры» (телефон) – без учёта поиска
    const n = items.length - (s.q ? 1 : 0);
    const badge = document.querySelector('[data-filters-count]');
    badge.hidden = !n;
    badge.textContent = n;
  };

  /* ---------- Лента дней «Когда удобно» ---------- */
  const daysEl = document.querySelector('[data-days]');
  const prevBtn = document.querySelector('[data-days-prev]');
  const nextBtn = document.querySelector('[data-days-next]');
  const WEEK = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  daysEl.innerHTML = Array.from({ length: DAYS_AHEAD }, (_, k) => {
    const d = dateAt(k);
    const wd = d.getDay();
    const label = k === 0 ? 'Сегодня' : k === 1 ? 'Завтра' : WEEK[wd];
    return `<label class="fday${wd === 0 || wd === 6 ? ' is-weekend' : ''}">
      <input type="checkbox" name="day" value="${k}" aria-label="${d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}">
      <span><small>${label}</small><b>${d.getDate()}</b><i></i></span>
    </label>`;
  }).join('');
  // Подпись месяца: «Октябрь» или «Октябрь – ноябрь»
  const m1 = dateAt(0).toLocaleDateString('ru-RU', { month: 'long' });
  const m2 = dateAt(DAYS_AHEAD - 1).toLocaleDateString('ru-RU', { month: 'long' });
  document.querySelector('[data-month]').textContent = m1 === m2 ? m1 : `${m1} – ${m2}`;

  /** Точка под днём – у кого-то есть свободное время (с учётом остальных фильтров) */
  const renderDays = (facetDays) => {
    daysEl.querySelectorAll('.fday').forEach((el) => {
      const n = facetDays[isoDate(dateAt(Number(el.querySelector('input').value)))] || 0;
      el.classList.toggle('is-empty', !n);
      el.title = n ? `Свободно: ${n} ${plural(n, 'психолог', 'психолога', 'психологов')}` : 'Нет свободного времени';
    });
  };

  // Выбрать можно только один день – время показываем для него
  daysEl.addEventListener('input', (e) => {
    // Время выбирается заново для нового дня
    timesEl.querySelectorAll('input:checked').forEach((i) => { i.checked = false; });
    if (!e.target.checked) return;
    daysEl.querySelectorAll('input:checked').forEach((i) => { if (i !== e.target) i.checked = false; });
  });

  /* ---------- Точное время выбранного дня ----------
     Все свободные окна психологов, подходящих под остальные фильтры, по утру / дню / вечеру.
     Цифра на кнопке – сколько психологов свободны в это время. */
  const timesEl = document.querySelector('[data-times]');
  let timesKey = '';
  const renderTimes = (s, counts) => {
    if (s.day === null) {
      if (timesKey !== 'none') {
        timesEl.innerHTML = '<p class="ftimes__hint"><svg><use href="#i-clock"/></svg>Выберите день – покажем, во&nbsp;сколько точно свободны психологи</p>';
        timesKey = 'none';
      }
      return;
    }
    counts = counts || {};
    const all = Object.keys(counts).sort((a, b) => mins(a) - mins(b));
    const key = `${s.day}|${all.map((t) => t + counts[t]).join(',')}|${s.times.join(',')}`;
    if (key === timesKey) return;               // ничего не поменялось – не перерисовываем
    timesKey = key;

    const title = dateAt(s.day).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!all.length) {
      timesEl.innerHTML = `<p class="ftimes__hint"><svg><use href="#i-clock"/></svg>На&nbsp;${title} свободного времени нет – выберите другой день</p>`;
      return;
    }
    let j = 0;
    timesEl.innerHTML = `<p class="ftimes__cap">Свободное время, <b>${title}</b> · цифра – сколько психологов свободны</p>`
      + PARTS.map((part) => {
        const ts = all.filter((t) => part.test(mins(t)));
        if (!ts.length) return '';
        return `<div class="ftimes__row">
          <span class="ftimes__label"><svg><use href="#${part.icon}"/></svg>${part.label}</span>
          <div class="ftimes__list">${ts.map((t) => `<label class="ftime" style="--j:${j++}" title="Свободно: ${counts[t]} ${plural(counts[t], 'психолог', 'психолога', 'психологов')}"><input type="checkbox" name="time" value="${t}"${s.times.includes(t) ? ' checked' : ''}><span>${t}<small>${counts[t]}</small></span></label>`).join('')}</div>
        </div>`;
      }).join('');
  };

  // Стрелки листают ленту на 5 дней
  const updateArrows = () => {
    prevBtn.disabled = daysEl.scrollLeft < 4;
    nextBtn.disabled = daysEl.scrollLeft + daysEl.clientWidth > daysEl.scrollWidth - 4;
  };
  prevBtn.addEventListener('click', () => daysEl.scrollBy({ left: -360 }));
  nextBtn.addEventListener('click', () => daysEl.scrollBy({ left: 360 }));
  daysEl.addEventListener('scroll', updateArrows, { passive: true });

  /* ---------- Цена: бирюзовая заливка ползунка до выбранного значения ---------- */
  const fprice = document.querySelector('[data-fprice]');
  const renderPrice = (s) => {
    const v = (s.price - Number(priceRange.min)) / (Number(priceRange.max) - Number(priceRange.min));
    fprice.style.setProperty('--p', `calc(11px + (100% - 22px) * ${v})`);
  };

  /* ---------- Кнопка «Показать психологов: N» – число плавно меняется ---------- */
  let shownCount = null;
  let tween = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setShowBtn = (n) => {
    cancelAnimationFrame(tween);
    showBtn.disabled = !n;
    const from = shownCount;
    shownCount = n;
    showBtn.classList.remove('is-bump', 'is-shake');
    if (!n) {
      showBtn.textContent = 'Никого не нашли';
      if (from && modal.open) { void showBtn.offsetWidth; showBtn.classList.add('is-shake'); }
      return;
    }
    if (from === null || !from || reduceMotion || !modal.open) { showBtn.textContent = `Показать психологов: ${n}`; return; }
    if (from !== n) { void showBtn.offsetWidth; showBtn.classList.add('is-bump'); }
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 300);
      showBtn.textContent = `Показать психологов: ${Math.round(from + (n - from) * k)}`;
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  };

  /* ---------- Главная функция: спросить сервер и нарисовать ответ ---------- */
  let requestNo = 0;   // ответ на устаревший запрос (фильтры уже поменялись) не рисуем
  const update = async (resetPage = true) => {
    if (resetPage) shown = PAGE_SIZE;
    const s = state();
    priceOut.textContent = s.price;
    clearBtn.hidden = !s.q;
    renderPrice(s);
    renderActive(s);
    saveToUrl(s);

    const no = ++requestNo;
    listEl.setAttribute('aria-busy', 'true');
    let data;
    try {
      data = await API.get('/psychologists', toQuery(s, shown));
    } catch (err) {
      if (no !== requestNo) return;
      listEl.removeAttribute('aria-busy');
      listEl.innerHTML = `<div class="empty"><b>Не удалось загрузить психологов</b><p>${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn--primary" data-retry>Повторить</button></div>`;
      listEl.querySelector('[data-retry]').addEventListener('click', () => update(false));
      return;
    }
    if (no !== requestNo) return;
    listEl.removeAttribute('aria-busy');

    const { items, total, facets } = data;
    countEl.innerHTML = `Найдено ${total} <span>${plural(total, 'психолог', 'психолога', 'психологов')}</span>`;
    setShowBtn(total);
    renderDays(facets.days);
    renderTimes(s, facets.times);

    if (!total) {
      listEl.innerHTML = `
        <div class="empty">
          <img src="assets/img/formats/individual.webp" alt="">
          <b>Никого не нашли</b>
          <p>Попробуйте убрать часть фильтров или изменить запрос – психологи часто работают с&nbsp;несколькими темами.</p>
          <button type="button" class="btn btn--primary" data-reset-all>Сбросить фильтры</button>
        </div>`;
      listEl.querySelector('[data-reset-all]').addEventListener('click', resetAll);
    } else {
      listEl.innerHTML = items.map((p, i) => card(p, s, i)).join('');
    }
    moreEl.hidden = total <= shown;

    // Количество психологов у каждого метода/формата в окне – с учётом остальных фильтров
    form.querySelectorAll('[data-count]').forEach((el) => {
      const [name, value] = el.dataset.count.split(':');
      const kind = name === 'method' ? 'methods' : 'formats';
      el.textContent = facets[kind][codeOf(kind, value)] || '';
    });
  };

  /** Фильтры – в адресе страницы, ссылкой можно поделиться */
  const saveToUrl = (s) => {
    const params = new URLSearchParams();
    if (s.q) params.set('q', searchEl.value.trim());
    s.topics.forEach((t) => params.append('topic', t));
    s.formats.forEach((f) => params.append('format', f));
    if (s.exp) params.set('exp', s.exp);
    if (s.expMax !== null) params.set('expmax', s.expMax);
    if (s.price < Number(priceRange.max)) params.set('price', s.price);
    if (s.sort !== 'rating') params.set('sort', s.sort);
    history.replaceState(null, '', params.toString() ? `?${params}` : location.pathname);
  };

  const resetAll = () => { expMax = null; form.reset(); searchEl.value = ''; setTimeout(update); };

  /* ---------- События ---------- */
  form.addEventListener('input', () => update());
  form.addEventListener('change', () => update());
  form.addEventListener('reset', () => { expMax = null; searchEl.value = ''; setTimeout(update); });   // ждём, пока форма сбросится
  sortEl.addEventListener('change', () => update());

  /* ---------- Сортировка: своё выпадающее меню ----------
     Значение хранится в скрытом <select data-sort>, меню только меняет его. */
  const sortWrap = document.querySelector('[data-sort-wrap]');
  const sortBtn = document.querySelector('[data-sort-btn]');
  const sortMenu = document.querySelector('[data-sort-menu]');
  const sortValue = document.querySelector('[data-sort-value]');
  const sortItems = [...sortMenu.querySelectorAll('li')];
  let activeItem = 0;

  /** Подпись на кнопке и галочка – по значению select */
  const syncSort = () => {
    sortItems.forEach((li) => li.setAttribute('aria-selected', li.dataset.value === sortEl.value));
    sortValue.innerHTML = sortEl.options[sortEl.selectedIndex].innerHTML;
  };
  const setActive = (i) => {
    activeItem = (i + sortItems.length) % sortItems.length;
    sortItems.forEach((li, k) => li.classList.toggle('is-active', k === activeItem));
    sortMenu.setAttribute('aria-activedescendant', sortItems[activeItem].id);
  };
  const openSort = () => {
    sortWrap.classList.add('is-open');
    sortBtn.setAttribute('aria-expanded', 'true');
    setActive(sortItems.findIndex((li) => li.dataset.value === sortEl.value));
    sortMenu.focus({ preventScroll: true });
  };
  const closeSort = (focusBtn = true) => {
    if (!sortWrap.classList.contains('is-open')) return;
    sortWrap.classList.remove('is-open');
    sortBtn.setAttribute('aria-expanded', 'false');
    sortItems.forEach((li) => li.classList.remove('is-active'));
    if (focusBtn) sortBtn.focus({ preventScroll: true });
  };
  const chooseSort = (li) => {
    if (sortEl.value !== li.dataset.value) {
      sortEl.value = li.dataset.value;
      sortEl.dispatchEvent(new Event('change'));   // → update()
    }
    syncSort();
    closeSort();
  };

  sortBtn.addEventListener('click', () => (sortWrap.classList.contains('is-open') ? closeSort() : openSort()));
  sortItems.forEach((li, i) => {
    li.addEventListener('click', () => chooseSort(li));
    li.addEventListener('mousemove', () => { if (i !== activeItem) setActive(i); });
  });
  // Клавиатура: стрелки, Enter/пробел – выбрать, Esc/Tab – закрыть
  sortBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openSort(); }
  });
  sortMenu.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeItem + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeItem - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(sortItems.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseSort(sortItems[activeItem]); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSort(); }
    else if (e.key === 'Tab') closeSort(false);
  });
  // Клик мимо меню – закрыть
  document.addEventListener('click', (e) => { if (!sortWrap.contains(e.target)) closeSort(false); });

  // Поиск – с небольшой задержкой, чтобы не перерисовывать на каждую букву
  let t = null;
  searchEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(update, 200); });
  clearBtn.addEventListener('click', () => { searchEl.value = ''; searchEl.focus(); update(); });


  moreEl.querySelector('button').addEventListener('click', () => { shown += PAGE_SIZE; update(false); });

  /* ---------- Окно фильтров ---------- */
  // Разделы появляются по очереди: номер раздела – задержка анимации
  modal.querySelectorAll('.fsec').forEach((sec, i) => sec.style.setProperty('--i', i));

  document.querySelector('[data-filters-open]').addEventListener('click', () => {
    modal.showModal();
    updateArrows();
  });

  /** Закрыть с анимацией (окно уезжает, затемнение гаснет) */
  const closeModal = () => {
    if (!modal.open || modal.classList.contains('is-closing')) return;
    if (reduceMotion) { modal.close(); return; }
    modal.classList.add('is-closing');
    modal.addEventListener('animationend', () => { modal.classList.remove('is-closing'); modal.close(); }, { once: true });
  };
  modal.querySelectorAll('[data-filters-close]').forEach((el) => el.addEventListener('click', closeModal));
  // Клик по затемнению вокруг окна или Esc – тоже закрыть
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modal.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
  // После закрытия – прокрутить к результатам
  modal.addEventListener('close', () => document.querySelector('.cat').scrollIntoView({ behavior: 'smooth', block: 'start' }));

  /* ---------- Старт: фильтры из адреса (?topic=anxiety с главной, ?q=…) ---------- */
  const params = new URLSearchParams(location.search);
  params.getAll('topic').forEach((v) => {
    const name = TOPIC_KEYS[v] || v;
    const input = form.querySelector(`[name="topic"][value="${name}"]`);
    if (input) input.checked = true;
  });
  // Формат – для ссылок со страницы «Тарифы» (?format=Парная)
  params.getAll('format').forEach((v) => {
    const input = form.querySelector(`[name="format"][value="${v}"]`);
    if (input) input.checked = true;
  });
  // Пол психолога – для ссылки из анкеты подбора (?gender=f)
  if (['f', 'm'].includes(params.get('gender'))) form.querySelector(`[name="gender"][value="${params.get('gender')}"]`).checked = true;
  if (params.get('q')) searchEl.value = params.get('q');
  if (params.get('sort') && [...sortEl.options].some((o) => o.value === params.get('sort'))) sortEl.value = params.get('sort');
  // Опыт и максимальная цена – для ссылок со страницы «Тарифы» (?exp=10, ?price=60)
  const expParam = form.querySelector(`[name="exp"][value="${params.get('exp')}"]`);
  if (expParam) expParam.checked = true;
  if (params.get('expmax') && !Number.isNaN(Number(params.get('expmax')))) expMax = Number(params.get('expmax'));
  const priceParam = Number(params.get('price'));
  if (priceParam >= Number(priceRange.min) && priceParam <= Number(priceRange.max)) priceRange.value = priceParam;
  syncSort();
  try {
    refs = await API.get('/references');
  } catch { /* без справочников фильтры по темам и методам не сработают, но список покажется */ }
  update();
});
