from __future__ import annotations

import io
import json
import os
import shutil
import smtplib
import sys
import tempfile
import traceback
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse, quote as urlquote

try:
    from yt_dlp import YoutubeDL
except Exception as exc:  # pragma: no cover
    sys.stderr.write("yt-dlp is required. Install: pip install yt-dlp\n")
    raise


SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USERNAME or ""
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() not in {"0", "false", "no"}
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() in {"1", "true", "yes"}
SMTP_TIMEOUT = float(os.getenv("SMTP_TIMEOUT", "10"))
APP_NAME = os.getenv("APP_NAME", "Parser")
YTDLP_COOKIES = os.getenv("YTDLP_COOKIES")  # optional cookies.txt path for YouTube
YTDLP_YOUTUBE_CLIENTS = [
    client.strip()
    for client in os.getenv("YTDLP_YOUTUBE_CLIENTS", "android,ios").split(",")
    if client.strip()
]


def _build_yt_dlp_opts(*, download: bool, outtmpl: str | None = None) -> dict:
    """Construct base yt-dlp options with modern YouTube mitigations."""
    opts: dict = {
        "quiet": True,
        "noplaylist": True,
        "noprogress": True,
        "retries": 3,
        "skip_unavailable_fragments": True,
        "extractor_retries": 3,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 6 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
        "extractor_args": {},
    }
    if YTDLP_YOUTUBE_CLIENTS:
        opts.setdefault("extractor_args", {})["youtube"] = {
            "player_client": YTDLP_YOUTUBE_CLIENTS.copy(),
            "skip": ["dash"],
        }
    if download:
        if outtmpl:
            opts["outtmpl"] = outtmpl
        opts["merge_output_format"] = "mp4"
    else:
        opts["skip_download"] = True

    if YTDLP_COOKIES and os.path.exists(YTDLP_COOKIES):
        opts["cookiefile"] = YTDLP_COOKIES

    return opts


def _send_verification_email(email: str, code: str, name: str) -> bool:
    """Send a verification email using configured SMTP settings.

    Returns True when email was sent via SMTP, False when running in dev fallback mode.
    """
    if not SMTP_HOST:
        sys.stderr.write(
            f"[dev-mailer] SMTP not configured. Verification code for {email}: {code}\n"
        )
        return False

    sender = SMTP_FROM or SMTP_USERNAME
    if not sender:
        raise RuntimeError("SMTP_FROM or SMTP_USERNAME must be provided")

    display_name = name.strip() or "користувачу"
    subject = f"{APP_NAME} — код підтвердження"
    body = (
        f"Привіт, {display_name}!\n\n"
        f"Ваш код підтвердження: {code}\n\n"
        "Код діє протягом 15 хвилин. Якщо це були не ви, просто проігноруйте лист.\n\n"
        f"З повагою,\nКоманда {APP_NAME}"
    )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = email
    message.set_content(body)

    try:
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as smtp:
                if SMTP_USERNAME:
                    smtp.login(SMTP_USERNAME, SMTP_PASSWORD or "")
                smtp.send_message(message)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as smtp:
                if SMTP_USE_TLS:
                    smtp.starttls()
                if SMTP_USERNAME:
                    smtp.login(SMTP_USERNAME, SMTP_PASSWORD or "")
                smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:  # pragma: no cover - network interaction
        raise RuntimeError(f"SMTP error: {exc}") from exc
    return True


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
            if self.path == "/api/send-verification":
                return self._post_send_verification()
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
        opts = _build_yt_dlp_opts(download=False)
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

        formats = [map_format(f) for f in info.get("formats", []) if f.get("ext") in ("mp4", "webm", "m4a", "mp3")]
        if not formats:
            _json_response(
                self,
                400,
                {
                    "error": (
                        "Не вдалося отримати відеоформати. Оновіть yt-dlp, додайте cookies (YTDLP_COOKIES) або спробуйте пізніше."
                    )
                },
            )
            return

        data = {
            "id": info.get("id"),
            "title": info.get("title"),
            "duration": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader"),
            "webpage_url": info.get("webpage_url"),
            "formats": formats,
        }
        _json_response(self, 200, data)

    def _post_send_verification(self) -> None:
        payload = self._parse_json()
        email = (payload.get("email") or "").strip()
        code = (payload.get("code") or "").strip()
        name = (payload.get("name") or "").strip()
        if not email or not code:
            _json_response(self, 400, {"error": "Missing email or code"})
            return
        try:
            sent = _send_verification_email(email, code, name)
        except RuntimeError as exc:
            _json_response(self, 500, {"error": str(exc)})
            return
        payload = {"ok": True, "sent": sent}
        if not sent:
            payload[
                "message"
            ] = "SMTP не налаштовано. Код підтвердження записано у лог серверу (dev режим)."
        _json_response(self, 200, payload)

    def _get_download(self, parsed) -> None:
        qs = parse_qs(parsed.query)
        url = (qs.get("url", [""])[0] or "").strip()
        format_id = (qs.get("format_id", [""])[0] or "").strip()
        if not url:
            _json_response(self, 400, {"error": "Missing url"})
            return

        tmpdir = tempfile.mkdtemp(prefix="ytdlp_")
        output_tmpl = os.path.join(tmpdir, "%(title).70s.%(ext)s")

        opts = _build_yt_dlp_opts(download=True, outtmpl=output_tmpl)
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
        disposition = None
        try:
            filename.encode("latin-1")
            disposition = f'attachment; filename="{filename}"'
        except UnicodeEncodeError:
            fallback = "".join(ch for ch in filename if ord(ch) < 128) or "download"
            encoded = urlquote(filename)
            disposition = f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{encoded}'
        self.send_header("Content-Disposition", disposition)
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
