/**
 * «Рядом» – экран загрузки страницы (логотип из двух кругов, стили – в style.css).
 * Подключается в <head> сразу после style.css. Если страница загрузилась быстрее
 * 0,35 с, экран так и не появится. ?loader в адресе оставляет его на экране (для демонстрации).
 */
(() => {
  const el = document.createElement('div');
  el.className = 'page-loader';
  el.setAttribute('role', 'status');
  el.innerHTML = '<div class="loader"><span class="loader__mark" aria-hidden="true"><i></i><i></i></span>'
    + '<span class="loader__text">Секунду, всё готовится…</span></div>';
  document.documentElement.appendChild(el);

  if (new URLSearchParams(location.search).has('loader')) return;
  window.addEventListener('load', () => {
    el.classList.add('is-done');
    setTimeout(() => el.remove(), 400);
  });
})();
