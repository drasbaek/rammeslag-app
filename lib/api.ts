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
  EventCreate,
  EventDetailOut,
  EventOut,
  EventScope,
  EventUpdate,
  GuestCreate,
  LadderOut,
  LadderScope,
  MatchCreate,
  MatchOut,
  MatchupsIn,
  MeOut,
  PlayerCreate,
  PlayerOut,
  PlayerUpdate,
  ProfileOut,
  ResponseState,
  SeasonCreate,
  SeasonOut,
  SeasonUpdate,
  SelectionIn,
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

/**
 * Upcoming by default, because the question the program tab answers is "what
 * is next". Today counts as upcoming: an event is not history until the day
 * is over, and the server decides that in Copenhagen time rather than the
 * phone's.
 */
export function fetchEvents(scope: EventScope = "upcoming", type?: "match" | "training") {
  const params = new URLSearchParams({ scope });
  if (type) params.set("type", type);
  return live ? http<EventOut[]>(`/events?${params}`) : mock.getEvents(scope, type);
}

export function fetchEvent(id: string): Promise<EventDetailOut> {
  return live ? http<EventDetailOut>(`/events/${id}`) : mock.getEvent(id);
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

/** Your own answer. Klar, ikke klar, ved ikke. */
export function setMyResponse(eventId: string, state: ResponseState): Promise<EventOut> {
  return live
    ? http<EventOut>(`/events/${eventId}/response`, {
        method: "PUT",
        body: JSON.stringify({ state }),
      })
    : mock.setMyResponse(eventId, state);
}

/** Someone else's: a guest you are bringing, or anyone at all if you are admin. */
export function setResponseFor(
  eventId: string,
  playerId: string,
  state: ResponseState,
): Promise<EventOut> {
  return live
    ? http<EventOut>(`/events/${eventId}/response/${playerId}`, {
        method: "PUT",
        body: JSON.stringify({ state }),
      })
    : mock.setResponseFor(eventId, playerId, state);
}

/** Back to no answer — and how a guest comes off the list again. */
export function clearResponse(eventId: string, playerId: string): Promise<EventOut> {
  return live
    ? http<EventOut>(`/events/${eventId}/response/${playerId}`, { method: "DELETE" })
    : mock.clearResponse(eventId, playerId);
}

export function createGuest(body: GuestCreate): Promise<PlayerOut> {
  return live
    ? http<PlayerOut>("/players/guest", { method: "POST", body: JSON.stringify(body) })
    : mock.createGuest(body);
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

export function createEvent(body: EventCreate): Promise<EventOut> {
  return live
    ? http<EventOut>("/events", { method: "POST", body: JSON.stringify(body) })
    : mock.createEvent(body);
}

export function updateEvent(id: string, body: EventUpdate): Promise<EventOut> {
  return live
    ? http<EventOut>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(body) })
    : mock.updateEvent(id, body);
}

export async function deleteEvent(id: string): Promise<null> {
  if (!live) return mock.deleteEvent(id);
  await http<void>(`/events/${id}`, { method: "DELETE" });
  return null;
}

/** The squad, replaced wholesale. Picking is a decision, not a stream of edits. */
export function setSelection(id: string, body: SelectionIn): Promise<EventDetailOut> {
  return live
    ? http<EventDetailOut>(`/events/${id}/selection`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
    : mock.setSelection(id, body);
}

/** The plan, replaced wholesale. A whiteboard: none of this becomes a match. */
export function setMatchups(id: string, body: MatchupsIn): Promise<EventDetailOut> {
  return live
    ? http<EventDetailOut>(`/events/${id}/matchups`, { method: "PUT", body: JSON.stringify(body) })
    : mock.setMatchups(id, body);
}

/**
 * Open the evening a training's results go into. Creates an empty session —
 * who actually played is still decided by the matches typed into it.
 */
export function createSessionForEvent(id: string): Promise<SessionOut> {
  return live
    ? http<SessionOut>(`/events/${id}/session`, { method: "POST" })
    : mock.createSessionForEvent(id);
}
