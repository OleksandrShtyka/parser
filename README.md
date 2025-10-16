# Liquid Glass YouTube Downloader

A macOS GUI for downloading YouTube videos with a liquid-glass inspired UI built with PyQt6 and yt-dlp.

Quick start

1. Create and activate a virtual environment (recommended):

```bash
cd /Users/dark/Desktop/YT
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

2. Run the GUI:

```bash
python main.py
```

3. CLI/headless mode (useful for automation):

```bash
python main.py --no-gui --url "https://www.youtube.com/watch?v=..." --out ~/Downloads
```

Build

- PyInstaller (tested on Python 3.14):

```bash
source .venv/bin/activate
pyinstaller --name 'LiquidGlassDownloader' --windowed main.py
```

Notes

- Packaging to a signed, notarized macOS app requires a Developer ID certificate and additional step for codesign/notarize.
- If you plan to build with `py2app`, prefer Python 3.11 due to py2app compatibility issues with Python 3.14.
