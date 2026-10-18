// Отдать загруженный файл: в браузере открывается (inline) под исходным именем.
// sandbox – даже если в файле окажется что-то исполняемое, на сайте оно не сработает.
function sendStoredFile(res, { path, name, mimeType }) {
  res.sendFile(path, {
    headers: {
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Security-Policy': 'sandbox',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      ...(mimeType && { 'Content-Type': mimeType }),
    },
  });
}

module.exports = { sendStoredFile };
