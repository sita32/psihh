// Модульные тесты: проверка и приведение данных из запросов (services/validation.js).
const v = require('../../src/services/validation');
const { HttpError } = require('../../src/errors');

describe('validation: даты', () => {
  test.each([
    ['2026-10-19', true],
    ['2024-02-29', true],   // високосный год
    ['2026-02-29', false],  // такого дня нет
    ['2026-13-01', false],
    ['19.10.2026', false],
    ['', false],
  ])('isIsoDate(%p) → %p', (value, expected) => {
    expect(v.isIsoDate(value)).toBe(expected);
  });

  test('todayIn возвращает дату ГГГГ-ММ-ДД', () => {
    expect(v.todayIn('Europe/Minsk')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('validation: текст и числа', () => {
  test('text обрезает пробелы, не-строку превращает в пустую строку', () => {
    expect(v.text('  Анна  ')).toBe('Анна');
    expect(v.text(42)).toBe('');
    expect(v.text(undefined)).toBe('');
  });

  test('list принимает «a,b» и повтор параметра', () => {
    expect(v.list('cbt, act')).toEqual(['cbt', 'act']);
    expect(v.list(['cbt', 'act,emdr'])).toEqual(['cbt', 'act', 'emdr']);
    expect(v.list(undefined)).toEqual([]);
  });

  test('requiredText: пусто – ошибка поля, не передано – undefined без ошибки', () => {
    const fields = {};
    expect(v.requiredText(undefined, 'name', 64, fields)).toBeUndefined();
    expect(fields).toEqual({});
    expect(v.requiredText('   ', 'name', 64, fields, 'Укажите имя')).toBeUndefined();
    expect(fields.name).toBe('Укажите имя');
  });

  test('requiredText: длиннее максимума – ошибка', () => {
    const fields = {};
    v.requiredText('a'.repeat(65), 'name', 64, fields);
    expect(fields.name).toMatch(/64/);
  });

  test('optionalText: null и пустая строка очищают поле', () => {
    const fields = {};
    expect(v.optionalText(null, 'about', 10, fields)).toBeNull();
    expect(v.optionalText('  ', 'about', 10, fields)).toBeNull();
    expect(v.optionalText(5, 'about', 10, fields)).toBeUndefined();
    expect(fields.about).toBe('Ожидается текст');
  });

  test('intParam: целое в пределах, иначе ошибка поля', () => {
    const fields = {};
    expect(v.intParam('7', 'page', { min: 1, max: 10 }, fields)).toBe(7);
    expect(v.intParam('', 'page', { min: 1, max: 10 }, fields)).toBeUndefined();
    expect(v.intParam('0', 'page', { min: 1, max: 10 }, fields)).toBeUndefined();
    expect(v.intParam('2.5', 'limit', { min: 1, max: 10 }, fields)).toBeUndefined();
    expect(Object.keys(fields)).toEqual(['page', 'limit']);
  });

  test('телефон – то же правило, что CHECK в базе', () => {
    expect(v.PHONE_RE.test('+375291234567')).toBe(true);
    expect(v.PHONE_RE.test('80291234567')).toBe(true);
    expect(v.PHONE_RE.test('+375 29 123')).toBe(false);
  });

  test('throwIfInvalid: одна ошибка 422 со всеми полями сразу', () => {
    expect(() => v.throwIfInvalid({})).not.toThrow();
    try {
      v.throwIfInvalid({ email: 'Проверьте адрес почты', password: 'Короткий' });
      throw new Error('ожидалась ошибка');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(422);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(err.fields)).toEqual(['email', 'password']);
    }
  });
});
