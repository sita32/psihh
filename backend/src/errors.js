// Ошибка с HTTP-статусом. Сервисы бросают её, обработчик ошибок превращает в JSON-ответ.
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code || HttpError.codes[status] || 'ERROR';
  }
}

HttpError.codes = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'TOO_MANY_REQUESTS',
};

module.exports = { HttpError };
