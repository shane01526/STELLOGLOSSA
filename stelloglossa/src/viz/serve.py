"""啟動靜態檔 + /translate REST 伺服器。

本地開發:
    python -m src.viz.serve                    # http://localhost:8765/
    python -m src.viz.serve --port 9000        # 自訂 port

雲端部署 (Render / Fly / Railway):
    export PORT=10000
    python -m src.viz.serve                    # 綁 0.0.0.0:10000
    # 或 python -m src.viz.serve --host 0.0.0.0 --port $PORT

行為:
  - 若偵測到 PORT 環境變數,自動使用它 + 綁 0.0.0.0（雲端模式）
  - 否則綁 127.0.0.1:8765（本地模式）
  - --host 或 --port 旗標明示時一律優先
"""
from __future__ import annotations

import argparse
import http.server
import json
import logging
import os
import socketserver
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


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    with ThreadedServer((host, port), MountedHandler) as httpd:
        display = "localhost" if host in ("127.0.0.1", "0.0.0.0") else host
        print(f"STELLOGLOSSA UI: http://{display}:{port}/  (bound {host}:{port})")
        print(f"  public: {PUBLIC_ROOT}")
        print(f"  /audio/ → {OUTPUT_ROOT / 'audio'}")
        httpd.serve_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    env_port = os.environ.get("PORT")
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--host", default="0.0.0.0" if env_port else "127.0.0.1",
        help="bind host (default: 0.0.0.0 if PORT env is set, else 127.0.0.1)",
    )
    parser.add_argument(
        "--port", type=int, default=int(env_port) if env_port else 8765,
        help="bind port (default: $PORT env if set, else 8765)",
    )
    args = parser.parse_args()
    serve(host=args.host, port=args.port)
