"""macOS YouTube downloader with a liquid glass inspired interface.

Run with:
    python3 main.py

Dependencies:
    pip install PyQt6 yt-dlp
"""

from __future__ import annotations

import os
import sys
import shutil
import logging
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from PyQt6.QtCore import QObject, Qt, QThread, pyqtSignal, QTimer
    from PyQt6.QtGui import QColor, QLinearGradient, QPainter, QPalette
    from PyQt6.QtWidgets import (
        QApplication,
        QFileDialog,
        QGraphicsDropShadowEffect,
        QHBoxLayout,
        QCheckBox,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QPushButton,
        QProgressBar,
        QSizePolicy,
        QVBoxLayout,
        QWidget,
    )
except ImportError:  # pragma: no cover - fails fast if PyQt6 missing
    sys.stderr.write(
        "PyQt6 is required to run this application.\n"
        "Install it with: pip install PyQt6\n"
    )
    raise

try:
    from yt_dlp import YoutubeDL
except ImportError:  # pragma: no cover - fails fast if yt-dlp missing
    sys.stderr.write(
        "yt-dlp is required to download YouTube videos.\n"
        "Install it with: pip install yt-dlp\n"
    )
    raise

import math
import time


class GlassCard(QWidget):
    """Semi-transparent widget with a soft glow, imitating liquid glass."""

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self._shadow = QGraphicsDropShadowEffect(self)
        self._shadow.setBlurRadius(48)
        self._shadow.setXOffset(0)
        self._shadow.setYOffset(24)
        self._shadow.setColor(QColor(15, 18, 30, 120))
        self.setGraphicsEffect(self._shadow)

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.rect().adjusted(8, 8, -8, -8)

        start = rect.topLeft()
        end = rect.bottomRight()
        gradient = QLinearGradient(
            float(start.x()),
            float(start.y()),
            float(end.x()),
            float(end.y()),
        )
        gradient.setColorAt(0.0, QColor(255, 255, 255, 120))
        gradient.setColorAt(0.5, QColor(255, 255, 255, 80))
        gradient.setColorAt(1.0, QColor(255, 255, 255, 60))

        painter.setPen(QColor(255, 255, 255, 180))
        painter.setBrush(gradient)
        painter.drawRoundedRect(rect, 26, 26)


class DownloadWorker(QObject):
    """Background worker that downloads a video via yt-dlp."""

    progress = pyqtSignal(float)
    status = pyqtSignal(str)
    finished = pyqtSignal(str)
    failed = pyqtSignal(str)

    def __init__(self, url: str, output_dir: Path, use_aria2c: bool) -> None:
        super().__init__()
        self.url = url
        self.output_dir = output_dir
        self.use_aria2c = use_aria2c

    def run(self) -> None:
        """Perform the download on a worker thread."""
        def progress_hook(status: dict) -> None:
            state = status.get("status")
            if state == "downloading":
                percent = None
                percent_str = status.get("_percent_str")
                if percent_str:
                    try:
                        percent = float(percent_str.strip().rstrip("%"))
                    except ValueError:
                        percent = None

                if percent is None:
                    total = status.get("total_bytes") or status.get("total_bytes_estimate")
                    downloaded = status.get("downloaded_bytes", 0)
                    if total:
                        percent = downloaded / total * 100

                if percent is not None:
                    self.progress.emit(max(0.0, min(percent, 100.0)))

                speed_str = status.get("_speed_str")
                if speed_str:
                    self.status.emit(f"Завантаження… {speed_str}")
                else:
                    self.status.emit("Завантаження…")
            elif state == "finished":
                self.progress.emit(100.0)
                self.status.emit("Оброблення відео…")
            elif state == "postprocessing":
                self.progress.emit(100.0)
                self.status.emit("Післяобробка…")
            else:
                self.status.emit("Підготовка…")

        safe_dir = self.output_dir.expanduser().resolve()
        safe_dir.mkdir(parents=True, exist_ok=True)

        options = {
            "outtmpl": str(safe_dir / "%(title).70s.%(ext)s"),
            "noplaylist": True,
            "progress_hooks": [progress_hook],
            "quiet": True,
            "merge_output_format": "mp4",
            "concurrent_fragment_downloads": 4,
        }

        if self.use_aria2c:
            options.update(
                {
                    "external_downloader": "aria2c",
                    "external_downloader_args": {
                        "aria2c": [
                            "--max-connection-per-server=16",
                            "--split=16",
                            "--min-split-size=1M",
                            "--file-allocation=none",
                            "--continue=true",
                        ]
                    },
                }
            )
            self.status.emit("aria2c виконує завантаження…")

        try:
            with YoutubeDL(options) as ydl:
                ydl.download([self.url])
            self.finished.emit(f"Готово! Файл збережено у {safe_dir}")
        except Exception as exc:  # pragma: no cover - runtime feedback in UI
            self.failed.emit(f"Помилка: {exc}")


class MainWindow(QMainWindow):
    """Main window with a liquid glass styled card in the center."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Liquid Glass YouTube Downloader")
        self.resize(760, 520)
        self._download_thread: Optional[QThread] = None
        self._worker: Optional[DownloadWorker] = None

        self._build_palette()
        self._setup_central_card()

    def _build_palette(self) -> None:
        """Apply a gradient palette reminiscent of liquid glass backdrops."""
        gradient = QLinearGradient(0, 0, 1, 1)
        gradient.setCoordinateMode(QLinearGradient.CoordinateMode.ObjectBoundingMode)
        gradient.setColorAt(0.0, QColor(14, 32, 58))
        gradient.setColorAt(0.5, QColor(32, 62, 94))
        gradient.setColorAt(1.0, QColor(60, 88, 120))

        palette = QPalette()
        palette.setBrush(QPalette.ColorRole.Window, gradient)
        self.setPalette(palette)

    def _setup_central_card(self) -> None:
        container = QWidget()
        container_layout = QVBoxLayout(container)
        container_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        card = GlassCard()
        card.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Maximum)
        card_layout = QVBoxLayout(card)
        card_layout.setSpacing(18)
        card_layout.setContentsMargins(42, 42, 42, 42)

        title = QLabel("Liquid Glass YouTube Downloader")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet(
            "color: rgba(245, 247, 255, 220); font-size: 28px; font-weight: 600;"
        )

        subtitle = QLabel("Вставте посилання на YouTube та оберіть теку збереження.")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitle.setStyleSheet("color: rgba(245, 247, 255, 190); font-size: 16px;")
        subtitle.setWordWrap(True)

        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("https://www.youtube.com/watch?v=...")

        self.output_input = QLineEdit()
        default_dir = Path.home() / "Downloads"
        self.output_input.setText(str(default_dir))
        self.output_input.setPlaceholderText("Тека для збереження")

        browse_button = QPushButton("Обрати теку")
        browse_button.clicked.connect(self._select_folder)

        path_row = QHBoxLayout()
        path_row.setSpacing(12)
        path_row.addWidget(self.output_input)
        path_row.addWidget(browse_button)

        self.speed_checkbox = QCheckBox("Максимальна швидкість (aria2c)")
        self.speed_checkbox.setStyleSheet(
            "QCheckBox { color: rgba(245, 247, 255, 210); font-size: 14px; }"
        )

        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setFormat("%p%")

        self.status_label = QLabel("Готово до завантаження.")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("color: rgba(245, 247, 255, 210); font-size: 15px;")

        self.download_button = QPushButton("Завантажити")
        self.download_button.clicked.connect(self._start_download)

        card_layout.addWidget(title)
        card_layout.addWidget(subtitle)
        card_layout.addSpacing(12)
        card_layout.addWidget(self.url_input)
        card_layout.addLayout(path_row)
        card_layout.addWidget(self.speed_checkbox)
        card_layout.addSpacing(18)
        card_layout.addWidget(self.progress_bar)
        card_layout.addWidget(self.status_label)
        card_layout.addSpacing(6)
        card_layout.addWidget(self.download_button)

        container_layout.addWidget(card)
        self.setCentralWidget(container)

        self._apply_styles()

    def _apply_styles(self) -> None:
        self.setStyleSheet(
            """
            QLineEdit {
                color: rgba(22, 28, 38, 240);
                background: rgba(255, 255, 255, 180);
                border: 1px solid rgba(255, 255, 255, 200);
                border-radius: 18px;
                padding: 10px 16px;
                font-size: 15px;
            }
            QLineEdit:focus {
                border: 2px solid rgba(123, 176, 255, 200);
            }
            QPushButton {
                background: rgba(255, 255, 255, 210);
                color: rgba(24, 28, 42, 255);
                border-radius: 20px;
                padding: 12px 24px;
                font-size: 16px;
                font-weight: 600;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 245);
            }
            QPushButton:pressed {
                background: rgba(235, 235, 245, 255);
            }
            QPushButton:disabled {
                background: rgba(255, 255, 255, 120);
                color: rgba(24, 28, 42, 120);
            }
            QProgressBar {
                border: 1px solid rgba(255, 255, 255, 150);
                border-radius: 18px;
                background: rgba(255, 255, 255, 100);
                color: rgba(24, 28, 42, 200);
                font-weight: 600;
                text-align: center;
            }
            QProgressBar::chunk {
                border-radius: 16px;
                background: qlineargradient(
                    spread:pad, x1:0, y1:0, x2:1, y2:1,
                    stop:0 rgba(123, 176, 255, 240),
                    stop:1 rgba(178, 230, 255, 240)
                );
            }
            """
        )

    def _select_folder(self) -> None:
        dialog_dir = self.output_input.text() or str(Path.home() / "Downloads")
        selected = QFileDialog.getExistingDirectory(
            self,
            "Оберіть теку для збереження",
            dialog_dir,
        )
        if selected:
            self.output_input.setText(selected)

    def _start_download(self) -> None:
        url = self.url_input.text().strip()
        if not url:
            QMessageBox.warning(self, "Немає посилання", "Будь ласка, вставте URL відео YouTube.")
            return

        output_dir = Path(self.output_input.text().strip() or Path.home() / "Downloads")
        use_aria2c = self.speed_checkbox.isChecked()
        if use_aria2c and shutil.which("aria2c") is None:
            QMessageBox.warning(
                self,
                "aria2c не знайдено",
                "Для режиму максимальної швидкості встановіть aria2c (наприклад, через brew install aria2c).",
            )
            return

        self.download_button.setEnabled(False)
        self.status_label.setText("Підготовка до завантаження…")
        self.progress_bar.setValue(0)

        self._download_thread = QThread(parent=self)
        self._worker = DownloadWorker(url=url, output_dir=output_dir, use_aria2c=use_aria2c)
        self._worker.moveToThread(self._download_thread)

        self._download_thread.started.connect(self._worker.run)
        self._worker.progress.connect(self._update_progress)
        self._worker.status.connect(self.status_label.setText)
        self._worker.finished.connect(self._handle_finished)
        self._worker.failed.connect(self._handle_failure)
        self._download_thread.finished.connect(self._cleanup_worker)

        self._download_thread.start()

    def _update_progress(self, value: float) -> None:
        self.progress_bar.setValue(int(value))

    def _handle_finished(self, message: str) -> None:
        self.status_label.setText(message)
        self.download_button.setEnabled(True)
        if self._download_thread is not None:
            self._download_thread.quit()

    def _handle_failure(self, message: str) -> None:
        self.status_label.setText(message)
        QMessageBox.critical(self, "Помилка завантаження", message)
        self.download_button.setEnabled(True)
        if self._download_thread is not None:
            self._download_thread.quit()

    def _cleanup_worker(self) -> None:
        if self._worker is not None:
            self._worker.deleteLater()
            self._worker = None
        if self._download_thread is not None:
            self._download_thread.deleteLater()
            self._download_thread = None

    def closeEvent(self, event) -> None:
        if self._download_thread is not None and self._download_thread.isRunning():
            QMessageBox.information(
                self,
                "Зачекайте",
                "Завантаження ще триває. Будь ласка, дочекайтеся завершення.",
            )
            event.ignore()
            return
        super().closeEvent(event)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--no-gui", action="store_true", help="Run in CLI mode without GUI")
    parser.add_argument("--url", type=str, help="URL to download (single)")
    parser.add_argument("--out", type=str, help="Output directory")
    parser.add_argument("--aria2c", action="store_true", help="Use aria2c as external downloader")
    args = parser.parse_args()

    if args.no_gui:
        if not args.url:
            print("--url is required in --no-gui mode")
            sys.exit(2)

        outdir = Path(args.out) if args.out else Path.home() / "Downloads"
        outdir.mkdir(parents=True, exist_ok=True)

        def cli_progress_hook(status: dict) -> None:
            st = status.get("status")
            if st == "downloading":
                pct = status.get("_percent_str") or "?%"
                speed = status.get("_speed_str") or ""
                print(f"Downloading {pct} {speed}")
            elif st == "finished":
                print("Finished downloading, postprocessing...")

        options = {
            "outtmpl": str(outdir / "%(title).70s.%(ext)s"),
            "noplaylist": True,
            "progress_hooks": [cli_progress_hook],
            "quiet": True,
            "merge_output_format": "mp4",
        }
        if args.aria2c:
            options.update({"external_downloader": "aria2c"})

        try:
            with YoutubeDL(options) as ydl:
                ydl.download([args.url])
        except Exception:
            logger.exception("CLI download failed")
            sys.exit(1)
        sys.exit(0)

    # GUI mode
    try:
        QApplication.setAttribute(Qt.ApplicationAttribute.AA_EnableHighDpiScaling, True)
        QApplication.setAttribute(Qt.ApplicationAttribute.AA_UseHighDpiPixmaps, True)
    except Exception:
        logger.info("High-DPI application attributes not available; continuing without them")

    app = QApplication(sys.argv)
    app.setApplicationName("Liquid Glass YouTube Downloader")

    window = MainWindow()
    window.show()

    start_time = time.time()
    timer = QTimer()
    timer.setInterval(40)

    def lerp(a: int, b: int, t: float) -> int:
        return int(a + (b - a) * t)

    def tick() -> None:
        t = time.time() - start_time
        f = (math.sin(t * 0.6) + 1.0) / 2.0

        c0 = QColor(lerp(14, 18, f), lerp(32, 40, f), lerp(58, 70, f))
        c1 = QColor(lerp(32, 44, f), lerp(62, 74, f), lerp(94, 110, f))
        c2 = QColor(lerp(60, 80, f), lerp(88, 110, f), lerp(120, 150, f))

        grad = QLinearGradient(0, 0, 1, 1)
        grad.setCoordinateMode(QLinearGradient.CoordinateMode.ObjectBoundingMode)
        grad.setColorAt(0.0, c0)
        grad.setColorAt(0.5, c1)
        grad.setColorAt(1.0, c2)

        pal = window.palette()
        pal.setBrush(QPalette.ColorRole.Window, grad)
        window.setPalette(pal)

        card = window.findChild(GlassCard)
        if card is not None and hasattr(card, "_shadow"):
            blur = 40 + (math.sin(t * 1.5) + 1.0) * 8.0
            yoff = 18 + (math.sin(t * 0.9) + 1.0) * 6.0
            alpha = 100 + int((math.cos(t * 1.2) + 1.0) * 40)

            card._shadow.setBlurRadius(blur)
            card._shadow.setYOffset(yoff)
            color = card._shadow.color()
            color.setAlpha(alpha)
            card._shadow.setColor(color)
            card.update()

    timer.timeout.connect(tick)
    timer.start()

    app.aboutToQuit.connect(timer.stop)
    # Simple translucent loading overlay with rotating-dot animation
    class LoadingOverlay(QWidget):
        def __init__(self, parent: QWidget):
            super().__init__(parent)
            self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)
            self.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
            self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
            self._angle = 0.0
            self._timer = QTimer(self)
            self._timer.setInterval(30)
            self._timer.timeout.connect(self._tick)
            self.hide()

        def show(self) -> None:
            self._reposition()
            super().show()
            self.raise_()
            self._angle = 0.0
            self._timer.start()

        def hide(self) -> None:
            self._timer.stop()
            super().hide()

        def _tick(self) -> None:
            self._angle = (self._angle + 8.0) % 360.0
            self.update()

        def _reposition(self) -> None:
            # cover the whole window content
            parent = self.parent() or self.window()
            self.setGeometry(parent.rect())

        def paintEvent(self, event) -> None:
            painter = QPainter(self)
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)

            # translucent backdrop
            painter.fillRect(self.rect(), QColor(10, 14, 20, 160))

            # center geometry
            w = self.width()
            h = self.height()
            cx = w // 2
            cy = h // 2
            radius = min(w, h) // 10
            dots = 8
            dot_radius = max(4, radius // 8)

            # title text
            painter.setPen(QColor(230, 240, 255, 230))
            painter.setFont(self.font())
            painter.drawText(cx - 100, cy - radius - 32, 200, 24, Qt.AlignmentFlag.AlignCenter, "Завантаження…")

            # rotating dots
            for i in range(dots):
                t = (360.0 / dots) * i + self._angle
                rad = math.radians(t)
                px = cx + int(math.cos(rad) * radius)
                py = cy + int(math.sin(rad) * radius)
                # fade based on angular offset to create motion illusion
                phase = (i / dots)
                alpha = int(160 * (0.4 + 0.6 * (0.5 + 0.5 * math.cos(math.radians((t - self._angle) % 360)))))
                color = QColor(140, 200, 255, max(60, alpha))
                painter.setBrush(color)
                painter.setPen(Qt.PenStyle.NoPen)
                painter.drawEllipse(px - dot_radius, py - dot_radius, dot_radius * 2, dot_radius * 2)

        def resizeEvent(self, event) -> None:
            self._reposition()
            super().resizeEvent(event)


    # create overlay and integrate with the existing MainWindow instance
    overlay = LoadingOverlay(window)

    # keep original start handler and replace the button's connection so we can show overlay
    _original_start = window._start_download


    def _start_with_overlay() -> None:
        # show overlay immediately to block UI while worker/thread start
        overlay.show()
        try:
            _original_start()
        except Exception:
            # ensure overlay hidden on unexpected error
            overlay.hide()
            raise

        # after start, hook worker/thread signals to hide overlay when finished/failed
        # use wildcard lambdas to accept signal arguments
        if getattr(window, "_worker", None) is not None:
            try:
                window._worker.finished.connect(lambda *_: overlay.hide())
                window._worker.failed.connect(lambda *_: overlay.hide())
            except Exception:
                pass
        if getattr(window, "_download_thread", None) is not None:
            try:
                window._download_thread.finished.connect(lambda: overlay.hide())
            except Exception:
                pass


    # reconnect the download button to our wrapper (safely disconnect existing)
    try:
        window.download_button.clicked.disconnect()
    except Exception:
        pass
    window.download_button.clicked.connect(_start_with_overlay)

    # also hide overlay if window is closed or app quits
    app.aboutToQuit.connect(lambda: overlay.hide())

    # ensure overlay follows window resizes
    _orig_resize = window.resizeEvent


    def _resize_and_keep_overlay(ev):
        _orig_resize(ev)
        overlay._reposition()


    window.resizeEvent = _resize_and_keep_overlay
    sys.exit(app.exec())