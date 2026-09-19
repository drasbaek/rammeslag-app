<!--
Fill this in honestly. An unchecked box is information. A checked box that is
not true is worse than no checklist at all.
-->

Closes #

## What changed

<!-- Two or three sentences. What behaviour is different now? -->

## Where

<!-- One line per file or module touched. -->

## Screenshots at 390x844

<!--
Every screen you touched, at phone size, from the Vercel preview. The
`review-on-mobile` skill takes them for you. A layout that was only ever seen
on a laptop is not done.
-->

## Definition of done

- [ ] `pytest` green, including `test_rating_golden.py`
- [ ] lint and typecheck clean on both sides
- [ ] screenshots at 390x844 of every screen touched, attached above
- [ ] user-visible strings in Danish
- [ ] no change to `fixtures/expected_ratings.json` unless this body explains it

## Rating change

<!--
DELETE THIS SECTION if fixtures/expected_ratings.json is untouched.

If it changed, CI will not let this merge until the section below names who
moved and why. That is deliberate: that file is the team's real rating
history, and a diff nobody explained silently reorders the ladder.

Generate the block with the `regenerate-fixture` skill, or:

    python .github/scripts/rating_diff.py \
      <(git show origin/main:fixtures/expected_ratings.json) \
      fixtures/expected_ratings.json

Klaus  1204.3 -> 1216.7   +12.4
Bo  1188.0 -> 1180.0    -8.0

Why: <which constant or rule moved, and why that is correct>
-->

## Not done / needs a human

<!-- Anything you could not verify. Say it plainly. -->
