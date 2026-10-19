/**
 * «Рядом» – страница входа и регистрации.
 * Переключение вкладок, показ пароля, поля психолога, проверка полей
 * и отправка через API: POST /api/auth/login и /api/auth/register.
 */
/* Куда перейти после входа: ?next=… (только страница этого сайта), иначе – кабинет по роли */
const afterLogin = (user) => {
  const next = new URLSearchParams(location.search).get('next');
  return next && /^[\w-]+\.html(\?[^#]*)?$/.test(next) ? next : Session.home(user);
};

document.addEventListener('DOMContentLoaded', () => {
  // Уже вошли – форма не нужна
  Session.user().then((u) => { if (u) location.replace(afterLogin(u)); }).catch(() => {});

  const tabs = document.querySelector('.tabs');
  const tabButtons = document.querySelectorAll('.tabs__btn');
  const forms = {
    login: document.getElementById('form-login'),
    register: document.getElementById('form-register'),
  };

  /** Имя из анкеты подбора (quiz.html) – сразу в форму регистрации, чтобы не вводить дважды */
  try {
    const quiz = JSON.parse(localStorage.getItem('ryadom-quiz') || 'null');
    const name = quiz && (quiz.answers.find(([key]) => key === 'name') || [])[1];
    const input = forms.register.querySelector('[name="name"]');
    if (name && !input.value) input.value = name;
  } catch { /* хранилище недоступно – просто пустое поле */ }

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
  const startHash = location.hash;   // запоминаем до showTab: он сам меняет адрес на #register
  if (startHash === '#register' || startHash === '#register-psychologist') showTab('register');

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

  /** Поля и подсказка для психолога появляются при выборе этой роли */
  const psyOnly = document.querySelectorAll('[data-for-role="psychologist"]');
  document.querySelectorAll('input[name="role"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      psyOnly.forEach((el) => { el.hidden = radio.value !== 'psychologist' || !radio.checked; });
    });
  });
  const yearInput = forms.register.querySelector('[name="practiceYear"]');
  yearInput.max = new Date().getFullYear();
  if (startHash === '#register-psychologist') {
    const psy = document.querySelector('input[name="role"][value="psychologist"]');
    psy.checked = true;
    psy.dispatchEvent(new Event('change'));
    history.replaceState(null, '', '#register');
  }

  /** Простая проверка полей перед отправкой */
  const isValid = (input) => {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'radio') return Boolean(input.form.querySelector(`input[name="${input.name}"]:checked`));
    if (input.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    if (input.type === 'number') return input.value !== '' && +input.value >= +input.min && +input.value <= +input.max;
    if (input.minLength > 0) return input.value.length >= input.minLength;
    return input.value.trim() !== '';
  };

  /** Ошибка под полем: свой текст от сервера или исходный из разметки */
  const setFieldError = (wrap, text) => {
    const error = wrap.querySelector('.field__error');
    if (error) {
      error.dataset.text ??= error.textContent;
      error.textContent = text || error.dataset.text;
    }
    wrap.classList.add('is-error');
  };
  const clearFieldError = (wrap) => {
    const error = wrap.querySelector('.field__error');
    if (error && error.dataset.text) error.textContent = error.dataset.text;
    wrap.classList.remove('is-error');
  };

  /** Плашка над кнопкой */
  const showAlert = (form, text) => {
    const alert = form.querySelector('.auth__alert');
    alert.textContent = text || '';
    alert.hidden = !text;
  };

  /** Кнопка «ждём ответ сервера» */
  const setBusy = (form, busy) => {
    const btn = form.querySelector('.auth__btn');
    btn.dataset.idle ??= btn.textContent;
    btn.disabled = busy;
    btn.textContent = busy ? btn.dataset.busy : btn.dataset.idle;
  };

  /** Ошибки сервера: по полям – под полями, остальное – плашкой */
  const SERVER_FIELDS = { practiceSince: 'practiceYear' };   // имя поля в API → в форме
  const showServerError = (form, error) => {
    let shown = false;
    Object.entries(error.fields || {}).forEach(([field, text]) => {
      const input = form.querySelector(`[name="${SERVER_FIELDS[field] || field}"]`);
      const wrap = input && !input.closest('[hidden]') && input.closest('.field');
      if (wrap) { setFieldError(wrap, text); shown = true; }
    });
    if (!shown) showAlert(form, error.message);
  };

  /** Данные формы для API */
  const payload = (form, data) => {
    if (form === forms.login) {
      return { email: data.email.trim(), password: data.password, remember: data.remember === 'on' };
    }
    const body = { role: data.role, name: data.name.trim(), email: data.email.trim(), password: data.password };
    if (data.role === 'psychologist') {
      Object.assign(body, { lastName: data.lastName.trim(), gender: data.gender, practiceSince: `${data.practiceYear}-01-01` });
    }
    return body;
  };

  Object.values(forms).forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.querySelector('.auth__btn').disabled) return;   // запрос уже отправлен
      showAlert(form, '');

      let ok = true;
      form.querySelectorAll('input[required]').forEach((input) => {
        if (input.closest('[hidden]')) return;                  // поля психолога у клиента не проверяем
        const wrap = input.closest('.field, .checkbox');
        if (isValid(input)) clearFieldError(wrap);
        else { setFieldError(wrap); ok = false; }
      });
      if (!ok) return;

      const data = Object.fromEntries(new FormData(form));
      setBusy(form, true);
      try {
        const { user } = await API.post(form === forms.login ? '/auth/login' : '/auth/register', payload(form, data));
        location.href = afterLogin(user);
      } catch (err) {
        setBusy(form, false);
        showServerError(form, err);
      }
    });

    // Убираем ошибку, как только пользователь начал исправлять поле
    form.addEventListener('input', (e) => {
      const wrap = e.target.closest('.field, .checkbox');
      if (wrap) clearFieldError(wrap);
      showAlert(form, '');
    });
  });
});
