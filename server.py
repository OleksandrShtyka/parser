from __future__ import annotations

import io
import json
import os
import shutil
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
import traceback
from urllib.parse import parse_qs, urlparse

try:
    from yt_dlp import YoutubeDL
except Exception as exc:  # pragma: no cover
    sys.stderr.write("yt-dlp is required. Install: pip install yt-dlp\n")
    raise


def _json_response(handler: BaseHTTPRequestHandler, status: int, data: dict) -> None:
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    # Basic CORS for local dev
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


class YTDLPHandler(BaseHTTPRequestHandler):
    server_version = "YTDLPServer/0.1"

    def do_OPTIONS(self) -> None:  # CORS preflight
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _parse_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length > 0 else b""
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def do_POST(self) -> None:
        try:
            if self.path == "/api/info":
                return self._post_info()
            _json_response(self, 404, {"error": "Not found"})
        except Exception as exc:  # safety net to avoid 500 HTML
            traceback.print_exc()
            _json_response(self, 500, {"error": f"Internal error: {exc}"})

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/health":
                _json_response(self, 200, {"ok": True})
                return
            if parsed.path == "/api/download":
                return self._get_download(parsed)
            _json_response(self, 404, {"error": "Not found"})
        except Exception as exc:  # safety net
            traceback.print_exc()
            _json_response(self, 500, {"error": f"Internal error: {exc}"})

    # --- Implementation helpers ---
    def _post_info(self) -> None:
        payload = self._parse_json()
        url = (payload.get("url") or "").strip()
        if not url:
            _json_response(self, 400, {"error": "Missing url"})
            return
        opts = {
            "quiet": True,
            "skip_download": True,
            "noplaylist": True,
        }
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as exc:
            _json_response(self, 400, {"error": f"Failed to fetch info: {exc}"})
            return

        def map_format(fmt: dict) -> dict:
            return {
                "format_id": fmt.get("format_id"),
                "ext": fmt.get("ext"),
                "resolution": fmt.get("resolution") or (f"{fmt.get('width','?')}x{fmt.get('height','?')}" if fmt.get("width") else None),
                "abr": fmt.get("abr"),
                "vcodec": fmt.get("vcodec"),
                "acodec": fmt.get("acodec"),
                "filesize": fmt.get("filesize") or fmt.get("filesize_approx"),
                "format_note": fmt.get("format_note"),
            }

        data = {
            "id": info.get("id"),
            "title": info.get("title"),
            "duration": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader"),
            "webpage_url": info.get("webpage_url"),
            "formats": [map_format(f) for f in info.get("formats", []) if f.get("ext") in ("mp4", "webm", "m4a", "mp3")],
        }
        _json_response(self, 200, data)

    def _get_download(self, parsed) -> None:
        qs = parse_qs(parsed.query)
        url = (qs.get("url", [""])[0] or "").strip()
        format_id = (qs.get("format_id", [""])[0] or "").strip()
        if not url:
            _json_response(self, 400, {"error": "Missing url"})
            return

        tmpdir = tempfile.mkdtemp(prefix="ytdlp_")
        output_tmpl = os.path.join(tmpdir, "%(title).70s.%(ext)s")

        opts = {
            "outtmpl": output_tmpl,
            "quiet": True,
            "noplaylist": True,
            "merge_output_format": "mp4",
        }
        if format_id:
            opts["format"] = format_id

        try:
            with YoutubeDL(opts) as ydl:
                result = ydl.extract_info(url, download=True)
        except Exception as exc:
            shutil.rmtree(tmpdir, ignore_errors=True)
            _json_response(self, 400, {"error": f"Download failed: {exc}"})
            return

        if "requested_downloads" in result and result["requested_downloads"]:
            filepath = result["requested_downloads"][0].get("filepath")
        else:
            ext = result.get("ext", "mp4")
            title = result.get("title", "video")
            filepath = os.path.join(tmpdir, f"{title}.{ext}")

        if not filepath or not os.path.exists(filepath):
            cand = next((os.path.join(tmpdir, f) for f in os.listdir(tmpdir)), None)
            filepath = cand if cand and os.path.exists(cand) else None

        if not filepath:
            shutil.rmtree(tmpdir, ignore_errors=True)
            _json_response(self, 500, {"error": "Downloaded file not found"})
            return

        filename = os.path.basename(filepath)
        try:
            size = os.path.getsize(filepath)
        except OSError:
            size = None

        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f"attachment; filename=\"{filename}\"")
        if size is not None:
            self.send_header("Content-Length", str(size))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        with open(filepath, "rb") as f:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
        try:
            os.remove(filepath)
        except OSError:
            pass
        shutil.rmtree(tmpdir, ignore_errors=True)


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    httpd = HTTPServer((host, port), YTDLPHandler)
    print(f"API server running on http://{host}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run()
