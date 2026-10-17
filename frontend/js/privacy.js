/**
 * «Рядом» – политика конфиденциальности.
 * Подсвечивает в оглавлении раздел, который сейчас читают,
 * а на телефоне сворачивает оглавление после перехода к разделу.
 */
document.addEventListener('DOMContentLoaded', () => {
  const links = [...document.querySelectorAll('.pv-toc a')];
  const details = document.querySelector('.pv-toc details');
  const narrow = window.matchMedia('(max-width: 900px)');

  // На телефоне оглавление по умолчанию свёрнуто – текст виден сразу
  if (narrow.matches) details.open = false;

  // Текущий раздел – тот, чей заголовок последним прошёл верхнюю треть экрана
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
  const update = () => {
    const line = window.innerHeight / 3;
    let current = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top < line) current = i; });
    links.forEach((a, i) => a.classList.toggle('is-current', i === current));
  };
  update();
  window.addEventListener('scroll', update, { passive: true });

  links.forEach((a) => a.addEventListener('click', () => { if (narrow.matches) details.open = false; }));
});
