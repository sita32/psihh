/**
 * «Рядом» – страница «Психологам».
 * Только интерфейс, данных с сервера здесь нет:
 *  – блоки появляются при прокрутке;
 *  – панели «Что вы получаете» раскрываются по наведению / нажатию;
 *  – вкладки макета кабинета переключаются сами, пока пользователь не нажмёт на вкладку;
 */
document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Появление при прокрутке ---------- */
  const revealEls = document.querySelectorAll('.rv, [data-join]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Панели «Что вы получаете»: открыта всегда одна ----------
     На компьютере раскрываются при наведении, на телефоне – по нажатию. */
  const accPanels = [...document.querySelectorAll('[data-acc] .acc__p')];
  const openPanel = (p) => accPanels.forEach((x) => {
    x.classList.toggle('is-open', x === p);
    x.setAttribute('aria-expanded', String(x === p));
  });
  const canHover = window.matchMedia('(hover: hover) and (min-width: 901px)');
  accPanels.forEach((p) => {
    p.addEventListener('click', () => openPanel(p));
    p.addEventListener('focus', () => openPanel(p));
    p.addEventListener('mouseenter', () => { if (canHover.matches) openPanel(p); });
  });

  /* ---------- Вкладки кабинета ---------- */
  const tabsBox = document.querySelector('[data-tabs]');
  const tabs = [...tabsBox.querySelectorAll('[data-tab]')];
  const panes = document.querySelectorAll('[data-pane]');
  const TAB_TIME = 5000;
  let timer = null;
  let current = 0;

  const showTab = (i) => {
    current = i;
    tabs.forEach((t, k) => { t.classList.toggle('is-active', k === i); t.setAttribute('aria-selected', String(k === i)); });
    panes.forEach((p) => p.classList.toggle('is-active', p.dataset.pane === tabs[i].dataset.tab));
  };
  const stopAuto = () => { clearInterval(timer); timer = null; tabsBox.classList.remove('is-auto'); };
  const startAuto = () => {
    if (reduceMotion || timer) return;
    tabsBox.style.setProperty('--tab-time', `${TAB_TIME / 1000}s`);
    tabsBox.classList.add('is-auto');
    timer = setInterval(() => showTab((current + 1) % tabs.length), TAB_TIME);
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => { stopAuto(); showTab(i); }));
  // Стрелки влево/вправо по вкладкам
  tabsBox.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    stopAuto();
    const next = (current + (e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length;
    showTab(next);
    tabs[next].focus();
  });
  // Автопереключение – только пока раздел на экране
  if ('IntersectionObserver' in window) {
    let userStopped = false;
    tabs.forEach((t) => t.addEventListener('click', () => { userStopped = true; }));
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !userStopped) startAuto(); else if (!e.isIntersecting) stopAuto();
    }, { threshold: 0.4 }).observe(document.getElementById('cabinet'));
  }
});
