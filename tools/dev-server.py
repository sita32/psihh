"""
Локальный сервер для просмотра фронтенда «Рядом» во время разработки.
Отличие от `python3 -m http.server`: запрещает браузеру кэшировать файлы,
чтобы после правки CSS/JS сразу открывалась новая версия.

Запуск из корня проекта:  python3 tools/dev-server.py [порт]
"""
import functools
import http.server
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        # Вместо стандартной страницы ошибки – своя 404.html (на сервере то же сделает nginx: error_page 404)
        page = os.path.join(ROOT, '404.html')
        if code != 404 or not os.path.exists(page):
            return super().send_error(code, message, explain)
        with open(page, encoding='utf-8') as f:
            html = f.read()
        # В 404.html пути относительные; для любого адреса (/a/b/c) делаем их от корня сайта
        html = re.sub(r'(href|src)="(?!https?:|mailto:|tel:|#|/)', r'\1="/', html)
        body = html.encode('utf-8')
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)


handler = functools.partial(NoCacheHandler, directory=ROOT)
with http.server.ThreadingHTTPServer(('localhost', PORT), handler) as server:
    print(f'«Рядом»: http://localhost:{PORT}')
    server.serve_forever()
