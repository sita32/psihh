/**
 * «Рядом» – общие помощники интерфейса для страниц кабинетов и профиля психолога.
 * Подключается раньше скрипта страницы. Всё лежит в одном объекте UI,
 * чтобы не засорять глобальную область имён.
 */
const UI = (() => {
  /** Экранирование текста перед вставкой в HTML */
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Правильное окончание: 1 сессия, 2 сессии, 5 сессий */
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };

  /* ---------- Даты ---------- */
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  /** Дата через k дней от сегодняшней (k может быть отрицательным) */
  const dateAt = (k) => { const d = today(); d.setDate(d.getDate() + k); return d; };
  /** Сколько дней от сегодня до даты d */
  const daysFrom = (d) => Math.round((new Date(d).setHours(0, 0, 0, 0) - today()) / 86400000);
  /** «сегодня», «завтра», «чт, 15 октября» */
  const dayLabel = (d) => {
    const k = daysFrom(d);
    if (k === 0) return 'сегодня';
    if (k === 1) return 'завтра';
    if (k === -1) return 'вчера';
    return new Date(d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  };
  const fullDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  /** Дата + время «чт, 15 октября, 12:30» */
  const at = (d, time) => `${dayLabel(d)}, ${time}`;

  /* ---------- Аватары ---------- */
  /** Цвет «заглушки без фото» зависит от имени – у одного человека всегда одинаковый */
  const COLORS = ['#F0886B', '#4AA597', '#E9B526', '#4C8FE6', '#A08BEA', '#2E4C86'];
  const colorFor = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  };
  /** Квадратный аватар: фото или первая буква имени на цветном фоне */
  const avatar = (name, src, size = 44) => (src
    ? `<span class="ava-sq" style="--s:${size}px"><img src="${src}" alt=""></span>`
    : `<span class="ava-sq" style="--s:${size}px;--c:${colorFor(name)}">${escapeHtml(name.trim()[0] || '?')}</span>`);

  /** Звёзды рейтинга (заполненные и пустые) */
  const stars = (n, size = 16) => `<span class="stars-row" style="--sz:${size}px" aria-label="Оценка ${n} из 5">${
    [1, 2, 3, 4, 5].map((i) => `<svg class="${i <= n ? 'is-on' : ''}"><use href="#i-star"/></svg>`).join('')}</span>`;

  /* ---------- Всплывающее уведомление ---------- */
  let toastTimer = null;
  const toast = (text, isError = false) => {
    const el = document.querySelector('.toast');
    if (!el) return;
    el.querySelector('span').textContent = text;
    el.querySelector('use').setAttribute('href', isError ? '#i-alert' : '#i-check');
    el.classList.toggle('is-error', isError);
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2800);
  };

  /* ---------- Диалоги ---------- */
  /** Открытие диалогов по кнопкам с data-open="id"; клик по затемнению закрывает окно */
  const initModals = () => {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-open]');
      if (btn) document.getElementById(btn.dataset.open)?.showModal();
    });
    document.querySelectorAll('dialog.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m) m.close('cancel'); });
    });
  };

  /**
   * Диалог «укажите причину» (отмена, перенос, блокировка, отклонение).
   * Возвращает Promise с текстом причины или null, если пользователь передумал.
   * Разметка – <dialog id="reason-modal"> на странице.
   */
  const askReason = ({ title, text = '', confirm = 'Подтвердить', danger = false, presets = [] }) => new Promise((resolve) => {
    const m = document.getElementById('reason-modal');
    let settled = false;           // ответ отдаётся один раз: кнопкой «Подтвердить» или при закрытии окна
    const area = m.querySelector('textarea');
    const okBtn = m.querySelector('[data-reason-ok]');
    m.querySelector('[data-reason-title]').textContent = title;
    m.querySelector('[data-reason-text]').innerHTML = text;
    m.querySelector('[data-reason-text]').hidden = !text;
    okBtn.textContent = confirm;
    okBtn.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
    // Быстрые варианты причины – нажатие подставляет текст
    m.querySelector('[data-reason-presets]').innerHTML = presets
      .map((p) => `<button type="button" class="preset">${escapeHtml(p)}</button>`).join('');
    area.value = '';
    m.querySelector('.f').classList.remove('is-error');

    const onPreset = (e) => {
      const b = e.target.closest('.preset');
      if (b) { area.value = b.textContent; area.focus(); m.querySelector('.f').classList.remove('is-error'); }
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      m.removeEventListener('click', onPreset);
      okBtn.removeEventListener('click', onOk);
      resolve(value);
    };
    const onOk = (e) => {
      e.preventDefault();
      if (area.value.trim().length < 3) { m.querySelector('.f').classList.add('is-error'); area.focus(); return; }
      finish(area.value.trim());     // не ждём события close – в некоторых браузерах оно приходит с задержкой
      m.close('ok');
    };
    const onClose = () => finish(null);
    m.addEventListener('click', onPreset);
    okBtn.addEventListener('click', onOk);
    m.addEventListener('close', onClose, { once: true });
    m.returnValue = '';
    m.showModal();
    area.focus();
  });

  /** Простое подтверждение без причины. Разметка – <dialog id="confirm-modal"> */
  const confirmAction = ({ title, text, confirm = 'Да', danger = false }) => new Promise((resolve) => {
    const m = document.getElementById('confirm-modal');
    m.querySelector('[data-confirm-title]').textContent = title;
    m.querySelector('[data-confirm-text]').innerHTML = text;
    const ok = m.querySelector('[data-confirm-ok]');
    ok.textContent = confirm;
    ok.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; ok.removeEventListener('click', onOk); resolve(value); } };
    const onOk = () => finish(true);  // кнопка «Да» сразу отдаёт ответ, окно закроет форма method="dialog"
    ok.addEventListener('click', onOk);
    m.returnValue = '';
    m.addEventListener('close', () => finish(m.returnValue === 'ok'), { once: true });
    m.showModal();
  });

  /**
   * Диалог отзыва: оценка звёздами, текст, «анонимно».
   * Возвращает Promise с { rating, text, anon } или null. Разметка – <dialog id="review-modal">.
   */
  const RATE_CAPS = ['', 'Очень плохо', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
  const askReview = ({ title = 'Отзыв о сессии', who = '', initial = null }) => new Promise((resolve) => {
    const m = document.getElementById('review-modal');
    let settled = false;
    const area = m.querySelector('textarea');
    const field = area.closest('.f');
    const cap = m.querySelector('[data-rate-cap]');
    const count = m.querySelector('[data-review-count]');
    const okBtn = m.querySelector('[data-review-ok]');
    m.querySelector('[data-review-title]').textContent = title;
    m.querySelector('[data-review-who]').innerHTML = who;

    // Заполняем форму (при редактировании – прежними значениями)
    m.querySelectorAll('input[name="rating"]').forEach((r) => { r.checked = initial ? Number(r.value) === initial.rating : false; });
    m.querySelector('input[name="anon"]').checked = initial ? initial.anon : false;
    area.value = initial ? initial.text : '';
    field.classList.remove('is-error');
    const rating = () => Number(m.querySelector('input[name="rating"]:checked')?.value || 0);
    const sync = () => {
      cap.textContent = rating() ? RATE_CAPS[rating()] : 'Поставьте оценку';
      cap.classList.remove('is-error');
      count.textContent = `${area.value.length} / ${area.maxLength}`;
    };
    sync();

    const onInput = () => { sync(); field.classList.remove('is-error'); };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      m.removeEventListener('input', onInput);
      okBtn.removeEventListener('click', onOk);
      resolve(value);
    };
    const onOk = () => {
      if (!rating()) { cap.textContent = 'Выберите оценку от 1 до 5'; return; }
      if (area.value.trim().length < 30) { field.classList.add('is-error'); area.focus(); return; }
      finish({ rating: rating(), text: area.value.trim(), anon: m.querySelector('input[name="anon"]').checked });
      m.close('ok');
    };
    const onClose = () => finish(null);
    m.addEventListener('input', onInput);
    okBtn.addEventListener('click', onOk);
    m.addEventListener('close', onClose, { once: true });
    m.returnValue = '';
    m.showModal();
  });

  /** Вкладки-фильтры: <div class="tabs-line" data-tabs> с кнопками data-tab="…" */
  const initTabs = (root, onChange) => {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      root.querySelectorAll('[data-tab]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      onChange(btn.dataset.tab);
    });
  };

  return {
    escapeHtml, plural, today, dateAt, daysFrom, dayLabel, fullDate, shortDate, at,
    colorFor, avatar, stars, toast, initModals, askReason, askReview, confirmAction, initTabs,
  };
})();
