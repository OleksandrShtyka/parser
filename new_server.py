from __future__ import annotations

import json
import os
import shutil
import tempfile
import traceback
from typing import Iterator, Optional

from flask import Flask, Response, jsonify, request, stream_with_context

try:
    from yt_dlp import YoutubeDL
except Exception as exc:  # pragma: no cover
    raise SystemExit("yt-dlp is required. Install with: pip install yt-dlp")


app = Flask(__name__)


@app.after_request
def add_cors_headers(resp: Response):  # basic CORS for dev
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/health", methods=["GET"])
def health() -> Response:
    return jsonify({"ok": True})


@app.route("/api/info", methods=["POST"])
def api_info() -> Response:
    try:
        payload = request.get_json(silent=True) or {}
        url = (payload.get("url") or "").strip()
        if not url:
            return jsonify({"error": "Missing url"}), 400

        opts = {
            "quiet": True,
            "skip_download": True,
            "noplaylist": True,
        }
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)

        def map_fmt(fmt: dict) -> dict:
            res = fmt.get("resolution")
            if not res and fmt.get("width") and fmt.get("height"):
                res = f"{fmt.get('width')}x{fmt.get('height')}"
            return {
                "format_id": fmt.get("format_id"),
                "ext": fmt.get("ext"),
                "resolution": res,
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
            "formats": [
                map_fmt(f)
                for f in info.get("formats", [])
                if f.get("ext") in ("mp4", "webm", "m4a", "mp3")
            ],
        }
        return jsonify(data)
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch info: {exc}"}), 400


def _download_to_temp(url: str, format_id: Optional[str]) -> tuple[str, str, Optional[int]]:
    tmpdir = tempfile.mkdtemp(prefix="ytdlp_")
    outtmpl = os.path.join(tmpdir, "%(title).70s.%(ext)s")
    opts = {
        "outtmpl": outtmpl,
        "quiet": True,
        "noplaylist": True,
        "merge_output_format": "mp4",
    }
    if format_id:
        opts["format"] = format_id

    with YoutubeDL(opts) as ydl:
        res = ydl.extract_info(url, download=True)

    # resolve file path
    if "requested_downloads" in res and res["requested_downloads"]:
        filepath = res["requested_downloads"][0].get("filepath")
    else:
        ext = res.get("ext", "mp4")
        title = res.get("title", "video")
        filepath = os.path.join(tmpdir, f"{title}.{ext}")

    if not filepath or not os.path.exists(filepath):
        cand = next((os.path.join(tmpdir, f) for f in os.listdir(tmpdir)), None)
        filepath = cand if cand and os.path.exists(cand) else None

    if not filepath:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise RuntimeError("Downloaded file not found")

    try:
        size = os.path.getsize(filepath)
    except OSError:
        size = None
    return filepath, tmpdir, size


@app.route("/api/download", methods=["GET"])
def api_download() -> Response:
    try:
        url = (request.args.get("url") or "").strip()
        format_id = (request.args.get("format_id") or "").strip() or None
        if not url:
            return jsonify({"error": "Missing url"}), 400

        filepath, tmpdir, size = _download_to_temp(url, format_id)
        filename = os.path.basename(filepath)

        def generate() -> Iterator[bytes]:
            try:
                with open(filepath, "rb") as f:
                    while True:
                        chunk = f.read(1024 * 1024)
                        if not chunk:
                            break
                        yield chunk
            finally:
                try:
                    os.remove(filepath)
                except OSError:
                    pass
                shutil.rmtree(tmpdir, ignore_errors=True)

        headers = {
            "Content-Disposition": f"attachment; filename=\"{filename}\"",
        }
        if size is not None:
            headers["Content-Length"] = str(size)

        return Response(
            stream_with_context(generate()),
            headers=headers,
            mimetype="application/octet-stream",
        )
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"Download failed: {exc}"}), 400


if __name__ == "__main__":
    # Bind to 127.0.0.1:8000 to match Vite proxy
    app.run(host="127.0.0.1", port=8000, debug=False)

