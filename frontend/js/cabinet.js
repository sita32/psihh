/**
 * «Рядом» – личный кабинет (клиент и психолог).
 * Пока только интерфейс: данные никуда не отправляются, сохранение показывает уведомление.
 * Позже здесь будут запросы к API на NodeJS (см. комментарии «API»).
 */
document.addEventListener('DOMContentLoaded', () => {
  const role = document.body.dataset.role;            // client | psychologist
  const form = document.getElementById('profile-form');
  const toastEl = document.querySelector('.toast');

  /* ------------------------------------------------------------------
     Общие помощники
     ------------------------------------------------------------------ */

  /** Всплывающее уведомление внизу экрана */
  let toastTimer = null;
  const toast = (text, isError = false) => {
    toastEl.querySelector('span').textContent = text;
    toastEl.querySelector('use').setAttribute('href', isError ? '#i-alert' : '#i-check');
    toastEl.classList.toggle('is-error', isError);
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2800);
  };

  /** Цвет «заглушки без фото» зависит от имени – у одного человека всегда одинаковый */
  const COLORS = ['#F0886B', '#4AA597', '#E9B526', '#4C8FE6', '#A08BEA', '#2E4C86'];
  const colorFor = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  };

  /** Вписать в квадратный аватар картинку или первую букву имени */
  const paintAvatar = (el, { src = null, name = '' }) => {
    if (src) {
      el.innerHTML = `<img src="${src}" alt="">`;
    } else {
      el.textContent = (name.trim()[0] || '?').toUpperCase();
      el.style.setProperty('--c', colorFor(name.trim() || '?'));
    }
  };

  /** Открытие диалогов по кнопкам с data-open="id" */
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.open).showModal());
  });

  /** Счётчики символов у текстовых полей */
  document.querySelectorAll('[data-count-for]').forEach((counter) => {
    const area = form.querySelector(`[name="${counter.dataset.countFor}"]`);
    const update = () => { counter.textContent = `${area.value.length} / ${area.maxLength}`; };
    area.addEventListener('input', update);
    update();
  });

  /** Панель «Сохранить» появляется, только когда в форме что-то изменили */
  const savebar = document.querySelector('.savebar');
  const markDirty = () => savebar.classList.add('is-shown');
  const markSaved = () => savebar.classList.remove('is-shown');
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  /** Удаление аккаунта / профиля (подтверждение в диалоге) */
  const deleteModal = document.getElementById('delete-modal');
  deleteModal.addEventListener('close', () => {
    if (deleteModal.returnValue !== 'delete') return;
    // API: DELETE /api/users/me
    toast(role === 'client' ? 'Аккаунт удалён' : 'Профиль удалён');
    setTimeout(() => { location.href = 'index.html'; }, 1400);
  });

  /** Проверка обязательных полей формы */
  const validateRequired = () => {
    let firstBad = null;
    form.querySelectorAll('[required]').forEach((input) => {
      const field = input.closest('.f');
      let ok = input.value.trim() !== '';
      if (ok && input.type === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
      field.classList.toggle('is-error', !ok);
      if (!ok && !firstBad) firstBad = field;
    });
    return firstBad;
  };
  // Ошибка у поля пропадает, как только его начали исправлять
  form.addEventListener('input', (e) => e.target.closest('.f')?.classList.remove('is-error'));


  /* ------------------------------------------------------------------
     Кабинет клиента: аватар из готовых или «без фото»
     ------------------------------------------------------------------ */
  if (role === 'client') {
    const nameInput = form.querySelector('[name="name"]');
    const modal = document.getElementById('avatar-modal');
    let avatar = 'a03';                                 // выбранный аватар; 'none' – без фото

    const render = () => {
      const src = avatar === 'none' ? null : `assets/img/avatars/${avatar}.webp`;
      document.querySelectorAll('[data-avatar]').forEach((el) => paintAvatar(el, { src, name: nameInput.value }));
      // В диалоге плитка «Без фото» показывает букву текущего имени
      paintAvatar(modal.querySelector('[data-initial]'), { name: nameInput.value });
      document.querySelector('[data-bind="me-name"]').textContent = nameInput.value.trim() || 'Без имени';
    };

    // Отмечаем в диалоге текущий выбор при открытии
    modal.addEventListener('toggle', () => {
      if (!modal.open) return;
      const current = modal.querySelector(`input[value="${avatar}"]`);
      if (current) current.checked = true;
    });
    modal.addEventListener('close', () => {
      if (modal.returnValue !== 'ok') return;
      avatar = modal.querySelector('input[name="avatar"]:checked').value;
      render(); markDirty();
    });
    // Двойной клик по аватару – выбрать и сразу закрыть
    modal.querySelectorAll('.ava-opt').forEach((opt) => opt.addEventListener('dblclick', () => modal.close('ok')));

    document.querySelector('[data-avatar-clear]').addEventListener('click', () => { avatar = 'none'; render(); markDirty(); });
    nameInput.addEventListener('input', render);
    render();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = validateRequired();
      if (bad) { bad.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Проверьте выделенные поля', true); return; }
      // API: PATCH /api/clients/me  { ...данные формы, avatar }
      markSaved();
      toast('Изменения сохранены');
    });
  }


  /* ------------------------------------------------------------------
     Кабинет психолога: фото (обязательно), документы, предпросмотр карточки
     ------------------------------------------------------------------ */
  if (role === 'psychologist') {
    const upload = document.querySelector('[data-upload]');
    const photoInput = upload.querySelector('input');
    const photoActions = document.querySelector('[data-photo-actions]');
    const photoError = document.querySelector('[data-photo-error]');
    const miniPhotos = document.querySelectorAll('[data-photo-mini], [data-pv-photo]');
    let photoUrl = null;
    const MAX_PHOTO = 5 * 1024 * 1024;

    // Поля формы по имени (через elements – у формы есть свои свойства role, name и т.п.)
    const F = (n) => form.elements.namedItem(n);
    const fullName = () => `${F('first').value} ${F('last').value}`.trim();

    /** Показать выбранное фото везде: в зоне загрузки, в шапке и в предпросмотре */
    const setPhoto = (url) => {
      photoUrl = url;
      upload.classList.toggle('has-photo', !!url);
      upload.querySelector('img')?.remove();
      if (url) upload.insertAdjacentHTML('beforeend', `<img src="${url}" alt="Ваше фото">`);
      photoActions.hidden = !url;
      upload.classList.remove('is-error');
      photoError.style.display = 'none';
      miniPhotos.forEach((el) => paintAvatar(el, { src: url, name: F('first').value }));
      updateProgress();
    };

    /** Проверка и чтение файла фото */
    const readPhoto = (file) => {
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Нужен файл JPG, PNG или WEBP', true); return; }
      if (file.size > MAX_PHOTO) { toast('Фото больше 5 МБ – выберите поменьше', true); return; }
      const reader = new FileReader();
      reader.onload = () => { setPhoto(reader.result); markDirty(); };
      reader.readAsDataURL(file);            // API: позже – загрузка файла на сервер (multipart/form-data)
    };

    photoInput.addEventListener('change', () => readPhoto(photoInput.files[0]));
    document.querySelector('[data-photo-replace]').addEventListener('change', (e) => readPhoto(e.target.files[0]));
    document.querySelector('[data-photo-remove]').addEventListener('click', () => { photoInput.value = ''; setPhoto(null); markDirty(); });

    // Перетаскивание файла мышью на зону загрузки
    const dragZone = (zone, onFiles) => {
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-drag'); }));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('is-drag')));
      zone.addEventListener('drop', (e) => { e.preventDefault(); onFiles(e.dataTransfer.files); });
    };
    dragZone(upload, (files) => readPhoto(files[0]));

    /* ---- Документы об образовании ---- */
    const docs = document.querySelector('[data-docs]');
    const drop = document.querySelector('[data-drop]');
    const sizeText = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
    const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const addDocs = (files) => {
      [...files].forEach((file) => {
        if (file.size > 10 * 1024 * 1024) { toast(`«${file.name}» больше 10 МБ`, true); return; }
        const ext = (file.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
        docs.insertAdjacentHTML('beforeend', `
          <div class="doc">
            <span class="doc__ic">${escapeHtml(ext)}</span>
            <span class="doc__name"><b>${escapeHtml(file.name)}</b><small>${sizeText(file.size)}</small></span>
            <span class="doc-status doc-status--wait">На&nbsp;проверке</span>
            <button type="button" class="icon-btn" data-doc-del aria-label="Удалить файл"><svg><use href="#i-trash"/></svg></button>
          </div>`);
      });
      markDirty(); updateProgress();
    };
    drop.querySelector('input').addEventListener('change', (e) => { addDocs(e.target.files); e.target.value = ''; });
    dragZone(drop, addDocs);
    docs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-doc-del]');
      if (btn) { btn.closest('.doc').remove(); markDirty(); updateProgress(); }
    });

    /* ---- Образование: добавить / удалить строку ---- */
    const edu = document.querySelector('[data-edu]');
    document.querySelector('[data-edu-add]').addEventListener('click', () => {
      edu.insertAdjacentHTML('beforeend', `
        <div class="edu__item">
          <label class="f"><span class="f__label">Учебное заведение</span><input class="f__input" placeholder="Название"></label>
          <label class="f"><span class="f__label">Специальность</span><input class="f__input" placeholder="Например, психология"></label>
          <label class="f"><span class="f__label">Год</span><input class="f__input" type="number" placeholder="2020"></label>
          <button type="button" class="icon-btn edu__del" data-edu-del aria-label="Удалить"><svg><use href="#i-trash"/></svg></button>
        </div>`);
      edu.lastElementChild.querySelector('input').focus();
      markDirty();
    });
    edu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-edu-del]');
      if (btn) { btn.closest('.edu__item').remove(); markDirty(); }
    });

    /* ---- Живой предпросмотр карточки ---- */
    const out = (key) => document.querySelector(`[data-pv-out="${key}"]`);
    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

    /** Возраст и правильное окончание: 21 год, 22 года, 25 лет */
    const plural = (n, one, few, many) => {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
      return many;
    };
    const ageFrom = (date) => {
      if (!date) return null;
      const b = new Date(date), now = new Date();
      let age = now.getFullYear() - b.getFullYear();
      if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age -= 1;
      return age > 0 && age < 120 ? age : null;
    };

    const updatePreview = () => {
      out('name').textContent = F('first').value.trim() || 'Ваше имя';
      out('role').textContent = F('role').value.trim() || 'Психолог';
      const parts = [];
      const age = ageFrom(F('birth').value);
      if (age) parts.push(`${age} ${plural(age, 'год', 'года', 'лет')}`);
      const exp = parseInt(F('exp').value, 10);
      if (exp >= 0) parts.push(`опыт ${exp} ${plural(exp, 'год', 'года', 'лет')}`);
      out('meta').textContent = parts.join(' · ');
      out('price').textContent = F('price').value ? `от ${F('price').value} BYN` : '–';
      out('method').textContent = checked('methods').slice(0, 2).join(', ') || '–';
      const topics = checked('topics');
      out('topics').innerHTML = topics.length
        ? topics.slice(0, 4).map((t) => `<span class="tag tag--sm tag--blue">${t}</span>`).join('')
        : '<span class="pv__empty">Отметьте запросы, с которыми работаете</span>';
      if (!photoUrl) miniPhotos.forEach((el) => paintAvatar(el, { name: F('first').value }));
      document.querySelector('[data-bind="me-name"]').textContent = fullName() || 'Без имени';
    };

    /* ---- Заполненность профиля ---- */
    const updateProgress = () => {
      const done = {
        photo: !!photoUrl,
        main: ['first', 'last', 'birth', 'exp', 'price'].every((n) => F(n).value.trim() !== ''),
        about: F('about').value.trim().length >= 80,
        methods: checked('methods').length > 0 && checked('topics').length > 0,
        docs: docs.children.length > 0,
      };
      const values = Object.values(done);
      const percent = Math.round((values.filter(Boolean).length / values.length) * 100);
      document.querySelector('[data-progress-num]').textContent = `${percent}%`;
      document.querySelector('[data-progress-bar]').style.width = `${percent}%`;
      Object.entries(done).forEach(([key, ok]) => document.querySelector(`[data-todo-item="${key}"]`).classList.toggle('is-done', ok));
    };

    form.addEventListener('input', () => { updatePreview(); updateProgress(); });
    form.addEventListener('change', () => { updatePreview(); updateProgress(); });
    updatePreview(); updateProgress();

    /* ---- Сохранение ---- */
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let bad = validateRequired();
      if (!photoUrl) {
        upload.classList.add('is-error');
        photoError.style.display = 'block';
        bad = document.getElementById('photo-panel');
      }
      if (!checked('methods').length || !checked('topics').length) {
        toast('Отметьте хотя бы один метод и запрос', true);
        if (!bad) return;
      }
      if (bad) {
        bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast(!photoUrl ? 'Загрузите фото – оно обязательно' : 'Проверьте выделенные поля', true);
        return;
      }
      // API: PUT /api/psychologists/me  (FormData: поля, фото, документы)
      markSaved();
      toast('Профиль сохранён и отправлен на проверку');
    });
  }
});
