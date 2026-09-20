/**
 * The only file in the frontend that knows where data comes from.
 *
 * Live is the default, and the mock is opt-in via NEXT_PUBLIC_API_MODE=mock.
 * It used to be the other way round, which meant a deployment that simply had
 * no env var set served `lib/mock/seed.ts` -- PRNG-generated players with
 * invented ratings -- and looked entirely plausible doing it. A deployment
 * that cannot reach FastAPI should fail visibly, not quietly invent a ladder.
 *
 * Every function below speaks the contract in `lib/types.ts`, which mirrors
 * `/api/openapi.json`, and the mock answers with the same shapes.
 */

import * as mock from "@/lib/mock";
import type {
  LadderOut,
  LadderScope,
  MatchCreate,
  MatchOut,
  MeOut,
  PlayerCreate,
  PlayerOut,
  PlayerUpdate,
  ProfileOut,
  SeasonCreate,
  SeasonOut,
  SeasonUpdate,
  SessionCreate,
  SessionDetailOut,
  SessionOut,
  SessionUpdate,
} from "@/lib/types";

export const API_MODE: "mock" | "live" =
  process.env.NEXT_PUBLIC_API_MODE === "mock" ? "mock" : "live";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  if (!response.ok) {
    let detail = `Kunne ikke hente data (${response.status})`;
    try {
      // FastAPI's HTTPException detail is a string; a 422 body's detail is a
      // list of ValidationError objects, which is not something to show a
      // player — the generic message stands for those.
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error body; the generic message stands.
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const live = API_MODE === "live";

/* ---- Reads (public) ----------------------------------------------------- */

export function fetchLadder(scope: LadderScope, includeGuests = false): Promise<LadderOut> {
  return live
    ? http<LadderOut>(
        `/ladder?season=${encodeURIComponent(scope)}&include_guests=${includeGuests ? "true" : "false"}`,
      )
    : mock.getLadder(scope, includeGuests);
}

export function fetchSeasons(): Promise<SeasonOut[]> {
  return live ? http<SeasonOut[]>("/seasons") : mock.getSeasons();
}

export function fetchPlayers(): Promise<PlayerOut[]> {
  return live ? http<PlayerOut[]>("/players") : mock.getPlayers();
}

export function fetchSessions(seasonId?: string): Promise<SessionOut[]> {
  const query = seasonId && seasonId !== "all" ? `?season=${encodeURIComponent(seasonId)}` : "";
  return live ? http<SessionOut[]>(`/sessions${query}`) : mock.getSessions(seasonId);
}

export function fetchSession(id: string): Promise<SessionDetailOut> {
  return live ? http<SessionDetailOut>(`/sessions/${id}`) : mock.getSession(id);
}

export function fetchPlayerProfile(id: string): Promise<ProfileOut> {
  return live ? http<ProfileOut>(`/players/${id}`) : mock.getPlayerProfile(id);
}

/* ---- Auth ---------------------------------------------------------------
 * GET /api/auth/me is 401 when nobody is logged in — reads are public, so
 * that is the normal case and not an error the UI should show.
 * -------------------------------------------------------------------------- */

export async function fetchMe(): Promise<MeOut | null> {
  if (!live) return mock.me();
  try {
    return await http<MeOut>("/auth/me");
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) return null;
    throw cause;
  }
}

export function login(playerId: string, pin: string): Promise<MeOut> {
  return live
    ? http<MeOut>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ player_id: playerId, pin }),
      })
    : mock.login(playerId, pin);
}

export async function logout(): Promise<null> {
  if (!live) return mock.logout();
  await http<void>("/auth/logout", { method: "POST" });
  return null;
}

/* ---- Writes (need a player session) ------------------------------------- */

export function createMatch(body: MatchCreate): Promise<MatchOut> {
  return live
    ? http<MatchOut>("/matches", { method: "POST", body: JSON.stringify(body) })
    : mock.createMatch(body);
}

export function closeSession(id: string): Promise<SessionOut> {
  return live
    ? http<SessionOut>(`/sessions/${id}/close`, { method: "POST" })
    : mock.closeSession(id);
}

export function createSession(body: SessionCreate): Promise<SessionOut> {
  return live
    ? http<SessionOut>("/sessions", { method: "POST", body: JSON.stringify(body) })
    : mock.createSession(body);
}

export function updateSession(id: string, body: SessionUpdate): Promise<SessionOut> {
  return live
    ? http<SessionOut>(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    : mock.updateSession(id, body);
}

/* ---- Writes (admin) ----------------------------------------------------- */

/** Takes the evening's matches with it, and the rating they moved. */
export async function deleteSession(id: string): Promise<null> {
  if (!live) return mock.deleteSession(id);
  await http<void>(`/sessions/${id}`, { method: "DELETE" });
  return null;
}

export function createPlayer(body: PlayerCreate): Promise<PlayerOut> {
  return live
    ? http<PlayerOut>("/players", { method: "POST", body: JSON.stringify(body) })
    : mock.createPlayer(body);
}

export function updatePlayer(id: string, body: PlayerUpdate): Promise<PlayerOut> {
  return live
    ? http<PlayerOut>(`/players/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    : mock.updatePlayer(id, body);
}

export function createSeason(body: SeasonCreate): Promise<SeasonOut> {
  return live
    ? http<SeasonOut>("/seasons", { method: "POST", body: JSON.stringify(body) })
    : mock.createSeason(body);
}

export function updateSeason(id: string, body: SeasonUpdate): Promise<SeasonOut> {
  return live
    ? http<SeasonOut>(`/seasons/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    : mock.updateSeason(id, body);
}
