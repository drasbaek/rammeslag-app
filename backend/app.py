"""Entrypoint for the Vercel Python service.

Vercel imports this module and looks for an ASGI callable named ``app``. The
package uses a src layout, so put ``src`` on the path and re-export.

Routes already carry the ``/api`` prefix, so the public rewrite can hand the
original path straight through without rewriting it.
"""

from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent / "src"
if _SRC.is_dir() and str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from rammeslag.main import app  # noqa: E402

__all__ = ["app"]
