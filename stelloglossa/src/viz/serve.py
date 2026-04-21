"""在 localhost:8765 啟動靜態檔伺服器,讓瀏覽器開 index.html。

用法:
    python -m src.viz.serve
    # 然後開 http://localhost:8765/
"""
from __future__ import annotations

import argparse
import http.server
import json
import logging
import socketserver
import threading
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PUBLIC_ROOT = Path(__file__).parent / "public"
OUTPUT_ROOT = Path(__file__).resolve().parent.parent.parent / "output"


class MountedHandler(http.server.SimpleHTTPRequestHandler):
    """Serve /audio/* from output/audio, /translate from the Python translator,
    everything else from public/.

    Also sends Cache-Control: no-cache on .js/.json so ES-module hot reload
    works across edits without needing browser hard-refresh.
    """

    def translate_path(self, path: str) -> str:  # type: ignore[override]
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/audio/"):
            rel = clean[len("/audio/"):]
            return str(OUTPUT_ROOT / "audio" / rel)
        self.directory = str(PUBLIC_ROOT)
        return super().translate_path(path)

    def end_headers(self):  # noqa: N802
        path = self.path.split("?", 1)[0].lower()
        if path.endswith((".js", ".mjs", ".json", ".html")):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/translate"):
            return self._handle_translate()
        return super().do_GET()

    def _handle_translate(self):
        try:
            qs = parse_qs(urlparse(self.path).query)
            jname = (qs.get("jname", [""]) or [""])[0]
            text = (qs.get("text", [""]) or [""])[0]
            from src.api.translator import translate
            result = translate(jname, text)
        except Exception as exc:  # noqa: BLE001
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8"))
            return
        payload = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve(port: int = 8765) -> None:
    with ThreadedServer(("127.0.0.1", port), MountedHandler) as httpd:
        print(f"STELLOGLOSSA UI: http://localhost:{port}/")
        print(f"  public: {PUBLIC_ROOT}")
        print(f"  /audio/ → {OUTPUT_ROOT / 'audio'}")
        httpd.serve_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    serve(parser.parse_args().port)
