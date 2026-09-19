#!/usr/bin/env python3
"""Fail if a diff carries real player data into this public repository.

Hard rule 2 of AGENTS.md: `export/` is gitignored and stays on one laptop.
The committed `fixtures/` are pseudonymised. A gitignore is a convention;
this is the enforcement, because `git add -f` beats a gitignore and an agent
that is "just adding a test fixture" will not stop to think about it.

Three checks, cheapest first:

  1. No path under export/ (or any other local-only path) is in the diff.
  2. No added line mentions a local-only artefact, an email address or a
     Danish phone number.
  3. If the REAL_NAME_REGEX repository secret is set, no added line matches
     it. Matches are reported as file:line only - never as content - so the
     real names cannot leak through this public repo's CI logs.

Check 3 is the only one that actually knows the real names. Without the
secret this script is a smoke alarm in the next room, and it says so.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

# Paths that must never appear in a commit at all.
FORBIDDEN_PATHS = (
    re.compile(r"^export/"),
    re.compile(r"^scripts/name_map\.json$"),
    re.compile(r"\.sqlite3?$"),
    re.compile(r"(^|/)(cosmos_dump|firebase_legacy|padel_export|padel_history)[^/]*$"),
    re.compile(r"(^|/)\.env(\.|$)"),
)

# Files that are allowed to talk *about* the local-only data.
CONTENT_SCAN_EXEMPT = (
    re.compile(r"^\.github/"),
    re.compile(r"^docs/"),
    re.compile(r"^\.gitignore$"),
    re.compile(r"^(README|AGENTS|CLAUDE)\.md$"),
    re.compile(r"^(frontend|backend)/(README|AGENTS|CLAUDE)\.md$"),
)

CONTENT_MARKERS = [
    (re.compile(r"export/(raw|extras)?"), "a path inside the local-only export/ directory"),
    (re.compile(r"name_map\.json"), "the pseudonymisation name map"),
    (re.compile(r"cosmos_dump|firebase_legacy|padel_export"), "a raw history dump"),
]

PII_PATTERNS = [
    (re.compile(r"[\w.+-]+@(?!example\.com|test\.local)[\w-]+\.[\w.]{2,}"), "an email address"),
    (re.compile(r"(?<![\d+])(?:\+45[\s-]?)(?:\d[\s-]?){8}(?![\d])"), "a Danish phone number"),
]


def run(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False, encoding="utf-8"
    )
    if result.returncode != 0:
        print(f"::error::git {' '.join(args)} failed: {result.stderr.strip()}")
        raise SystemExit(1)
    return result.stdout


def resolve_base() -> str:
    base = (os.environ.get("BASE_SHA") or "").strip()
    if base and set(base) != {"0"}:
        check = subprocess.run(
            ["git", "cat-file", "-e", f"{base}^{{commit}}"], capture_output=True, check=False
        )
        if check.returncode == 0:
            return base
    parent = subprocess.run(
        ["git", "rev-parse", "HEAD~1"], capture_output=True, text=True, check=False
    )
    if parent.returncode == 0:
        return parent.stdout.strip()
    return EMPTY_TREE


def changed_files(base: str) -> list[str]:
    out = run("diff", "--name-only", "--diff-filter=ACMR", base, "HEAD")
    return [line for line in out.splitlines() if line]


def added_lines(base: str, paths: list[str]) -> list[tuple[str, int, str]]:
    """[(path, line_number, text)] for every line this diff adds."""
    if not paths:
        return []
    out = run("diff", "--unified=0", "--no-color", base, "HEAD", "--", *paths)
    results: list[tuple[str, int, str]] = []
    path = ""
    lineno = 0
    for line in out.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
            continue
        if line.startswith("@@"):
            match = re.search(r"\+(\d+)", line)
            lineno = int(match.group(1)) if match else 0
            continue
        if line.startswith("+") and not line.startswith("+++"):
            results.append((path, lineno, line[1:]))
            lineno += 1
    return results


def exempt(path: str) -> bool:
    return any(pattern.search(path) for pattern in CONTENT_SCAN_EXEMPT)


def main() -> int:
    base = resolve_base()
    print(f"Comparing {base[:12]} -> HEAD")
    files = changed_files(base)
    failures: list[str] = []

    for path in files:
        for pattern in FORBIDDEN_PATHS:
            if pattern.search(path):
                failures.append(f"{path} is a local-only path and must never be committed")
                print(
                    f"::error file={path}::This path holds real player data and is gitignored. "
                    "If it reached the index, it was force-added. Remove it: "
                    f"git rm --cached '{path}'"
                )
                break

    scannable = [p for p in files if not exempt(p)]
    lines = added_lines(base, scannable)

    for path, lineno, text in lines:
        for pattern, what in CONTENT_MARKERS:
            if pattern.search(text):
                failures.append(f"{path}:{lineno} references {what}")
                print(f"::error file={path},line={lineno}::Added line references {what}.")
                break
        for pattern, what in PII_PATTERNS:
            if pattern.search(text):
                failures.append(f"{path}:{lineno} contains {what}")
                print(
                    f"::error file={path},line={lineno}::Added line contains {what}. "
                    "Nothing in this repo needs one."
                )
                break

    name_regex = (os.environ.get("REAL_NAME_REGEX") or "").strip()
    if name_regex:
        try:
            names = re.compile(name_regex, re.IGNORECASE)
        except re.error as exc:
            print(f"::error::REAL_NAME_REGEX is not a valid Python regex: {exc}")
            return 1
        # Scan everything here, exemptions included: a real name has no
        # business in a doc either.
        for path, lineno, text in added_lines(base, files):
            if names.search(text):
                failures.append(f"{path}:{lineno} looks like a real player name")
                # Deliberately no content in the message.
                print(
                    f"::error file={path},line={lineno}::This added line matches the real "
                    "player names. Use the pseudonyms from fixtures/, regenerate via "
                    "scripts/pseudonymize.py, and never paste from export/."
                )
    else:
        print(
            "::warning title=REAL_NAME_REGEX not set::The strongest half of this check is "
            "off. Only path and marker heuristics ran. Set the secret with "
            "`gh secret set REAL_NAME_REGEX` (a case-insensitive regex of the real first "
            "names, e.g. '(Anders|Mikkel|Soeren)'). Fork PRs never see it - review those "
            "diffs by eye."
        )

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            if failures:
                handle.write("## Real data check failed\n\n")
                for failure in failures:
                    handle.write(f"- {failure}\n")
                handle.write(
                    "\nThis repository is public. `export/` stays on one laptop and the "
                    "committed fixtures are pseudonymised.\n"
                )
            else:
                handle.write(
                    f"\nReal data check clean over {len(files)} changed file(s)"
                    f"{'' if name_regex else ' (name regex not configured)'}.\n"
                )

    if failures:
        print(f"\n{len(failures)} problem(s). See the annotations above.", file=sys.stderr)
        return 1
    print(f"Clean over {len(files)} changed file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
