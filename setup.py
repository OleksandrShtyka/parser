try:
    from setuptools import setup  # type: ignore
except ImportError:
    # setuptools may not be installed in this environment; fall back to distutils.core for basic setup use
    from distutils.core import setup  # type: ignore

APP = ['main.py']
DATA_FILES = []
OPTIONS = {
    'argv_emulation': True,
    'packages': ['PySide6'],  # якщо використовуєш GUI
    'iconfile': 'icon.icns',  # необов’язково
}

setup(
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
