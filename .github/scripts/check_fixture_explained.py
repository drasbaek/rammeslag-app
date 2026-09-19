#!/usr/bin/env python3
"""Fail a PR that changes the rating fixture without truthfully explaining it.

AGENTS.md hard rule 3. fixtures/expected_ratings.json is the team's real
rating history; an unexplained diff there silently reorders the ladder.

This checks three things:

  1. the PR body has a `## Rating change` heading,
  2. it has a `Why:` line with a real sentence after it,
  3. every player who actually moved is named, with a delta that MATCHES
     the fixture.

Point 3 is the one that matters. An earlier version only checked that a
plausible-looking section existed, which an agent optimising for green CI
learns to write. Here the claimed numbers are compared against the ones
computed from the two snapshots, so inventing them fails.

Reads the body from the PR_BODY environment variable. It is never passed
through a shell: on a public repo it is attacker-controlled text.

    check_fixture_explained.py <before.json> <after.json>
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rating_diff import Movement, load_ladder, movements  # noqa: E402

#: Claims are written to one decimal place, so allow rounding slack.
TOLERANCE = 0.1

HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
SIGNED = re.compile(r"[+-]\s?\d+(?:[.,]\d+)?")
ARROW = re.compile(r"(\d+(?:[.,]\d+)?)\s*->\s*(\d+(?:[.,]\d+)?)")


def _number(text: str) -> float:
    return float(text.replace(",", ".").replace(" ", ""))


def claimed_deltas(body: str, name: str) -> list[float]:
    """Every delta the body could be claiming for this player."""
    out: list[float] = []
    for line in body.splitlines():
        if name.lower() not in line.lower():
            continue
        out.extend(_number(match.group()) for match in SIGNED.finditer(line))
        arrow = ARROW.search(line)
        if arrow:
            out.append(_number(arrow.group(2)) - _number(arrow.group(1)))
    return out


def verify(body: str, moved: list[Movement]) -> list[str]:
    """Where the PR body and the fixture disagree."""
    problems: list[str] = []
    for movement in moved:
        if movement.old is None or movement.new is None:
            if movement.name.lower() not in body.lower():
                problems.append(f"`{movement.name}` was added or removed but is not mentioned")
            continue
        claims = claimed_deltas(body, movement.name)
        if not claims:
            problems.append(
                f"`{movement.name}` moved {movement.delta:+.1f} but the PR body "
                "does not mention them"
            )
        elif not any(abs(claim - movement.delta) <= TOLERANCE for claim in claims):
            shown = ", ".join(f"{c:+.1f}" for c in claims)
            problems.append(
                f"`{movement.name}` is described as {shown} but the fixture says "
                f"{movement.delta:+.1f}"
            )
    return problems


def main(before_path: str, after_path: str) -> int:
    body = HTML_COMMENT.sub("", os.environ.get("PR_BODY") or "")
    moved = movements(load_ladder(before_path), load_ladder(after_path))

    problems: list[str] = []
    if not re.search(r"^\s*#{1,4}\s*rating change\b", body, re.IGNORECASE | re.MULTILINE):
        problems.append("no `## Rating change` heading in the PR body")

    why = re.search(r"^\s*why\s*:\s*(.+)$", body, re.IGNORECASE | re.MULTILINE)
    if not why:
        problems.append("no `Why:` line explaining what caused the movement")
    elif len(why.group(1).strip()) < 20:
        problems.append(
            f"the `Why:` line is {len(why.group(1).strip())} characters long. "
            "Say which constant or rule changed and why."
        )

    problems.extend(verify(body, moved))

    if not problems:
        print(f"Rating change explained and verified against the fixture ({len(moved)} moved).")
        return 0

    banner = "=" * 72
    print(banner)
    print("  UNEXPLAINED RATING FIXTURE CHANGE")
    print(banner)
    print()
    print("  fixtures/expected_ratings.json is the real rating history of a real")
    print("  team. Changing it reorders the ladder for everyone. It may only")
    print("  change deliberately, and the PR must say who moved and why.")
    print()
    for problem in problems:
        print(f"    - {problem}")
    print()
    if moved:
        width = max(len(m.name) for m in moved)
        print("  What the fixture actually says:")
        print()
        for movement in moved:
            print(f"    {movement.render(width)}")
        print()
    print("  Put a `## Rating change` section in the PR body with those numbers")
    print("  and a `Why:` line. Editing the PR body re-runs this check.")
    print(banner)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write("### Unexplained rating fixture change\n\n")
            for problem in problems:
                handle.write(f"- {problem}\n")
    return 1


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: check_fixture_explained.py <before.json> <after.json>", file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
