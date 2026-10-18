/**
 * «Рядом» – личный кабинет (клиент и психолог).
 * Клиент: профиль – GET/PATCH /api/profile (имя, телефон, дата рождения, «о себе», готовый аватар),
 * удаление аккаунта – DELETE /api/profile. Темы запроса и часовой пояс в базе не хранятся –
 * они запоминаются в этом браузере.
 * Психолог: анкета – GET/PATCH /api/profile (данные, методы, темы, услуги с ценами, публикация),
 * фото – /api/profile/avatar, документы и заявка на проверку – /api/profile/documents и /verification.
 * Фото и документы сохраняются сразу, остальное – кнопкой «Сохранить».
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
  // Фото, документы и тумблер каталога (data-instant) сохраняются сразу – их не считаем
  const markDirty = (e) => { if (!e?.target?.closest?.('[data-instant]')) savebar.classList.add('is-shown'); };
  const markSaved = () => savebar.classList.remove('is-shown');
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  /** Удаление аккаунта / профиля (подтверждение в диалоге) */
  const deleteModal = document.getElementById('delete-modal');
  deleteModal.addEventListener('close', async () => {
    if (deleteModal.returnValue !== 'delete') return;
    try {
      await API.del('/profile');
    } catch (err) {
      toast(err.message, true);
      return;
    }
    toast(role === 'client' ? 'Аккаунт удалён' : 'Профиль удалён');
    // Клиент выходит совсем; у психолога остаётся аккаунт – анкету можно заполнить заново
    setTimeout(() => { if (role === 'client') Session.logout(); else location.reload(); }, 1400);
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
    const F = (n) => form.elements.namedItem(n);
    const nameInput = F('name');
    const modal = document.getElementById('avatar-modal');
    const PREFS_KEY = 'ryadom-client-prefs';           // темы запроса и часовой пояс – только в браузере
    const PRESET_RE = /assets\/img\/avatars\/(a\d\d)\.webp$/;
    const SERVER_FIELDS = { firstName: 'name', birthDate: 'birth' };   // поле API → поле формы
    let avatar = 'none';                               // выбранный аватар: 'a01'…'a12' или 'none' – без фото

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

    /** Темы и часовой пояс – из браузера */
    const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } };
    const savePrefs = () => {
      const prefs = { tz: F('tz').value, topics: [...form.querySelectorAll('[name="topics"]:checked')].map((i) => i.value) };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* приватный режим – не страшно */ }
    };

    /** Профиль с сервера → форма */
    const fill = (profile, user) => {
      nameInput.value = profile.firstName || '';
      F('email').value = user.email;
      F('phone').value = profile.phone || '';
      F('birth').value = profile.birthDate || '';
      F('about').value = profile.about || '';
      const m = PRESET_RE.exec(profile.avatarUrl || '');
      avatar = m ? m[1] : 'none';
      const prefs = loadPrefs();
      if (prefs.tz) F('tz').value = prefs.tz;
      if (prefs.topics) form.querySelectorAll('[name="topics"]').forEach((i) => { i.checked = prefs.topics.includes(i.value); });
      F('about').dispatchEvent(new Event('input'));    // обновить счётчик символов
      render();
      markSaved();
    };

    // Почту меняет только служба поддержки – поле только для чтения
    F('email').readOnly = true;
    F('email').title = 'Почту можно сменить через службу поддержки';

    (async () => {
      try {
        const [user, { profile }] = await Promise.all([Session.user(), API.get('/profile')]);
        if (profile && user) fill(profile, user);
      } catch (err) {
        toast(`Не удалось загрузить профиль: ${err.message}`, true);
      }
    })();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bad = validateRequired();
      if (bad) { bad.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Проверьте выделенные поля', true); return; }
      savePrefs();
      try {
        const { profile } = await API.patch('/profile', {
          firstName: nameInput.value.trim(),
          phone: F('phone').value.trim() || null,
          birthDate: F('birth').value || null,
          about: F('about').value.trim() || null,
          avatar: avatar === 'none' ? null : avatar,
        });
        markSaved();
        toast('Изменения сохранены');
        // Имя и фото в шапке – как на сервере
        document.querySelectorAll('.cab-top .me .me__name').forEach((el) => { el.textContent = profile.firstName; });
      } catch (err) {
        // Ошибки по полям – подсветить поле, текст – во всплывающем сообщении
        Object.keys(err.fields || {}).forEach((f) => form.querySelector(`[name="${SERVER_FIELDS[f] || f}"]`)?.closest('.f')?.classList.add('is-error'));
        toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
      }
    });
  }


  /* ------------------------------------------------------------------
     Кабинет психолога: анкета, фото, документы и заявка на проверку
     ------------------------------------------------------------------ */
  if (role === 'psychologist') {
    const F = (n) => form.elements.namedItem(n);   // через elements – у формы есть свои свойства role, name и т.п.
    const upload = document.querySelector('[data-upload]');
    const photoInput = upload.querySelector('input');
    const photoActions = document.querySelector('[data-photo-actions]');
    const photoError = document.querySelector('[data-photo-error]');
    const miniPhotos = document.querySelectorAll('[data-photo-mini], [data-pv-photo]');
    const statusEl = document.querySelector('[data-status]');
    const verifyBtn = statusEl.querySelector('[data-verify]');
    const publish = statusEl.querySelector('[data-publish]');
    const docsEl = document.querySelector('[data-docs]');
    const drop = document.querySelector('[data-drop]');
    const docModal = document.getElementById('doc-modal');
    const MAX_PHOTO = 5 * 1024 * 1024;
    const MAX_DOC = 20 * 1024 * 1024;
    // Поле API → поле формы (для подсветки ошибок сервера)
    const SERVER_FIELDS = { firstName: 'first', lastName: 'last', birthDate: 'birth', practiceSince: 'exp', headline: 'role', bio: 'about' };

    let refs = { methods: [], topics: [], formats: [] };
    let profile = null;        // анкета с сервера; null – ещё не создана или удалена
    let documents = [];
    let requests = [];
    let photoUrl = null;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = (n) => String(n).padStart(2, '0');
    const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fullName = () => `${F('first').value} ${F('last').value}`.trim();
    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    const nameOf = (list, code) => (list.find((x) => x.code === code) || {}).name || code;
    const sizeText = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);

    /** Сервер хранит дату начала практики, в форме – полные годы опыта.
        Дату пересчитываем, только если опыт исправили (на день раньше – чтобы лет вышло ровно столько). */
    const sinceFromExp = (years) => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - years);
      d.setDate(d.getDate() - 1);
      return isoDate(d);
    };

    /* ---- Варианты методов, тем и форматов – из справочников ---- */
    const renderRefs = () => {
      const chips = (name, list) => list.map((x) => `<label class="chip-opt"><input type="checkbox" name="${name}" value="${esc(x.code)}"><span>${esc(x.name)}</span></label>`).join('');
      document.querySelector('[data-ref="methods"]').innerHTML = chips('methods', refs.methods);
      document.querySelector('[data-ref="topics"]').innerHTML = chips('topics', refs.topics);
      document.querySelector('[data-services]').innerHTML = refs.formats.map((f) => `
        <div class="svc__row" data-svc="${esc(f.code)}">
          <label class="chip-opt"><input type="checkbox" name="formats" value="${esc(f.code)}"><span>${esc(f.name)}</span></label>
          <label class="f__suffix svc__price"><input class="f__input" type="number" name="price-${esc(f.code)}" min="1" max="10000" step="1" placeholder="–" disabled aria-label="Цена: ${esc(f.name)}"><span>BYN</span></label>
        </div>`).join('');
    };
    // Формат отмечен – можно ввести цену
    const syncPrices = () => document.querySelectorAll('[data-svc]').forEach((row) => {
      row.querySelector('.svc__price input').disabled = !row.querySelector('.chip-opt input').checked;
    });
    document.querySelector('[data-services]').addEventListener('change', (e) => {
      if (e.target.name !== 'formats') return;
      syncPrices();
      const row = e.target.closest('[data-svc]');
      row.classList.remove('is-error');
      if (e.target.checked) row.querySelector('.svc__price input').focus();
    });

    /* ---- Фото: сохраняется сразу (POST /api/profile/avatar) ---- */
    const setPhoto = (url) => {
      photoUrl = url;
      upload.classList.toggle('has-photo', !!url);
      upload.querySelector('img')?.remove();
      if (url) upload.insertAdjacentHTML('beforeend', `<img src="${esc(url)}" alt="Ваше фото">`);
      photoActions.hidden = !url;
      upload.classList.remove('is-error');
      photoError.style.display = 'none';
      miniPhotos.forEach((el) => paintAvatar(el, { src: url, name: F('first').value }));
      updateProgress();
    };

    const needProfile = () => {
      if (profile) return true;
      toast('Сначала заполните основную информацию и сохраните анкету', true);
      return false;
    };

    const sendPhoto = async (file) => {
      if (!file || !needProfile()) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Нужен файл JPG, PNG или WEBP', true); return; }
      if (file.size > MAX_PHOTO) { toast('Фото больше 5 МБ – выберите поменьше', true); return; }
      try {
        const r = await API.upload('/profile/avatar', file);
        profile = r.profile;
        setPhoto(profile.avatarUrl);
        toast('Фото сохранено');
      } catch (err) {
        toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
      }
    };

    photoInput.addEventListener('change', () => { sendPhoto(photoInput.files[0]); photoInput.value = ''; });
    document.querySelector('[data-photo-replace]').addEventListener('change', (e) => { sendPhoto(e.target.files[0]); e.target.value = ''; });
    document.querySelector('[data-photo-remove]').addEventListener('click', async () => {
      try {
        profile = (await API.del('/profile/avatar')).profile;
        setPhoto(null);
        toast('Фото удалено');
      } catch (err) { toast(err.message, true); }
    });

    // Перетаскивание файла мышью на зону загрузки
    const dragZone = (zone, onFile) => {
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-drag'); }));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('is-drag')));
      zone.addEventListener('drop', (e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); });
    };
    dragZone(upload, sendPhoto);

    /* ---- Документы об образовании: сохраняются сразу ---- */
    const DOC_TYPES = { diploma: 'Диплом', certificate: 'Сертификат', license: 'Лицензия', other: 'Документ' };
    const docStatus = (d) => {
      if (d.status === 'approved') return ['ok', 'Подтверждён'];
      if (d.status === 'rejected') return ['bad', 'Отклонён'];
      // Новый документ уходит модератору вместе с заявкой
      const st = profile && profile.verificationStatus;
      if (st === 'pending') return ['wait', 'На&nbsp;проверке'];
      return st === 'verified' ? ['wait', 'Не&nbsp;проверялся'] : ['wait', 'Ждёт отправки'];
    };

    const renderDocs = () => {
      docsEl.innerHTML = documents.map((d) => {
        const ext = (d.fileName.split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
        const meta = [DOC_TYPES[d.type], d.institution, d.specialty, d.year, d.size && sizeText(d.size)].filter(Boolean).join(' · ');
        const [cls, label] = docStatus(d);
        return `
          <div class="doc" data-id="${d.id}">
            <span class="doc__ic">${esc(ext)}</span>
            <span class="doc__name">
              <a href="${esc(API.fileUrl(`/profile/documents/${d.id}/file`))}" target="_blank" rel="noopener"><b>${esc(d.fileName)}</b></a>
              <small>${esc(meta)}</small>
              ${d.status === 'rejected' && d.comment ? `<span class="doc__note">${esc(d.comment)}</span>` : ''}
            </span>
            <span class="doc-status doc-status--${cls}">${label}</span>
            ${d.status === 'approved' ? '' : '<button type="button" class="icon-btn" data-doc-del aria-label="Удалить файл"><svg><use href="#i-trash"/></svg></button>'}
          </div>`;
      }).join('');
      updateProgress();
    };

    // Файл выбран – спрашиваем, что это за документ, и загружаем
    let pendingFile = null;
    const docForm = docModal.querySelector('form');
    const D = (n) => docForm.elements.namedItem(n);
    D('year').max = new Date().getFullYear();

    const askDoc = (file) => {
      if (!file || !needProfile()) return;
      if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) { toast('Подходят PDF, JPG, PNG или WEBP', true); return; }
      if (file.size > MAX_DOC) { toast(`«${file.name}» больше 20 МБ`, true); return; }
      pendingFile = file;
      docForm.reset();
      docForm.querySelectorAll('.f').forEach((f) => f.classList.remove('is-error'));
      docModal.querySelector('[data-doc-file]').textContent = `${file.name} · ${sizeText(file.size)}`;
      docModal.querySelector('[data-doc-req]').hidden = false;
      docModal.showModal();
    };
    drop.querySelector('input').addEventListener('change', (e) => { askDoc(e.target.files[0]); e.target.value = ''; });
    dragZone(drop, askDoc);

    // Кто выдал – обязательно только для диплома
    docForm.addEventListener('change', () => { docModal.querySelector('[data-doc-req]').hidden = D('type').value !== 'diploma'; });
    docForm.addEventListener('input', (e) => e.target.closest('.f')?.classList.remove('is-error'));
    // «Загрузить»: проверить поля, закрыть диалог и отправить файл («Отмена» закрывает диалог сама)
    docForm.addEventListener('submit', async (e) => {
      if (e.submitter?.value !== 'ok') return;
      e.preventDefault();
      const year = D('year').value;
      const badInst = D('type').value === 'diploma' && !D('institution').value.trim();
      const badYear = year && (year < 1950 || year > new Date().getFullYear());
      D('institution').closest('.f').classList.toggle('is-error', badInst);
      D('year').closest('.f').classList.toggle('is-error', !!badYear);
      if (badInst || badYear) return;
      const file = pendingFile;
      pendingFile = null;
      docModal.close();
      try {
        const doc = await API.upload('/profile/documents', file, {
          type: D('type').value, institution: D('institution').value.trim(),
          specialty: D('specialty').value.trim(), year,
        });
        documents.push(doc);
        renderDocs();
        toast('Документ загружен');
      } catch (err) {
        toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
      }
    });

    docsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-doc-del]');
      if (!btn) return;
      const id = Number(btn.closest('.doc').dataset.id);
      try {
        await API.del(`/profile/documents/${id}`);
        documents = documents.filter((d) => d.id !== id);
        renderDocs();
        toast('Документ удалён');
      } catch (err) { toast(err.message, true); }
    });

    /* ---- Статус проверки и публикация в каталоге ---- */
    const renderStatus = () => {
      const st = profile ? profile.verificationStatus : 'none';
      const lastComment = requests[0] && requests[0].comment;
      const view = {
        none: ['', 'Анкета не заполнена', 'Заполните основную информацию и сохраните – после этого можно загрузить фото и документы.'],
        draft: ['', 'Анкета ещё не на проверке', 'Заполните анкету, загрузите фото и диплом и отправьте на проверку – после неё профиль появится в каталоге.'],
        pending: ['', 'Профиль на проверке', 'Модератор проверит документы об образовании – обычно до 3 рабочих дней. После этого профиль можно показать в каталоге.'],
        verified: ['ok', 'Профиль проверен', profile && profile.isPublished ? 'Анкета видна клиентам в каталоге.' : 'Анкета скрыта из каталога – клиенты её не видят и не могут записаться.'],
        rejected: ['bad', 'Заявка отклонена', `${lastComment ? `Модератор: «${lastComment}». ` : ''}Исправьте анкету или документы и отправьте снова.`],
      }[st];
      statusEl.hidden = false;
      statusEl.className = `status${view[0] ? ` status--${view[0]}` : ''}`;
      statusEl.querySelector('[data-status-title]').textContent = view[1];
      statusEl.querySelector('[data-status-text]').textContent = view[2];
      verifyBtn.hidden = !['draft', 'rejected'].includes(st);
      verifyBtn.textContent = st === 'rejected' ? 'Отправить снова' : 'Отправить на проверку';
      publish.hidden = st !== 'verified';
      publish.querySelector('input').checked = !!(profile && profile.isPublished);
    };

    publish.querySelector('input').addEventListener('change', async (e) => {
      try {
        profile = (await API.patch('/profile', { isPublished: e.target.checked })).profile;
        toast(profile.isPublished ? 'Анкета показана в каталоге' : 'Анкета скрыта из каталога');
      } catch (err) {
        toast(err.message, true);
      }
      renderStatus();
    });

    verifyBtn.addEventListener('click', async () => {
      if (savebar.classList.contains('is-shown')) { toast('Сначала сохраните изменения', true); return; }
      if (!photoUrl) {
        upload.classList.add('is-error');
        photoError.style.display = 'block';
        document.getElementById('photo-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Загрузите фото – оно обязательно', true);
        return;
      }
      try {
        const r = await API.post('/profile/verification');
        documents = r.documents;
        requests = r.requests;
        profile.verificationStatus = r.status;
        profile.isPublished = false;
        renderStatus(); renderDocs();
        toast('Анкета отправлена на проверку');
      } catch (err) {
        // Чего не хватает – подсветить поле и сказать первым сообщением
        Object.keys(err.fields || {}).forEach((f) => F(SERVER_FIELDS[f] || '')?.closest('.f')?.classList.add('is-error'));
        toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
      }
    });

    /* ---- Живой предпросмотр карточки ---- */
    const out = (key) => document.querySelector(`[data-pv-out="${key}"]`);

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
    const prices = () => checked('formats').map((code) => Number(F(`price-${code}`).value)).filter((n) => n > 0);

    const updatePreview = () => {
      out('name').textContent = F('first').value.trim() || 'Ваше имя';
      out('role').textContent = F('role').value.trim() || 'Психолог';
      const parts = [];
      const age = ageFrom(F('birth').value);
      if (age) parts.push(`${age} ${plural(age, 'год', 'года', 'лет')}`);
      const exp = parseInt(F('exp').value, 10);
      if (exp >= 0) parts.push(`опыт ${exp} ${plural(exp, 'год', 'года', 'лет')}`);
      out('meta').textContent = parts.join(' · ');
      out('price').textContent = prices().length ? `от ${Math.min(...prices())} BYN` : '–';
      out('method').textContent = checked('methods').slice(0, 2).map((c) => nameOf(refs.methods, c)).join(', ') || '–';
      const topics = checked('topics');
      out('topics').innerHTML = topics.length
        ? topics.slice(0, 4).map((c) => `<span class="tag tag--sm tag--blue">${esc(nameOf(refs.topics, c))}</span>`).join('')
        : '<span class="pv__empty">Отметьте запросы, с которыми работаете</span>';
      if (!photoUrl) miniPhotos.forEach((el) => paintAvatar(el, { name: F('first').value }));
      document.querySelector('[data-bind="me-name"]').textContent = fullName() || 'Без имени';
    };

    /* ---- Заполненность профиля ---- */
    const updateProgress = () => {
      const done = {
        photo: !!photoUrl,
        main: ['first', 'last', 'birth', 'exp'].every((n) => F(n).value.trim() !== ''),
        about: F('about').value.trim().length >= 80,
        methods: checked('methods').length > 0 && checked('topics').length > 0 && prices().length > 0,
        docs: documents.some((d) => d.status !== 'rejected'),
      };
      const values = Object.values(done);
      const percent = Math.round((values.filter(Boolean).length / values.length) * 100);
      document.querySelector('[data-progress-num]').textContent = `${percent}%`;
      document.querySelector('[data-progress-bar]').style.width = `${percent}%`;
      Object.entries(done).forEach(([key, ok]) => document.querySelector(`[data-todo-item="${key}"]`).classList.toggle('is-done', ok));
    };

    form.addEventListener('input', () => { updatePreview(); updateProgress(); });
    form.addEventListener('change', () => { updatePreview(); updateProgress(); });

    /* ---- Анкета с сервера → форма ---- */
    const fill = (p, user) => {
      F('first').value = (p ? p.firstName : user && user.firstName) || '';
      F('last').value = (p ? p.lastName : user && user.lastName) || '';
      const gender = form.querySelector(`[name="gender"][value="${p && p.gender}"]`);
      if (gender) gender.checked = true;
      F('birth').value = (p && p.birthDate) || '';
      F('exp').value = p && p.experienceYears !== null ? p.experienceYears : '';
      F('role').value = (p && p.headline) || '';
      F('about').value = (p && p.bio) || '';
      F('approach').value = (p && p.approach) || '';
      const codes = (list) => (p ? p[list].map((x) => x.code) : []);
      form.querySelectorAll('[name="methods"]').forEach((i) => { i.checked = codes('methods').includes(i.value); });
      form.querySelectorAll('[name="topics"]').forEach((i) => { i.checked = codes('topics').includes(i.value); });
      document.querySelectorAll('[data-svc]').forEach((row) => {
        const svc = p && p.services.find((x) => x.code === row.dataset.svc);
        row.querySelector('.chip-opt input').checked = !!svc;
        row.querySelector('.svc__price input').value = svc ? svc.price : '';
        row.classList.remove('is-error');
      });
      syncPrices();
      ['about', 'approach'].forEach((n) => F(n).dispatchEvent(new Event('input')));   // счётчики символов
      setPhoto(p && p.avatarUrl);
      renderStatus(); renderDocs(); updatePreview(); updateProgress();
      markSaved();
    };

    (async () => {
      try {
        const [user, references, own] = await Promise.all([Session.user(), API.get('/references'), API.get('/profile')]);
        refs = references;
        renderRefs();
        profile = own.profile;
        if (profile) ({ documents, requests } = await API.get('/profile/verification'));
        fill(profile, user);
      } catch (err) {
        toast(`Не удалось загрузить профиль: ${err.message}`, true);
      }
    })();

    /* ---- Сохранение: PATCH /api/profile ---- */
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let bad = validateRequired();
      // Отмеченный формат без цены
      document.querySelectorAll('[data-svc]').forEach((row) => {
        const on = row.querySelector('.chip-opt input').checked;
        const price = Number(row.querySelector('.svc__price input').value);
        const wrong = on && !(price > 0 && price <= 10000);
        row.classList.toggle('is-error', wrong);
        if (wrong && !bad) bad = row;
      });
      if (bad) {
        bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Проверьте выделенные поля', true);
        return;
      }
      const services = checked('formats').map((code) => ({
        format: code, price: Number(F(`price-${code}`).value),
        durationMin: (profile && (profile.services.find((x) => x.code === code) || {}).durationMin) || 50,
      }));
      const exp = parseInt(F('exp').value, 10);
      const body = {
        firstName: F('first').value.trim(),
        lastName: F('last').value.trim(),
        gender: checked('gender')[0],
        birthDate: F('birth').value || null,
        headline: F('role').value.trim() || null,
        bio: F('about').value.trim() || null,
        approach: F('approach').value.trim() || null,
        methods: checked('methods'),
        topics: checked('topics'),
        services,
      };
      if (!profile || exp !== profile.experienceYears) body.practiceSince = sinceFromExp(exp);
      try {
        profile = (await API.patch('/profile', body)).profile;
        if (!documents.length && !requests.length) ({ documents, requests } = await API.get('/profile/verification'));
        fill(profile);
        toast('Изменения сохранены');
      } catch (err) {
        Object.keys(err.fields || {}).forEach((f) => F(SERVER_FIELDS[f] || f)?.closest?.('.f')?.classList.add('is-error'));
        toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
      }
    });
  }
});
