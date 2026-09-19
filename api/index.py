"""Vercel Python entrypoint.

Vercel's Python runtime imports this file and looks for an ASGI callable named
``app``. Everything else lives in ``backend/src/rammeslag``; this file only
puts that package on the path and re-exports the application.
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND_SRC = Path(__file__).resolve().parent.parent / "backend" / "src"
if _BACKEND_SRC.is_dir() and str(_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(_BACKEND_SRC))

from rammeslag.main import app  # noqa: E402

__all__ = ["app"]
