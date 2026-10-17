/**
 * «Рядом» – каталог психологов.
 * Демо-список психологов (PSYCHOLOGISTS) лежит в data.js, поиск и фильтры работают в браузере.
 * Позже: GET /api/psychologists?topic=…&method=…&priceMax=…&sort=… (NodeJS),
 * а фильтрация и сортировка переедут на сервер.
 */

/* Ссылки с главной: catalog.html?topic=anxiety → «Тревожность» */
const TOPIC_KEYS = {
  anxiety: 'Тревожность', relations: 'Отношения', stress: 'Стресс', apathy: 'Апатия',
  burnout: 'Выгорание', selfesteem: 'Самооценка', motivation: 'Прокрастинация', loss: 'Утрата',
};
const PAGE_SIZE = 6;
const DAYS_AHEAD = 14;   // сколько дней показывать в ленте «Когда удобно»
/* days – через сколько дней у психолога появляются свободные окна, work – рабочие дни недели (0 – воскресенье),
   slots – время приёма в рабочий день. Часть окон уже занята (для демо – по формуле в slotsOn).
   API: GET /api/psychologists/:id/slots?from=…&to=… вернёт точные свободные окна. */
const PARTS = [
  { label: 'Утро', icon: 'i-sunrise', test: (m) => m < 12 * 60 },
  { label: 'День', icon: 'i-sun', test: (m) => m >= 12 * 60 && m < 17 * 60 },
  { label: 'Вечер', icon: 'i-moon', test: (m) => m >= 17 * 60 },
];
document.addEventListener('DOMContentLoaded', () => {
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

  /** Свободное время психолога через k дней: только рабочие дни, часть окон занята,
      сегодня – не раньше чем через полчаса */
  const slotsOn = (p, k) => {
    if (k < p.days || !p.work.includes(dateAt(k).getDay())) return [];
    return p.slots.filter((t, i) => (p.id * 7 + k * 3 + i) % 5 !== 0 && (k > 0 || mins(t) > nowMins() + 30));
  };
  /** Ближайшее свободное окно: { k – через сколько дней, time } */
  const nextFree = (p) => {
    for (let k = 0; k < 30; k += 1) { const free = slotsOn(p, k); if (free.length) return { k, time: free[0] }; }
    return { k: 99, time: '' };
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

  /** Подходит ли психолог под фильтры */
  const matches = (p, s) => {
    if (s.q) {
      const hay = [p.name, p.role, ...p.methods, ...p.topics, p.about].join(' ').toLowerCase();
      // «тревога» должна находить «Тревожность»: сравниваем по началу слова (первые 5 букв)
      const stem = s.q.length > 5 ? s.q.slice(0, 5) : s.q;
      if (!hay.includes(stem)) return false;
    }
    if (s.topics.length && !s.topics.some((t) => p.topics.includes(t))) return false;
    if (s.methods.length && !s.methods.some((m) => p.methods.includes(m))) return false;
    if (s.formats.length && !s.formats.every((f) => p.formats.includes(f))) return false;
    if (s.gender !== 'any' && p.gender !== s.gender) return false;
    if (p.exp < s.exp) return false;
    if (s.expMax !== null && p.exp > s.expMax) return false;
    if (p.price > s.price) return false;
    if (s.day !== null) {
      const free = slotsOn(p, s.day);
      if (!free.length) return false;
      if (s.times.length && !s.times.some((t) => free.includes(t))) return false;
    }
    return true;
  };

  const SORTS = {
    rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    soon: (a, b) => {
      const x = nextFree(a), y = nextFree(b);
      return x.k - y.k || mins(x.time) - mins(y.time) || b.rating - a.rating;
    },
    cheap: (a, b) => a.price - b.price,
    expensive: (a, b) => b.price - a.price,
    exp: (a, b) => b.exp - a.exp,
  };

  /** Точное ближайшее время: «Свободно завтра в 17:00».
      Если в фильтре выбран день (и время) – первое подходящее окно в этот день */
  const when = (p, s) => {
    let k, time;
    if (s.day !== null) {
      k = s.day;
      const free = slotsOn(p, k);
      time = (s.times.length ? free.filter((t) => s.times.includes(t)) : free)[0];
    } else {
      ({ k, time } = nextFree(p));
    }
    return `<span class="pcard__when${k <= 1 ? ' is-soon' : ''}">Свободно ${dayText(k)} в&nbsp;${time}</span>`;
  };

  /* ---------- Карточка (упрощённая, по 3 в ряд) ----------
     Только главное для выбора: фото, имя, опыт, рейтинг, 2 запроса и цена.
     Метод, образование и расписание – на странице психолога. Вся карточка – ссылка. */
  const card = (p, s, i) => {
    const q = s.q.length > 5 ? s.q.slice(0, 5) : s.q;
    // выбранные в фильтре запросы – первыми; показываем два
    const topics = [...p.topics].sort((a, b) => s.topics.includes(b) - s.topics.includes(a)).slice(0, 2);
    const url = `psychologist.html?id=${p.id}`;
    return `
      <a href="${url}" class="pcard" style="animation-delay:${Math.min(i, 6) * 40}ms">
        <span class="pcard__photo">
          <img src="assets/img/psychologists/${p.photo}.webp" alt="" loading="lazy">
          ${p.online ? '<span class="pcard__online">в сети</span>' : ''}
        </span>
        <span class="pcard__body">
          <span class="pcard__top">
            <span class="pcard__name">${highlight(p.name, q)}</span>
            <span class="rating"><svg><use href="#i-star"/></svg>${rating(p.rating)}</span>
          </span>
          <span class="pcard__meta">${highlight(p.role, q)} · опыт ${p.exp} ${plural(p.exp, 'год', 'года', 'лет')}</span>
          <span class="pcard__tags">${topics.map((t) => `<span class="tag tag--sm ${s.topics.includes(t) ? 'tag--yellow' : 'tag--grey'}">${highlight(t, q)}</span>`).join('')}</span>
          <span class="pcard__foot">
            <span class="pcard__price">${p.price} BYN <small>/ 50 мин</small></span>
            ${when(p, s)}
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
  const renderDays = (s) => {
    const base = { ...s, day: null, times: [] };
    const pool = PSYCHOLOGISTS.filter((p) => matches(p, base));
    daysEl.querySelectorAll('.fday').forEach((el) => {
      const k = Number(el.querySelector('input').value);
      const n = pool.filter((p) => slotsOn(p, k).length).length;
      el.classList.toggle('is-empty', !n);
      el.title = n ? `Свободно: ${n} ${plural(n, 'психолог', 'психолога', 'психологов')}` : 'Нет свободного времени';
    });
  };

  // Выбрать можно только один день – время показываем для него
  daysEl.addEventListener('input', (e) => {
    if (!e.target.checked) return;
    daysEl.querySelectorAll('input:checked').forEach((i) => { if (i !== e.target) i.checked = false; });
  });

  /* ---------- Точное время выбранного дня ----------
     Все свободные окна психологов, подходящих под остальные фильтры, по утру / дню / вечеру.
     Цифра на кнопке – сколько психологов свободны в это время. */
  const timesEl = document.querySelector('[data-times]');
  let timesKey = '';
  const renderTimes = (s) => {
    if (s.day === null) {
      if (timesKey !== 'none') {
        timesEl.innerHTML = '<p class="ftimes__hint"><svg><use href="#i-clock"/></svg>Выберите день – покажем, во&nbsp;сколько точно свободны психологи</p>';
        timesKey = 'none';
      }
      return;
    }
    const pool = PSYCHOLOGISTS.filter((p) => matches(p, { ...s, times: [] }));
    const counts = {};
    pool.forEach((p) => slotsOn(p, s.day).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    const all = Object.keys(counts).sort((a, b) => mins(a) - mins(b));
    const key = `${s.day}|${all.map((t) => t + counts[t]).join(',')}`;
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

  /* ---------- Главная функция: отфильтровать, отсортировать, нарисовать ---------- */
  const update = (resetPage = true) => {
    if (resetPage) shown = PAGE_SIZE;
    renderTimes(state());            // сначала – сетка времени выбранного дня,
    const s = state();               // потом состояние уже с актуальным выбором времени
    priceOut.textContent = s.price;
    clearBtn.hidden = !s.q;

    const found = PSYCHOLOGISTS.filter((p) => matches(p, s)).sort(SORTS[s.sort]);
    countEl.innerHTML = `Найдено ${found.length} <span>${plural(found.length, 'психолог', 'психолога', 'психологов')}</span>`;
    setShowBtn(found.length);
    renderPrice(s);
    renderDays(s);

    if (!found.length) {
      listEl.innerHTML = `
        <div class="empty">
          <img src="assets/img/formats/individual.webp" alt="">
          <b>Никого не нашли</b>
          <p>Попробуйте убрать часть фильтров или изменить запрос – психологи часто работают с&nbsp;несколькими темами.</p>
          <button type="button" class="btn btn--primary" data-reset-all>Сбросить фильтры</button>
        </div>`;
      listEl.querySelector('[data-reset-all]').addEventListener('click', resetAll);
    } else {
      listEl.innerHTML = found.slice(0, shown).map((p, i) => card(p, s, i)).join('');
    }
    moreEl.hidden = found.length <= shown;
    renderActive(s);

    // Количество психологов у каждого метода/формата в окне – с учётом остальных фильтров
    form.querySelectorAll('[data-count]').forEach((el) => {
      const [name, value] = el.dataset.count.split(':');
      const key = name === 'method' ? 'methods' : 'formats';
      const n = PSYCHOLOGISTS.filter((p) => matches(p, { ...s, [key]: [] }) && p[key].includes(value)).length;
      el.textContent = n || '';
    });

    // Запоминаем фильтры в адресе страницы – ссылкой можно поделиться
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
  if (params.get('sort') && SORTS[params.get('sort')]) sortEl.value = params.get('sort');
  // Опыт и максимальная цена – для ссылок со страницы «Тарифы» (?exp=10, ?price=60)
  const expParam = form.querySelector(`[name="exp"][value="${params.get('exp')}"]`);
  if (expParam) expParam.checked = true;
  if (params.get('expmax') && !Number.isNaN(Number(params.get('expmax')))) expMax = Number(params.get('expmax'));
  const priceParam = Number(params.get('price'));
  if (priceParam >= Number(priceRange.min) && priceParam <= Number(priceRange.max)) priceRange.value = priceParam;
  syncSort();
  update();
});
