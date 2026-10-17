/**
 * «Рядом» – восстановление пароля (forgot.html).
 * Экраны: почта → «проверьте почту» → новый пароль (по ссылке из письма) → готово.
 * Сервера пока нет: письмо не уходит, ссылку из письма заменяет демо-ссылка
 * forgot.html?token=demo (а ?token=expired показывает устаревшую ссылку).
 * Позже: POST /api/auth/forgot { email }, POST /api/auth/reset { token, password }.
 */
const RESEND_AFTER = 59;   // секунд до повторной отправки письма

document.addEventListener('DOMContentLoaded', () => {
  const views = Object.fromEntries([...document.querySelectorAll('.fg-view')].map((el) => [el.dataset.view, el]));
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Показать экран и поставить фокус на его заголовок */
  const show = (name) => {
    Object.entries(views).forEach(([key, el]) => {
      el.hidden = key !== name;
      el.classList.toggle('is-active', key === name);
    });
    const title = views[name].querySelector('.fg-title');
    if (name !== 'email') title.focus({ preventScroll: true });
  };

  /* ---------- Какой экран открыть: по ссылке из письма или сначала ---------- */
  const token = new URLSearchParams(location.search).get('token');
  if (token === 'expired') show('expired');
  else if (token) show('reset');

  /* ---------- 1. Почта ---------- */
  const emailForm = views.email;
  const emailInput = emailForm.querySelector('[name="email"]');
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  /** a***@mail.com – почту целиком на экране не показываем */
  const mask = (email) => {
    const [user, domain] = email.split('@');
    return `${user[0]}${'*'.repeat(Math.min(Math.max(user.length - 1, 3), 6))}@${domain}`;
  };

  emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const field = emailInput.closest('.field');
    if (!emailOk(email)) { field.classList.add('is-error'); emailInput.focus(); return; }
    field.classList.remove('is-error');
    views.sent.querySelector('[data-email]').textContent = mask(email);
    show('sent');
    startTimer();
  });
  emailInput.addEventListener('input', () => {
    if (emailOk(emailInput.value.trim())) emailInput.closest('.field').classList.remove('is-error');
  });

  /* ---------- 2. Письмо отправлено: повторная отправка не чаще раза в минуту ---------- */
  const wait = views.sent.querySelector('[data-wait]');
  const timerEl = views.sent.querySelector('[data-timer]');
  const resendBtn = views.sent.querySelector('[data-resend]');
  let timer = null;

  function startTimer() {
    let left = RESEND_AFTER;
    clearInterval(timer);
    wait.hidden = false;
    resendBtn.hidden = true;
    const tick = () => {
      timerEl.textContent = `0:${String(left).padStart(2, '0')}`;
      if (left-- <= 0) {
        clearInterval(timer);
        wait.hidden = true;
        resendBtn.hidden = false;
      }
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  resendBtn.addEventListener('click', () => {
    // API: POST /api/auth/forgot ещё раз с той же почтой
    startTimer();
    wait.firstChild.textContent = 'Отправили ещё раз. Следующее письмо – через ';
  });

  views.sent.querySelector('[data-change]').addEventListener('click', () => {
    clearInterval(timer);
    show('email');
    emailInput.select();
  });

  /* ---------- 3. Новый пароль: требования загораются по мере ввода ---------- */
  const resetForm = views.reset;
  const pass = resetForm.querySelector('[name="password"]');
  const repeat = resetForm.querySelector('[name="repeat"]');
  const rulesList = resetForm.querySelector('.fg-rules');
  const RULES = {
    len: () => pass.value.length >= 8,
    digit: () => /\d/.test(pass.value),
    same: () => pass.value !== '' && pass.value === repeat.value,
  };
  /** Обновить все три строки требований; true – если выполнены все */
  const checkRules = () => Object.entries(RULES).map(([key, test]) => {
    const ok = test();
    rulesList.querySelector(`[data-rule="${key}"]`).classList.toggle('is-ok', ok);
    return ok;
  }).every(Boolean);
  resetForm.addEventListener('input', checkRules);
  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!checkRules()) { rulesList.classList.add('is-checked'); pass.focus(); return; }
    // API: POST /api/auth/reset { token, password } – сервер меняет пароль и закрывает другие сессии
    history.replaceState(null, '', 'forgot.html');   // ссылка одноразовая – убираем токен из адреса
    show('done');
  });

  /* ---------- Показать / скрыть пароль ---------- */
  document.querySelectorAll('.field__eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      btn.querySelector('use').setAttribute('href', visible ? '#i-eye-off' : '#i-eye');
      btn.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
    });
  });

  /* ---------- Девушка над карточкой «пишет», пока вводят текст (как на странице входа) ---------- */
  const char = document.querySelector('.peek__char');
  const idle = char.querySelector('.peek__idle');
  const writes = [...char.querySelectorAll('.peek__write')];
  const frame = (img) => char.querySelectorAll('img').forEach((el) => el.classList.toggle('is-shown', el === img));
  let flip = null;
  let stopTyping = null;
  let i = 0;
  document.addEventListener('input', () => {
    if (calm) return;
    char.classList.add('is-typing');
    if (!flip) { frame(writes[0]); flip = setInterval(() => frame(writes[i = (i + 1) % writes.length]), 180); }
    clearTimeout(stopTyping);
    stopTyping = setTimeout(() => {
      clearInterval(flip);
      flip = null;
      char.classList.remove('is-typing');
      frame(idle);
    }, 700);
  });

  /* ---------- Параллакс фона ---------- */
  const bg = document.querySelector('.auth-bg');
  if (bg && !calm) {
    let raf = null;
    window.addEventListener('mousemove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        bg.style.setProperty('--px', (-(e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        bg.style.setProperty('--py', (-(e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
        raf = null;
      });
    });
  }
});
