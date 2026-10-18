// Хранилище файлов на диске: документы психологов, аватары, вложения чата.
// В БД хранится только ключ файла (documents.file_key, avatar_key, messages.attachment_key).
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');

const ROOT = path.resolve(config.uploads.dir);
// Ключи demo/… – документы и вложения из database/demo.sql: файла нет, отдаём образец по расширению
const DEMO_DIR = path.join(__dirname, '..', '..', 'demo-files');

// Тип файла по первым байтам, а не по имени: переименованный .exe за картинку не сойдёт
const SIGNATURES = [
  { mime: 'application/pdf', ext: '.pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: '.webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

function detectType(buffer) {
  return SIGNATURES.find((s) => buffer.length > 12 && s.test(buffer)) || null;
}

// Имя файла для вложения: без путей и служебных символов
function safeName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return base.slice(-120) || 'file';
}

// Сохранить файл в папку folder; keepName – сохранить исходное имя (вложения чата)
async function save(folder, buffer, ext, keepName = null) {
  const id = crypto.randomUUID();
  const key = keepName ? `${folder}/${id}/${safeName(keepName)}` : `${folder}/${id}${ext}`;
  const file = path.join(ROOT, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer, { flag: 'wx' });
  return key;
}

// Путь к файлу по ключу; ключ из БД, но всё равно не даём выйти за пределы хранилища
function resolve(key) {
  if (key.startsWith('demo/')) return path.join(DEMO_DIR, `sample${path.extname(key).toLowerCase() || '.pdf'}`);
  const file = path.resolve(ROOT, key);
  if (!file.startsWith(ROOT + path.sep)) throw new Error(`Недопустимый ключ файла: ${key}`);
  return file;
}

async function exists(key) {
  try {
    await fs.access(resolve(key));
    return true;
  } catch {
    return false;
  }
}

// Удалить файл (демо-образцы не трогаем); пустую папку вложения – тоже
async function remove(key) {
  if (!key || key.startsWith('demo/')) return;
  const file = resolve(key);
  await fs.rm(file, { force: true });
  if (key.split('/').length > 2) await fs.rmdir(path.dirname(file)).catch(() => {});
}

module.exports = { detectType, safeName, save, resolve, exists, remove };
