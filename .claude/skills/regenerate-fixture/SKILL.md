---
name: regenerate-fixture
description: Re-run the golden rating snapshot in fixtures/expected_ratings.json, show the movement in human terms ("Klaus +12, Bo -8"), and write the explanation the PR body must carry. Use whenever the rating engine, its constants, fixtures/history.json, or the golden test changes - or whenever CI fails with "unexplained rating fixture change".
---

# regenerate-fixture

Hard rule 3 of AGENTS.md, as a procedure:

> Rating changes require fixture regeneration in the same commit. If
> `fixtures/expected_ratings.json` changes, say so explicitly in the PR body
> and explain who moved and why.

`fixtures/expected_ratings.json` is not test data. It is the pseudonymised
record of every rating Rammeslag FC has ever had, and the app renders it as
fact. Regenerating it is a normal thing to do. Regenerating it quietly is
the single most damaging thing you can do in this repository.

**You are not allowed to make the test pass by copying the new output over
the old file and moving on.** That is the failure mode this skill exists to
prevent. The test going green is not evidence of anything - you just moved
the target. The evidence is the diff, read by a human who recognises the
names.

## When to run this

- you changed anything in `backend/src/rammeslag/modules/rating/`
- you changed a constant in `constants.py`
- you added or corrected matches in `fixtures/history.json`
- `docs/RATING.md` changed (the doc is normative; the code follows it)
- CI failed on the job `rating fixture guard`

## Procedure

### 1. Know what you are about to change

```bash
git status --short fixtures/
git diff --stat origin/main -- backend/src/rammeslag/modules/rating/ fixtures/
```

If the rating module is untouched and `history.json` is untouched, but the
expected ratings still move, **stop**. Something non-deterministic has got
into the engine - dictionary iteration order, a float formatting change, a
timestamp - and that is a bug worth more than the feature you were writing.
Say so in the PR rather than regenerating.

### 2. See the damage before you accept it

Run the golden test first and read the failure:

```bash
uv run --directory backend pytest tests/test_rating_golden.py -q
```

### 3. Regenerate

```bash
uv run --directory backend pytest tests/test_rating_golden.py --snapshot-update
```

If the golden test has no update flag, regenerate by replaying the fixture
through the pure engine directly:

```bash
uv run --directory backend python - <<'PY'
import json, pathlib
from rammeslag.modules.rating.engine import compute
from rammeslag.modules.rating.schemas import MatchInput   # confirm the real import

root = pathlib.Path("../fixtures")
history = json.loads((root / "history.json").read_text())
result = compute([MatchInput(**match) for match in history])
(root / "expected_ratings.json").write_text(
    json.dumps(result.to_json(), indent=2, ensure_ascii=False, sort_keys=True) + "\n"
)
PY
```

Three rules for the written file: **sorted keys**, **a trailing newline**,
and **full float64 precision** - `docs/RATING.md` requires the snapshot to
compare bit-exact, so never round on the way in. Rounding is a display
concern, and `rating_diff.py` does it only for reading. An unstable key
order turns every future rating diff into noise, and noise is how a real
change gets waved through.

### 4. Read the movement in human terms

```bash
python .github/scripts/rating_diff.py \
  <(git show origin/main:fixtures/expected_ratings.json) \
  fixtures/expected_ratings.json
```

which prints something like:

```
## Rating change

Klaus    1204.3 -> 1216.7   +12.4
Bo    1188.0 -> 1180.0    -8.0
Mikkel  new player at 1012.5

Headline: Klaus +12, Bo -8
```

Now do the part a script cannot. Look at those names and ask whether the
story holds together:

- Does the direction make sense? If you raised `K_PROVISIONAL`, only players
  with fewer than five matches should have moved much. If a twelve-year
  veteran moved forty points, your change did something you did not intend.
- Did the **order** of the ladder change? Reordering the top three is a
  different conversation from everyone shifting by a rounding error. Say
  which, explicitly.
- Does anyone lose rating for a match they won? That breaks the property in
  `docs/RATING.md` and is a bug, not a tuning decision. Stop and fix it.
- Is the total movement plausible for the size of your change? A one-line
  constant tweak that moves every player by 200 points means you changed
  something else too.

### 5. Confirm it is green again, all the way

```bash
uv run --directory backend pytest
```

The whole suite, not just the golden test. A rating change that fixes the
snapshot but breaks a service test has broken the app, not the fixture.

### 6. Write the PR body

This is mandatory and CI enforces it. `.github/scripts/check_fixture_explained.py`
fails the PR unless the body contains a `## Rating change` heading, at least
one line naming a player and a signed delta, and a `Why:` line with an
actual explanation. Editing the PR body re-runs the check - you do not need
to push again.

Paste this, filled in:

```markdown
## Rating change

Klaus  1204.3 -> 1216.7   +12.4
Bo  1188.0 -> 1180.0    -8.0

Why: K_PROVISIONAL raised 32 -> 40 so a newcomer converges inside one
session instead of three. Only the four players under five matches moved;
the ladder order is unchanged above sixth place.
```

Good `Why:` lines name the cause and bound the effect. "Regenerated
fixtures" is not a why. "Updated snapshot after engine change" is not a why.
If you cannot say which constant or rule moved, you do not yet know what
your own diff did.

### 7. Commit the code and the fixture together

Same commit. Always. A commit where the engine changed and the fixture did
not is a commit whose tests were red, and a commit where the fixture changed
and the engine did not is a commit that rewrote history for no stated reason.

```bash
git add backend/src/rammeslag/modules/rating/ fixtures/expected_ratings.json
git commit -m "rating: raise K_PROVISIONAL to 40, regenerate golden fixture"
```

## If you are here because CI failed

The `rating fixture guard` job fails for exactly one reason: the fixture
moved and the PR body does not say who moved or why. Two honest ways out:

1. **The change was intended.** Run steps 4 and 6. Edit the PR body. Done.
2. **The change was not intended.** Something in your diff altered rating
   behaviour without you noticing - that is the guard doing its job.

```bash
git checkout origin/main -- fixtures/expected_ratings.json
uv run --directory backend pytest tests/test_rating_golden.py -q
```

If the test now fails, your code changed rating behaviour. Find out where
before you go any further. There is no third option where you delete the
job, relax the regex, or push an empty `## Rating change` section to satisfy
the pattern matcher. Defeating this check is worse than the bug it caught.
