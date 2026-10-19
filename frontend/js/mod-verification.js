/**
 * «Рядом» – панель модератора: заявки психологов (mod-verification.html).
 * Модератор открывает заявку, смотрит анкету и документы об образовании, отмечает пункты проверки
 * и подтверждает статус специалиста или отклоняет заявку с комментарием.
 * Данные – из API:
 *   GET   /api/admin/verification-requests?status=pending|approved|rejected
 *   GET   /api/admin/documents/:id/file              – скан из хранилища
 *   PATCH /api/admin/verification-requests/:id       { status: 'approved' | 'rejected', comment }
 * Отклонение без комментария запрещено и в базе (CHECK в verification_requests).
 * Попросить другие документы – это отклонение с комментарием: психолог исправит и отправит заявку снова.
 */
const CHECKS = [
  'ФИО в документах совпадает с профилем',
  'Есть высшее психологическое образование',
  'Сканы читаются, печати и подписи на месте',
  'Описание и цена не нарушают правила сервиса',
];

document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, plural, dayLabel, avatar, toast } = UI;
  const $ = (sel) => document.querySelector(sel);
  UI.initModals();

  const lists = { pending: [], approved: [], rejected: [] };
  /** Маленькое фото: у демо-фото психологов есть квадратная версия -sq */
  const thumb = (url) => (url && url.includes('/img/psychologists/') ? url.replace(/(\.\w+)$/, '-sq$1') : url);
  const ava = (p, size) => avatar(p.name, thumb(p.avatarUrl), size);
  const ago = (iso) => {
    const k = UI.daysFrom(iso);
    return k === 0 ? 'сегодня' : k === -1 ? 'вчера' : `${-k} ${plural(-k, 'день', 'дня', 'дней')} назад`;
  };
  const years = (n) => `${n} ${plural(n, 'год', 'года', 'лет')}`;
  const sizeText = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
  const DOC_TYPES = { diploma: 'Диплом', certificate: 'Сертификат', license: 'Лицензия', other: 'Документ' };
  const STATUS = {
    pending: '<span class="st st--wait">На проверке</span>',
    approved: '<span class="st st--ok">Одобрена</span>',
    rejected: '<span class="st st--bad">Отклонена</span>',
  };
  const DOC_STATUS = { approved: ' · подтверждён', rejected: ' · отклонён' };

  let tab = 'pending';
  let current = null;            // открытая заявка
  const checked = new Set();     // отмеченные пункты проверки открытой заявки
  /** Почему кнопка «Подтвердить» неактивна – видно и на телефоне, где нет всплывающей подсказки */
  const hint = () => (checked.size === CHECKS.length ? ''
    : `Отмечено ${checked.size} из ${CHECKS.length} – отметьте все пункты, чтобы подтвердить`);

  /* ---------- Очередь ---------- */
  const renderList = () => {
    Object.keys(lists).forEach((t) => { $(`[data-count="${t}"]`).textContent = lists[t].length; });
    Session.setBadge('mod-verification.html', lists.pending.length);
    const list = lists[tab];
    $('[data-list]').innerHTML = list.length ? list.map((a) => {
      const p = a.psychologist;
      return `<button type="button" class="vr-item${a === current ? ' is-active' : ''}" data-id="${a.id}">
        ${ava(p, 44)}
        <span><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.headline || 'Психолог')} · опыт ${years(p.experienceYears ?? 0)}</small>
          <small>${tab === 'pending' ? `подана ${ago(a.submittedAt)}` : `решение ${ago(a.reviewedAt)}`} · ${a.documents.length} ${plural(a.documents.length, 'документ', 'документа', 'документов')}</small></span>
      </button>`;
    }).join('') : `<div class="empty-box" style="padding:28px 16px"><b>Пусто</b><p>${tab === 'pending' ? 'Новых заявок нет' : 'Здесь пока ничего нет'}</p></div>`;
  };

  /* ---------- Карточка заявки ---------- */
  const renderCard = () => {
    const card = $('[data-card]');
    if (!current) {
      card.innerHTML = `<div class="empty-box"><img src="assets/img/formats/individual.webp" alt=""><b>${tab === 'pending' ? 'Все заявки проверены' : 'Выберите заявку'}</b><p>${tab === 'pending' ? 'Новые заявки появятся здесь, когда психологи их отправят.' : 'Откройте заявку слева, чтобы посмотреть решение.'}</p></div>`;
      return;
    }
    const a = current;
    const p = a.psychologist;
    const ready = checked.size === CHECKS.length;
    const by = a.reviewedBy ? ` · ${escapeHtml(a.reviewedBy.login)}` : '';
    let bottom = '';
    if (a.status === 'pending') {
      bottom = `
        <div class="vr-sec"><h3>Проверка модератора</h3>
          <div class="vr-check">${CHECKS.map((c, i) => `<label><input type="checkbox" data-check="${i}"${checked.has(i) ? ' checked' : ''}>${c}</label>`).join('')}</div>
          <p class="vr-hint" data-hint>${hint()}</p>
        </div>
        <div class="vr-actions">
          <button type="button" class="btn btn--primary" data-act="approve"${ready ? '' : ' disabled title="Сначала отметьте все пункты проверки"'}><svg><use href="#i-shield"/></svg>Подтвердить статус специалиста</button>
          <button type="button" class="btn btn--danger" data-act="reject">Отклонить с&nbsp;комментарием</button>
        </div>`;
    } else {
      bottom = a.status === 'approved'
        ? `<div class="vr-decision vr-decision--ok"><b>Статус подтверждён</b> ${dayLabel(a.reviewedAt)}${by}. Психолог может показать анкету в&nbsp;каталоге.</div>`
        : `<div class="vr-decision vr-decision--bad"><b>Заявка отклонена</b> ${dayLabel(a.reviewedAt)}${by}<br>${escapeHtml(a.comment || '')}</div>`;
    }
    card.innerHTML = `
      <header class="vr-card__head">
        ${ava(p, 56)}
        <div><h2>${escapeHtml([p.name, p.middleName].filter(Boolean).join(' '))}</h2><p>${escapeHtml(p.email)} · заявка подана ${dayLabel(a.submittedAt)}</p></div>
        ${STATUS[a.status]}
      </header>
      <dl class="vr-facts">
        <div><dt>Опыт</dt><dd>${years(p.experienceYears ?? 0)}</dd></div>
        <div><dt>Методы</dt><dd>${escapeHtml(p.methods.join(', ')) || '–'}</dd></div>
        <div><dt>Стоимость</dt><dd>${p.priceFrom === null ? '–' : `от ${p.priceFrom} BYN`}</dd></div>
      </dl>
      <div class="vr-sec"><h3>${escapeHtml(p.headline || 'О себе')}</h3><p>${escapeHtml(p.bio || 'Психолог не рассказал о себе')}</p>
        ${p.approach ? `<p style="margin-top:8px">${escapeHtml(p.approach)}</p>` : ''}</div>
      <div class="vr-sec"><h3>Образование и документы</h3>
        <div class="vr-docs">${a.documents.map((d) => `
          <div class="vr-doc">
            <span class="doc__ic">${escapeHtml((d.fileName.split('.').pop() || 'FILE').slice(0, 4).toUpperCase())}</span>
            <span><b>${escapeHtml([DOC_TYPES[d.type], d.institution].filter(Boolean).join(' · '))}</b>
              <small>${escapeHtml([d.specialty, d.year].filter(Boolean).join(', '))}</small>
              <small>${escapeHtml(d.fileName)} · ${sizeText(d.size)}${DOC_STATUS[d.status] || ''}</small></span>
            <button type="button" class="btn btn--line btn--xs" data-doc="${d.id}"><svg><use href="#i-eye"/></svg>Открыть</button>
          </div>`).join('') || '<p>Документов нет</p>'}</div></div>
      ${bottom}`;
  };

  const select = (a) => { current = a; checked.clear(); renderList(); renderCard(); };

  UI.initTabs($('[data-tabs]'), (t) => { tab = t; select(lists[t][0] || null); });
  $('[data-list]').addEventListener('click', (e) => {
    const b = e.target.closest('.vr-item');
    if (b) select(lists[tab].find((a) => a.id === Number(b.dataset.id)));
  });

  /** Все три очереди с сервера */
  const load = async () => {
    try {
      const res = await Promise.all(Object.keys(lists).map((s) => API.get('/admin/verification-requests', { status: s })));
      res.forEach((r) => { lists[r.status] = r.items; });
    } catch (err) {
      toast(`Не удалось загрузить заявки: ${err.message}`, true);
    }
  };

  /* ---------- Решение по заявке ---------- */
  const decide = async (status, comment = null) => {
    const name = current.psychologist.name;
    try {
      await API.patch(`/admin/verification-requests/${current.id}`, { status, comment });
      toast(status === 'approved' ? `${name}: статус специалиста подтверждён` : 'Заявка отклонена, психолог получит комментарий');
    } catch (err) {
      toast(err.fields ? Object.values(err.fields)[0] : err.message, true);
    }
    await load();                                    // заявка переехала в другую вкладку (или её уже решили)
    select(lists[tab][0] || null);
  };

  $('[data-card]').addEventListener('change', (e) => {
    const box = e.target.closest('[data-check]');
    if (!box) return;
    if (box.checked) checked.add(Number(box.dataset.check)); else checked.delete(Number(box.dataset.check));
    const approve = $('[data-act="approve"]');
    approve.disabled = checked.size !== CHECKS.length;
    approve.title = approve.disabled ? 'Сначала отметьте все пункты проверки' : '';
    $('[data-hint]').textContent = hint();
  });

  /* ---------- Просмотр скана ---------- */
  const openDoc = (d) => {
    const m = document.getElementById('doc-modal');
    const url = API.fileUrl(`/admin/documents/${d.id}/file`);
    m.querySelector('[data-doc-title]').textContent = DOC_TYPES[d.type] || 'Документ';
    m.querySelector('[data-doc-name]').textContent = `${d.fileName} · ${sizeText(d.size)}`;
    m.querySelector('[data-doc-view]').innerHTML = d.mimeType === 'application/pdf'
      ? `<iframe src="${escapeHtml(url)}" title="${escapeHtml(d.fileName)}"></iframe>`
      : `<img src="${escapeHtml(url)}" alt="${escapeHtml(d.fileName)}">`;
    m.querySelector('[data-doc-open]').href = url;
    m.showModal();
  };

  $('[data-card]').addEventListener('click', async (e) => {
    const doc = e.target.closest('[data-doc]');
    if (doc) {
      openDoc(current.documents.find((d) => d.id === Number(doc.dataset.doc)));
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.act === 'approve') decide('approved');
    if (btn.dataset.act === 'reject') {
      const comment = await UI.askReason({
        title: 'Отклонить заявку?',
        text: 'Комментарий увидит психолог – объясните, что не так и что исправить. После исправления он отправит заявку снова.',
        confirm: 'Отклонить', danger: true,
        presets: ['Нет высшего психологического образования', 'Документы не читаются – загрузите скан заново', 'ФИО в документах не совпадает', 'Загрузите скан диплома целиком'],
      });
      if (comment) decide('rejected', comment);
    }
  });

  (async () => {
    await load();
    select(lists.pending[0] || null);
  })();
});
