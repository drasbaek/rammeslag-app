"""Turn the real export into the committed fixture.

Reads ``export/padel_history.json`` (real names, never committed) and writes:

* ``fixtures/history.json``   - same structure, same dates, same scores, same
  team pairings, same guest flags and entry data, but every player name and
  player id replaced by an invented Danish one.
* ``scripts/name_map.json``   - the real -> fake mapping. Gitignored. Never
  commit it.

The mapping is deterministic: real players are sorted by their real id and the
n-th one always receives the n-th invented name. Re-running the script on the
same export therefore produces byte-identical output.

Run from the repository root::

    python scripts/pseudonymize.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPORT_FILE = REPO_ROOT / "export" / "padel_history.json"
FIXTURE_FILE = REPO_ROOT / "fixtures" / "history.json"
NAME_MAP_FILE = REPO_ROOT / "scripts" / "name_map.json"

# 28 invented Danish names, one per real player. Index i of FIRST_NAMES is
# paired with index i of LAST_NAMES. None of these words occur in the real
# export; `verify_no_real_names` re-checks that on every run.
FIRST_NAMES = [
    "Aksel", "Bjarne", "Carl", "Dennis", "Esben", "Finn", "Gorm",
    "Henrik", "Ib", "Jeppe", "Karsten", "Lars", "Mikkel", "Niels",
    "Ole", "Palle", "Rune", "Svend", "Thor", "Uffe", "Valdemar",
    "Bo", "Erik", "Gustav", "Helge", "Ivan", "Joakim", "Klaus",
]
LAST_NAMES = [
    "Agerskov", "Bundgaard", "Kragh", "Damgaard", "Eriksen", "Fisker", "Gade",
    "Hansen", "Ipsen", "Jensen", "Knudsen", "Lundberg", "Madsen", "Nielsen",
    "Olesen", "Poulsen", "Qvist", "Riis", "Skovgaard", "Thomsen", "Ulrich",
    "Vestergaard", "Winther", "Bech", "Dahl", "Friis", "Greve", "Hedegaard",
]

# Words this short are not distinctive enough to scan for; the full-name scan
# below still covers them.
MIN_TOKEN_LENGTH = 3


def fake_player_id(fake_name: str) -> str:
    """A stable opaque id derived from the invented name, not from the real one."""
    digest = hashlib.sha256(fake_name.encode("utf-8")).hexdigest()
    return f"player-{digest[:8]}"


def build_mapping(players: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    """Map every real player onto an invented one, seeded by sorted real id."""
    if len(players) > len(FIRST_NAMES):
        raise SystemExit(
            f"{len(players)} players in the export but only {len(FIRST_NAMES)} "
            "invented names available; extend FIRST_NAMES and LAST_NAMES."
        )

    mapping: dict[str, dict[str, str]] = {}
    for index, player in enumerate(sorted(players, key=lambda p: p["id"])):
        fake_name = f"{FIRST_NAMES[index]} {LAST_NAMES[index]}"
        mapping[player["id"]] = {
            "real_name": player["name"],
            "fake_id": fake_player_id(fake_name),
            "fake_name": fake_name,
        }

    fake_ids = {entry["fake_id"] for entry in mapping.values()}
    fake_names = {entry["fake_name"] for entry in mapping.values()}
    if len(fake_ids) != len(mapping) or len(fake_names) != len(mapping):
        raise SystemExit("invented ids or names collided; fix the name lists.")
    return mapping


def pseudonymize_player(
    player: dict[str, Any], mapping: dict[str, dict[str, str]]
) -> dict[str, Any]:
    entry = mapping[player["id"]]
    out = dict(player)
    out["id"] = entry["fake_id"]
    out["name"] = entry["fake_name"]
    return out


def pseudonymize_team(
    team: list[dict[str, Any]], mapping: dict[str, dict[str, str]]
) -> list[dict[str, Any]]:
    out = []
    for member in team:
        entry = mapping[member["id"]]
        out.append({"id": entry["fake_id"], "name": entry["fake_name"]})
    return out


def pseudonymize_match(
    match: dict[str, Any], mapping: dict[str, dict[str, str]]
) -> dict[str, Any]:
    out = dict(match)
    out["team_a"] = pseudonymize_team(match["team_a"], mapping)
    out["team_b"] = pseudonymize_team(match["team_b"], mapping)
    out["sets"] = [dict(s) for s in match["sets"]]
    return out


def pseudonymize(history: dict[str, Any], mapping: dict[str, dict[str, str]]) -> dict[str, Any]:
    """Same keys, same order, same values - only player identities replaced."""
    out = dict(history)
    out["source"] = "pseudonymised from export/padel_history.json"
    out["players"] = [pseudonymize_player(p, mapping) for p in history["players"]]
    out["matches"] = [pseudonymize_match(m, mapping) for m in history["matches"]]
    return out


def real_name_tokens(mapping: dict[str, dict[str, str]]) -> tuple[set[str], set[str]]:
    """Every real full name, and every distinctive word inside one."""
    full_names = {entry["real_name"] for entry in mapping.values()}
    tokens = set()
    for name in full_names:
        for token in re.split(r"[^\w]+", name, flags=re.UNICODE):
            if len(token) >= MIN_TOKEN_LENGTH:
                tokens.add(token)
    return full_names, tokens


def verify_no_real_names(mapping: dict[str, dict[str, str]], fixtures_dir: Path) -> None:
    """Fail loudly if any real name survived into fixtures/."""
    full_names, tokens = real_name_tokens(mapping)
    leaks: list[str] = []

    for path in sorted(fixtures_dir.rglob("*")):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for name in sorted(full_names):
            if name.lower() in text.lower():
                leaks.append(f"{path}: full name {name!r}")
        for token in sorted(tokens):
            if re.search(rf"\b{re.escape(token)}\b", text, flags=re.IGNORECASE | re.UNICODE):
                leaks.append(f"{path}: name fragment {token!r}")

    if leaks:
        raise SystemExit("REAL NAMES LEAKED INTO fixtures/:\n  " + "\n  ".join(leaks))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", type=Path, default=EXPORT_FILE)
    parser.add_argument("--fixture", type=Path, default=FIXTURE_FILE)
    parser.add_argument("--name-map", type=Path, default=NAME_MAP_FILE)
    args = parser.parse_args()

    if not args.export.exists():
        raise SystemExit(f"missing export: {args.export} (it is gitignored and local only)")

    history = json.loads(args.export.read_text(encoding="utf-8"))
    mapping = build_mapping(history["players"])

    write_json(args.fixture, pseudonymize(history, mapping))
    write_json(args.name_map, mapping)

    verify_no_real_names(mapping, args.fixture.parent)

    print(f"wrote {args.fixture.relative_to(REPO_ROOT)}: "
          f"{len(history['players'])} players, {len(history['matches'])} matches")
    print(f"wrote {args.name_map.relative_to(REPO_ROOT)} (gitignored, never commit)")
    print("verified: no real name appears anywhere in fixtures/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
