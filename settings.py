from pathlib import Path
import json
import os

APP_NAME = "liquid-glass-downloader"


def user_data_dir() -> Path:
    """Return a sensible app data dir for macOS (Library/Application Support)."""
    home = Path.home()
    # macOS convention
    return home / "Library" / "Application Support" / APP_NAME


def settings_path() -> Path:
    d = user_data_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d / "settings.json"


def get_app_log_path() -> Path:
    d = user_data_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d / "run.log"


def load_settings() -> dict:
    p = settings_path()
    if not p.exists():
        return {}
    try:
        with p.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def save_settings(obj: dict) -> None:
    p = settings_path()
    try:
        with p.open("w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)
    except Exception:
        # best-effort; don't raise
        pass
