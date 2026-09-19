"""The request-scoped database session.

This file exists because of a bug that reached production: ``get_db`` yielded
a session and closed it without committing. Services flush, so a route saw its
own object and returned 201 -- and then the session closed and rolled the whole
thing back. Every write the app made was silently discarded while the API
reported success.

The suite did not catch it. In-memory SQLite with a StaticPool shares ONE
connection between every session, so uncommitted writes are visible to the next
session anyway and every assertion passed.

So these tests drive the dependency directly rather than through a database
whose isolation can hide the answer.
"""

from __future__ import annotations

import pytest

from rammeslag import deps


class _FakeSession:
    def __init__(self) -> None:
        self.committed = 0
        self.rolled_back = 0
        self.closed = 0

    def commit(self) -> None:
        self.committed += 1

    def rollback(self) -> None:
        self.rolled_back += 1

    def close(self) -> None:
        self.closed += 1


@pytest.fixture
def fake_session(monkeypatch) -> _FakeSession:
    session = _FakeSession()
    monkeypatch.setattr(deps, "get_sessionmaker", lambda: (lambda: session))
    return session


def test_a_successful_request_commits(fake_session: _FakeSession) -> None:
    gen = deps.get_db()
    assert next(gen) is fake_session
    with pytest.raises(StopIteration):
        next(gen)

    assert fake_session.committed == 1, "without this, every write is thrown away"
    assert fake_session.rolled_back == 0
    assert fake_session.closed == 1


def test_a_failed_request_rolls_back(fake_session: _FakeSession) -> None:
    gen = deps.get_db()
    next(gen)
    with pytest.raises(RuntimeError):
        gen.throw(RuntimeError("boom"))

    assert fake_session.committed == 0
    assert fake_session.rolled_back == 1, "a half-written request must not persist"
    assert fake_session.closed == 1


def test_the_session_is_always_closed(fake_session: _FakeSession) -> None:
    gen = deps.get_db()
    next(gen)
    gen.close()
    assert fake_session.closed == 1
