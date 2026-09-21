"""Tiny static server for local development.

Python's stock http.server lets the browser cache aggressively, which made
edited game files silently keep serving their old contents during testing.
This sends no-store on everything so a reload always fetches fresh code.

    python devserver.py [port]
"""
import base64
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "preview")


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        """POST /__shot/<name> with a base64 PNG body -> assets/preview/<name>.png

        Screenshots are written straight to disk so a headless check never has
        to funnel image data back through the caller.
        """
        if not self.path.startswith("/__shot/"):
            self.send_error(404)
            return
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", self.path[len("/__shot/"):]) or "shot"
        if not name.endswith(".png"):
            name += ".png"

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("ascii", "ignore")
        body = body.split(",", 1)[-1]  # tolerate a full data: URL

        os.makedirs(SHOT_DIR, exist_ok=True)
        path = os.path.join(SHOT_DIR, name)
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(body))

        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(path.encode("utf-8"))

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
