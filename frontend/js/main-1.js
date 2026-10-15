/**
 * «Рядом» — главная страница.
 * Небольшие интерактивные элементы интерфейса (без зависимостей).
 */
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.header');
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');

  /** Тень у шапки после начала прокрутки */
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /** Открытие / закрытие мобильного меню */
  const setMenu = (open) => {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  // Закрываем меню после перехода по пункту
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
  // И по клавише Escape
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /** Слайдер отзывов: стрелки, точки-индикаторы, блокировка стрелок на краях */
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const track = slider.querySelector('.slider__track');
    const slides = Array.from(track.children);
    const dotsBox = slider.querySelector('.slider__dots');
    const section = slider.closest('section');
    const prevBtn = section.querySelector('.slider__btn--prev');
    const nextBtn = section.querySelector('.slider__btn:not(.slider__btn--prev)');

    // Шаг прокрутки = ширина карточки + отступ между карточками
    const step = () => slides[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    // Сколько карточек помещается на экране
    const perView = () => Math.max(1, Math.round(track.clientWidth / step()));
    // Количество «страниц» (позиций, куда можно прокрутить)
    const pages = () => Math.max(1, slides.length - perView() + 1);

    // Создаём точки заново (их число зависит от ширины экрана)
    const buildDots = () => {
      dotsBox.innerHTML = '';
      for (let i = 0; i < pages(); i++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Отзыв ${i + 1}`);
        dot.addEventListener('click', () => track.scrollTo({ left: i * step() }));
        dotsBox.appendChild(dot);
      }
      update();
    };

    // Подсвечиваем текущую точку и блокируем стрелки на краях
    const update = () => {
      const index = Math.round(track.scrollLeft / step());
      dotsBox.querySelectorAll('button').forEach((d, i) => d.classList.toggle('is-active', i === index));
      const maxScroll = track.scrollWidth - track.clientWidth - 2;
      if (prevBtn) prevBtn.disabled = track.scrollLeft <= 2;
      if (nextBtn) nextBtn.disabled = track.scrollLeft >= maxScroll;
    };

    prevBtn?.addEventListener('click', () => track.scrollBy({ left: -step() }));
    nextBtn?.addEventListener('click', () => track.scrollBy({ left: step() }));
    track.addEventListener('scroll', () => window.requestAnimationFrame(update), { passive: true });
    window.addEventListener('resize', buildDots);
    buildDots();
  });

  /** «Как начать терапию»: раскрывающиеся панели с автопереключением */
  const stepsBox = document.querySelector('[data-steps]');
  if (stepsBox) {
    const steps = Array.from(stepsBox.children);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = parseFloat(getComputedStyle(stepsBox).getPropertyValue('--dur')) * 1000 || 5000;
    let current = 0;
    let timer = null;
    let visible = false;

    // Открыть шаг с номером index
    const open = (index) => {
      current = (index + steps.length) % steps.length;
      steps.forEach((step, i) => {
        step.classList.toggle('is-active', i === current);
        step.setAttribute('aria-expanded', String(i === current));
      });
      restart();
    };

    // Перезапуск таймера автопереключения (и полоски-таймера в CSS)
    const restart = () => {
      clearTimeout(timer);
      stepsBox.classList.remove('is-playing');
      if (calm || !visible) return;
      void stepsBox.offsetWidth;                 // сброс CSS-анимации полоски
      stepsBox.classList.add('is-playing');
      timer = setTimeout(() => open(current + 1), duration);
    };

    steps.forEach((step, i) => {
      step.addEventListener('click', () => { if (i !== current) open(i); });
      // На компьютере достаточно навести мышь на свёрнутую панель
      step.addEventListener('mouseenter', () => {
        if (i !== current && window.matchMedia('(hover: hover) and (min-width: 961px)').matches) open(i);
      });
      // С клавиатуры: Enter/пробел открывают шаг, стрелки — соседний
      step.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); open(i + 1); steps[current].focus(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); open(i - 1); steps[current].focus(); }
      });
    });

    // Пока мышь над блоком — пауза (чтобы спокойно прочитать)
    stepsBox.addEventListener('mouseenter', () => { clearTimeout(timer); stepsBox.classList.add('is-paused'); });
    stepsBox.addEventListener('mouseleave', () => { stepsBox.classList.remove('is-paused'); restart(); });

    // Автопереключение работает, только когда блок виден на экране
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) restart(); else { clearTimeout(timer); stepsBox.classList.remove('is-playing'); }
    }, { threshold: 0.4 }).observe(stepsBox);
  }

  /** FAQ: одновременно раскрыт только один вопрос */
  const faqItems = document.querySelectorAll('.faq__item');
  faqItems.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      faqItems.forEach((other) => { if (other !== item) other.open = false; });
    });
  });
});
