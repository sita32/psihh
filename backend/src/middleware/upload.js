// Приём одного файла из multipart/form-data (поле file) в память – дальше его проверяет сервис.
// Ограничение размера – на каждый маршрут своё; превышение – 413, а не ошибка сервера.
const multer = require('multer');
const { HttpError } = require('../errors');

function uploadFile(maxMb) {
  const handler = multer({
    storage: multer.memoryStorage(),
    defParamCharset: 'utf8', // имена файлов по-русски («Диплом БГУ.pdf»), а не в latin1
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 20 },
  }).single('file');

  return (req, res, next) => handler(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `Файл больше ${maxMb} МБ`, { fields: { file: `До ${maxMb} МБ` } }));
    if (err instanceof multer.MulterError) return next(new HttpError(400, 'Не удалось принять файл', { fields: { file: err.message } }));
    return next(err);
  });
}

module.exports = { uploadFile };
