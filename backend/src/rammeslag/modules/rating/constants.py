"""The six rating constants from docs/RATING.md.

They live here and nowhere else. Changing any of them requires regenerating
fixtures/expected_ratings.json in the same commit.
"""

from __future__ import annotations

#: Rating every player starts at.
SEED_RATING = 1000.0

#: K-factor once a player is out of their provisional matches.
K_STANDARD = 28.0

#: K-factor while a player is still provisional. Held at twice K_STANDARD so a
#: newcomer converges inside their first evening.
K_PROVISIONAL = 56.0

#: Number of matches a player is provisional for.
PROVISIONAL_MATCHES = 5

#: Weight of the margin-of-victory term in
#: `1 + MOV_SCALE * max(0, won - lost) / total`.
MOV_SCALE = 1.75

#: Points of rating difference per factor-of-ten in expected score.
ELO_SCALE = 400.0
