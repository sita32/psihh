"""
Локальный сервер для просмотра фронтенда «Рядом» во время разработки.
Отличие от `python3 -m http.server`: запрещает браузеру кэшировать файлы,
чтобы после правки CSS/JS сразу открывалась новая версия.

Запуск из корня проекта:  python3 tools/dev-server.py [порт]
"""
import functools
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


handler = functools.partial(NoCacheHandler, directory=ROOT)
with http.server.ThreadingHTTPServer(('localhost', PORT), handler) as server:
    print(f'«Рядом»: http://localhost:{PORT}')
    server.serve_forever()
