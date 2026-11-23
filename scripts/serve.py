#!/usr/bin/env python3
"""Local PWA preview server. The real data features require configured Supabase and Worker."""
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'web'
class Server(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        path = self.path.split('?',1)[0]
        if path in ('/activate','/recover'):
            self.path='/index.html'
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

print('Preview: http://localhost:8765 (setup will be shown until services are connected)')
http.server.ThreadingHTTPServer(('127.0.0.1',8765),Server).serve_forever()
