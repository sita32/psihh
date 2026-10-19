/**
 * «Рядом» – обращение к серверу (REST API на Node.js). Страницы получают и меняют данные
 * только через API.get / post / patch / put / del / upload.
 *
 * Вход хранится в httpOnly-cookie; когда access-токен истёк (401 TOKEN_EXPIRED),
 * сессия один раз обновляется через /api/auth/refresh, и запрос повторяется.
 * Ошибка – исключение API.Error: { status, code, message, fields } (fields – ошибки по полям формы).
 */
const API = (() => {
  const TIMEOUT_MS = 15000;

  class ApiError extends Error {
    constructor(status, { code, message, fields } = {}) {
      super(message || 'Что-то пошло не так. Попробуйте ещё раз');
      this.name = 'ApiError';
      this.status = status;
      this.code = code || 'ERROR';
      this.fields = fields || null;
    }
  }

  /** Строка запроса из объекта: пустые значения пропускаются, массивы – через запятую */
  const toQuery = (query) => {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      const v = Array.isArray(value) ? value.join(',') : value;
      if (v !== undefined && v !== null && v !== '') params.set(key, v);
    });
    const s = params.toString();
    return s ? `?${s}` : '';
  };

  /** Один запрос к серверу: { res, json } или { offline: true } */
  async function send(method, path, body, isForm) {
    const init = { method, headers: {}, credentials: 'same-origin', signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (body !== undefined) {
      if (isForm) init.body = body;
      else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    }
    let res;
    try {
      res = await fetch(`api${path}`, init);
    } catch {
      return { offline: true };
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    return { res, json: isJson ? await res.json().catch(() => null) : null };
  }

  // Обновление сессии – одно на все одновременные запросы
  let refreshing = null;
  const refresh = () => {
    refreshing ??= send('POST', '/auth/refresh').finally(() => { refreshing = null; });
    return refreshing;
  };

  async function request(method, path, { body, form, query } = {}) {
    const url = path + toQuery(query);
    const payload = form ?? body;

    let r = await send(method, url, payload, Boolean(form));
    if (r.offline) {
      throw new ApiError(0, { code: 'OFFLINE', message: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз' });
    }
    if (r.res.status === 204) return null;
    // Ответ не JSON – сервер API не запущен (сайт открыт без Docker) или nginx не достучался до него
    if (!r.json) {
      throw new ApiError(r.res.status, { code: 'SERVER_DOWN', message: 'Сервер не отвечает. Попробуйте ещё раз через минуту' });
    }

    if (r.res.status === 401 && r.json.error && r.json.error.code === 'TOKEN_EXPIRED') {
      const ok = await refresh();
      if (ok.res && ok.res.ok) r = await send(method, url, payload, Boolean(form));
    }
    if (r.res.status === 204) return null;
    if (!r.res.ok) throw new ApiError(r.res.status, (r.json && r.json.error) || {});
    return r.json;
  }

  return {
    Error: ApiError,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    del: (path) => request('DELETE', path),
    /** Загрузка файла: fields – остальные поля формы */
    upload: (path, file, fields = {}) => {
      const form = new FormData();
      form.append('file', file);
      Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, v); });
      return request('POST', path, { form });
    },
    /** Адрес файла (скан, вложение) для ссылки или <img> */
    fileUrl: (path) => `api${path}`,
  };
})();
