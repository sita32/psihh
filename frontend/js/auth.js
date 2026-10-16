/**
 * «Рядом» – страница входа и регистрации.
 * Пока только интерфейс: переключение вкладок, показ пароля,
 * подсказка для психологов и простая проверка полей (без отправки на сервер).
 */
/* Демо-почта психолога для входа без сервера */
const DEMO_PSYCHOLOGIST = 'marina@ryadom.by';

document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelector('.tabs');
  const tabButtons = document.querySelectorAll('.tabs__btn');
  const forms = {
    login: document.getElementById('form-login'),
    register: document.getElementById('form-register'),
  };

  /** Параллакс фона: предметы слегка сдвигаются вслед за мышью */
  const bg = document.querySelector('.auth-bg');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (bg && !calm) {
    let frame = null;
    window.addEventListener('mousemove', (e) => {
      if (frame) return;                       // не чаще одного раза за кадр
      frame = requestAnimationFrame(() => {
        // -1…1 относительно центра экрана; знак минус – предметы «уходят» от курсора
        bg.style.setProperty('--px', (-(e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        bg.style.setProperty('--py', (-(e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
        frame = null;
      });
    });
  }

  /** Персонажи над карточкой: «пишут», пока пользователь вводит текст */
  document.querySelectorAll('.peek__char').forEach((char) => {
    const idle = char.querySelector('.peek__idle');
    const writes = Array.from(char.querySelectorAll('.peek__write'));
    const form = document.getElementById(char.dataset.form);
    let timer = null;     // смена кадров «пишет»
    let stopTimer = null; // возврат в покой после паузы во вводе
    let i = 0;

    const show = (img) => char.querySelectorAll('img').forEach((el) => el.classList.toggle('is-shown', el === img));

    const stop = () => {
      if (typeof timer === 'number') clearInterval(timer);
      timer = null;
      char.classList.remove('is-typing');
      show(idle);
    };

    form.addEventListener('input', (e) => {
      if (calm || !writes.length || e.target.type === 'checkbox' || e.target.type === 'radio') return;
      char.classList.add('is-typing');
      if (!timer) {
        show(writes[0]);
        // если кадров «пишет» несколько – листаем их по кругу
        timer = writes.length > 1 ? setInterval(() => show(writes[i = (i + 1) % writes.length]), 180) : true;
      }
      clearTimeout(stopTimer);
      stopTimer = setTimeout(stop, 700);   // перестал печатать – персонаж замирает
    });
  });

  /** Переключение вкладки «Вход» / «Регистрация» */
  const showTab = (name) => {
    tabs.dataset.active = name;
    document.querySelector('.auth__card').dataset.active = name;   // какой персонаж выглядывает
    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    Object.entries(forms).forEach(([key, form]) => form.classList.toggle('is-active', key === name));
    document.title = name === 'login' ? 'Вход – Рядом' : 'Регистрация – Рядом';
    history.replaceState(null, '', name === 'login' ? '#login' : '#register');
  };

  // Кнопки вкладок и ссылки «Зарегистрироваться / Войти» внизу форм
  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', () => showTab(el.dataset.tab));
  });
  // Открыть сразу регистрацию по ссылке login.html#register
  // (#register-psychologist – регистрация с уже выбранной ролью «психолог», ссылка со страницы «Психологам»)
  if (location.hash === '#register' || location.hash === '#register-psychologist') showTab('register');

  /** Показать / скрыть пароль */
  document.querySelectorAll('.field__eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
      btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    });
  });

  /** Подсказка для психолога появляется при выборе этой роли */
  const note = document.querySelector('[data-for-role="psychologist"]');
  document.querySelectorAll('input[name="role"]').forEach((radio) => {
    radio.addEventListener('change', () => { note.hidden = radio.value !== 'psychologist' || !radio.checked; });
  });
  if (location.hash === '#register-psychologist') {
    const psy = document.querySelector('input[name="role"][value="psychologist"]');
    psy.checked = true;
    psy.dispatchEvent(new Event('change'));
    history.replaceState(null, '', '#register');
  }

  /** Простая проверка полей перед отправкой */
  const isValid = (input) => {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    if (input.minLength > 0) return input.value.length >= input.minLength;
    return input.value.trim() !== '';
  };

  Object.values(forms).forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();                     // сервера пока нет – форму не отправляем
      let ok = true;
      form.querySelectorAll('input[required]').forEach((input) => {
        const wrap = input.closest('.field, .checkbox');
        const valid = isValid(input);
        wrap.classList.toggle('is-error', !valid);
        if (!valid) ok = false;
      });
      if (ok) {
        // API: позже здесь будет запрос к серверу (NodeJS) – POST /api/auth/login или /api/auth/register.
        // Пока для демонстрации сразу открываем нужный кабинет.
        const data = Object.fromEntries(new FormData(form));
        // Демо-вход: роль определяется по почте (как будто сервер вернул роль пользователя).
        // marina@ryadom.by – психолог Марина Волкова, любая другая почта – клиент Анна.
        const role = data.role || (data.email.trim().toLowerCase() === DEMO_PSYCHOLOGIST ? 'psychologist' : 'client');
        location.href = role === 'psychologist' ? 'cabinet-psychologist.html' : 'cabinet-client.html';
      }
    });

    // Убираем ошибку, как только пользователь начал исправлять поле
    form.addEventListener('input', (e) => {
      e.target.closest('.field, .checkbox')?.classList.remove('is-error');
    });
  });
});
