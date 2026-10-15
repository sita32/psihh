/**
 * «Рядом» – страница «О нас».
 * Только оформление и анимации, данных с сервера здесь нет.
 *  – блоки появляются при прокрутке;
 *  – наклейки на первом экране чуть двигаются за мышкой;
 *  – фон разделов «Почему», «Как устроен» и «Отбор» плавно меняет цвет;
 *  – в схеме ролей рисуются стрелки-связи;
 *  – руки сходятся по мере прокрутки, в конце появляется сердце;
 *  – дорожка отбора рисуется при прокрутке, по ней едет цветок.
 */
document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

  /* ---------- Появление при прокрутке ---------- */
  const revealEls = document.querySelectorAll('.rv, [data-funnel], [data-roles]');
  /** Показать элемент; у схемы ролей стрелки получают наконечники, когда линии дорисованы */
  const show = (el, delay) => {
    el.classList.add('is-in');
    if (el.matches('[data-roles]')) setTimeout(() => el.classList.add('is-drawn'), delay);
  };
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => show(el, 0));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { show(e.target, 1500); io.unobserve(e.target); }
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Наклейки за мышкой (только на компьютере) ---------- */
  const art = document.querySelector('[data-parallax]');
  if (art && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    const hero = art.closest('section');
    const stickers = art.querySelectorAll('[data-depth]');
    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      stickers.forEach((s) => {
        const d = Number(s.dataset.depth);
        s.style.transform = `translate(${dx * d * 2}px, ${dy * d * 2}px)`;
      });
    });
    hero.addEventListener('mouseleave', () => stickers.forEach((s) => { s.style.transform = ''; }));
  }

  /* ---------- Фон меняет цвет: берём цвет раздела, который сейчас больше всего на экране ---------- */
  const flow = document.querySelector('[data-flow]');
  if (flow && 'IntersectionObserver' in window) {
    const parts = [...flow.querySelectorAll('[data-flow-color]')];
    const ratios = new Map();
    const fio = new IntersectionObserver((entries) => {
      entries.forEach((e) => ratios.set(e.target, e.intersectionRatio * e.boundingClientRect.height));
      const top = parts.reduce((a, b) => ((ratios.get(b) || 0) > (ratios.get(a) || 0) ? b : a));
      flow.style.setProperty('--flow', top.dataset.flowColor);
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
    parts.forEach((p) => fio.observe(p));
  }

  /* ---------- Руки ---------- */
  const hands = document.querySelector('[data-hands]');
  const updateHands = () => {
    const r = hands.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 – руки только показались снизу, 1 – центр картинки дошёл до 60% высоты экрана
    const p = clamp((vh - r.top) / (vh - (vh * 0.6 - r.height / 2)));
    const eased = 1 - (1 - p) ** 3;
    hands.style.setProperty('--p', eased.toFixed(4));
    if (p > 0.97) hands.classList.add('is-met');
    else if (p < 0.8) hands.classList.remove('is-met');
  };

  /* ---------- Дорожка отбора ---------- */
  const route = document.querySelector('[data-route]');
  const svg = route.querySelector('svg');
  const path = route.querySelector('[data-route-path]');
  const bg = route.querySelector('[data-route-bg]');
  const rider = route.querySelector('[data-route-rider]');
  const stamp = route.querySelector('[data-stamp]');
  const dots = [...route.querySelectorAll('[data-route-dot]')];
  let total = 0;
  let dotAt = [];   // на какой длине линии находится каждый кружок

  /** Плавная линия через центры кружков: S-образные изгибы между соседними точками */
  const buildRoute = () => {
    const box = route.getBoundingClientRect();
    const pts = dots.map((d) => {
      const r = d.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    });
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      d += Math.abs(dx) > Math.abs(dy)
        ? ` C ${a.x + dx / 2} ${a.y}, ${b.x - dx / 2} ${b.y}, ${b.x} ${b.y}`     // в ряд (компьютер)
        : ` C ${a.x} ${a.y + dy / 2}, ${b.x} ${b.y - dy / 2}, ${b.x} ${b.y}`;   // столбиком (телефон)
    }
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    path.setAttribute('d', d);
    bg.setAttribute('d', d);
    total = path.getTotalLength();
    path.style.strokeDasharray = `${total} ${total}`;

    // Длина линии до каждого кружка – ищем ближайшую точку на линии
    const samples = [];
    for (let s = 0; s <= 300; s += 1) { const L = (total * s) / 300; samples.push({ L, p: path.getPointAtLength(L) }); }
    dotAt = pts.map((pt) => samples.reduce((best, s) => {
      const dist = (s.p.x - pt.x) ** 2 + (s.p.y - pt.y) ** 2;
      return dist < best.dist ? { dist, L: s.L } : best;
    }, { dist: Infinity, L: 0 }).L);
  };

  const updateRoute = () => {
    if (!total) return;
    const r = route.getBoundingClientRect();
    const vh = window.innerHeight;
    // Линия начинает рисоваться, когда дорожка поднялась до 80% экрана, и заканчивается, когда её низ дошёл до 75%
    const p = reduceMotion ? 1 : clamp((vh * 0.8 - r.top) / (r.height - vh * 0.05));
    const L = total * p;
    path.style.strokeDashoffset = total - L;
    const pt = path.getPointAtLength(L);
    const ahead = path.getPointAtLength(Math.min(total, L + 6));
    const angle = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 57.3;
    rider.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) rotate(${angle * 0.4 + L * 0.25}deg)`;
    dots.forEach((dot, i) => dot.classList.toggle('is-reached', L >= dotAt[i] - 4));
    stamp.classList.toggle('is-on', p >= 0.995);
  };

  /* ---------- Один обработчик прокрутки на всё (через requestAnimationFrame) ---------- */
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      if (reduceMotion) { hands.style.setProperty('--p', 1); hands.classList.add('is-met'); } else updateHands();
      updateRoute();
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Перестроить дорожку при изменении размеров (поворот телефона, загрузка шрифта)
  const rebuild = () => { buildRoute(); onScroll(); };
  if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(route);
  else window.addEventListener('resize', rebuild);
  rebuild();
});
