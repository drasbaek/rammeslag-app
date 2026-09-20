/**
 * Wire types for the Rammeslag FC API.
 *
 * These mirror the OpenAPI schema FastAPI emits at `/api/openapi.json`, field
 * for field, including the `*Out` names Pydantic gives them. The backend owns
 * these shapes: there is exactly one description of them in the frontend, and
 * nothing anywhere translates them into something more convenient. When the
 * backend moves, this file moves with it and the compiler finds the readers.
 *
 * Only two things here are narrower than the raw schema, and both are
 * enumerated in the backend rather than free text:
 * `Verdict` (matches/service.py WIN/LOSS/DRAW) and `TeamSide`
 * (matches/service.py TEAM_A/TEAM_B/TEAM_NONE).
 */

export type PlayerId = string;
export type SeasonId = string;
export type SessionId = string;
export type MatchId = string;

export type EventId = string;

export type SessionType = "training" | "casual" | "social" | "tournament";
export type SessionStatus = "open" | "closed";
export type MatchSource = "internal" | "rankedin";

/**
 * A `match` is a league fixture against another club: availability and a
 * squad, never a score. A `training` is a Sunday, and the only one of the
 * two that ever turns into a session with results.
 */
export type EventType = "match" | "training";

/** `locked`: the squad is picked and only an admin still edits. */
export type EventStatus = "open" | "locked" | "cancelled";

/** Klar, ikke klar, ved ikke. No answer at all is the absence of a row. */
export type ResponseState = "yes" | "no" | "maybe";

/** `scope` on GET /api/events. Today counts as upcoming. */
export type EventScope = "upcoming" | "past" | "all";

/** Verdict by total games won. See docs/RATING.md, "Derived views". */
export type Verdict = "W" | "L" | "D";

/** Winner of a match or a set. "D" means neither side. */
export type TeamSide = "A" | "B" | "D";

/**
 * `season` query parameter for GET /api/ladder: a season id, or "all".
 * A request parameter, not a wire field.
 */
export type LadderScope = "all" | SeasonId;

/**
 * Below this many CAREER matches a rating is still settling. Mirrors
 * `rating/constants.py PROVISIONAL_MATCHES`. The ladder response carries the
 * same number as `threshold` and that is what the ladder screens read; this
 * constant is the fallback for screens the API does not hand a threshold to
 * (the profile).
 */
export const PROVISIONAL_MATCHES = 5;

/* ---- Players ------------------------------------------------------------ */

export interface PlayerOut {
  id: PlayerId;
  name: string;
  /**
   * Guests are people who turned up once to be measured. Members are the team.
   * The ladder shows members only unless you ask for guests.
   */
  is_guest: boolean;
  /**
   * Rating the player starts from, set by an admin's judgement when they are
   * added. Somebody joining an established field is not a 1000-rated player.
   */
  entry_rating: number;
}

/** GET /api/auth/me and POST /api/auth/login. PlayerOut plus the admin flag. */
export interface MeOut extends PlayerOut {
  is_admin: boolean;
}

/* ---- Seasons ------------------------------------------------------------ */

export interface SeasonOut {
  id: SeasonId;
  name: string;
  /** ISO date, YYYY-MM-DD */
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

/** The two fields anything nested inside another response gets. */
export interface SeasonRef {
  id: SeasonId;
  name: string;
}

/* ---- Ladder ------------------------------------------------------------- */

export interface LadderEntryOut {
  /** 1..n across everyone in this response. Provisional players are ranked too. */
  rank: number;
  player_id: PlayerId;
  name: string;
  is_guest: boolean;
  /** All-time rating. Never resets. */
  rating: number;
  /** Rating gained inside the scope. Equals rating - entry_rating for "all". */
  rating_gained: number;
  /** Matches inside the scope. */
  matches_played: number;
  /** Career total across every season — what `threshold` is measured against. */
  career_matches: number;
  /** Inside the scope. On a season board these are season-only numbers. */
  wins: number;
  losses: number;
  draws: number;
  /**
   * The all-time record, across every season. Equal to `wins`/`losses`/`draws`
   * on the all-time board and different from them on every season board, which
   * is why a row that wants to show a career record has to read these.
   */
  career_wins: number;
  career_losses: number;
  career_draws: number;
  /** Last five verdicts, oldest first. */
  form: Verdict[];
  /** Has appeared in a match in the current season. Display only — never a filter. */
  active: boolean;
  /** career_matches < threshold: ranked, but the number is still settling. */
  provisional: boolean;
  /** Rank before the most recent session, or null when new to the scope. */
  previous_rank: number | null;
  /** previous_rank - rank. Positive means climbed. */
  movement: number | null;
}

export interface LadderOut {
  /** "season" ranks by rating gained inside the window; "all" by absolute rating. */
  mode: "all" | "season";
  season: SeasonRef | null;
  /** Career match count below which an entry is flagged provisional. */
  threshold: number;
  /** Whether guests are included in `entries`. */
  includes_guests: boolean;
  /** How many guests this response left out, so the toggle can say so. */
  guest_count: number;
  entries: LadderEntryOut[];
}

/* ---- Matches ------------------------------------------------------------ */

export interface SetOut {
  set_number: number;
  games_a: number;
  games_b: number;
  /** Display-only set verdict. Never feeds the rating. */
  winner: TeamSide;
}

export interface MatchOut {
  id: MatchId;
  session_id: SessionId;
  /** ISO datetime */
  played_at: string;
  source: MatchSource;
  team_a: PlayerOut[];
  team_b: PlayerOut[];
  sets: SetOut[];
  /** Sum over sets. Derived, never stored. */
  games_a: number;
  games_b: number;
  winner: TeamSide;
  /** Rating change for this match, by player id. */
  deltas: Record<PlayerId, number>;
}

/* ---- Sessions ----------------------------------------------------------- */

export interface SessionOut {
  id: SessionId;
  season: SeasonRef;
  /** ISO date */
  played_on: string;
  type: SessionType;
  status: SessionStatus;
  note: string | null;
  match_count: number;
}

/** One recap line. `delta` is rating moved inside the session. */
export interface PlayerDeltaOut {
  player_id: PlayerId;
  name: string;
  delta: number;
  /** Rating as the board stood right after this session. */
  rating: number;
}

export interface RecapOut {
  /** Aftenens raket. */
  biggest_riser: PlayerDeltaOut | null;
  /** Aftenens fald. */
  biggest_faller: PlayerDeltaOut | null;
  /** Bundproppen: lowest-rated active player after the evening. */
  bundprop: PlayerDeltaOut | null;
}

export interface SessionDetailOut {
  id: SessionId;
  season: SeasonRef;
  played_on: string;
  type: SessionType;
  status: SessionStatus;
  note: string | null;
  matches: MatchOut[];
  recap: RecapOut;
}

/* ---- Events -------------------------------------------------------------
 * The things people answer BEFORE they happen. A session is retrospective —
 * an evening defined by the matches played on it — and an event is the
 * opposite, which is why they are different resources.
 * -------------------------------------------------------------------------- */

/** Four players to a court. A training's capacity is baner x this. */
export const COURT_CAPACITY = 4;

export interface EventCountsOut {
  yes: number;
  no: number;
  maybe: number;
  /** Members with no answer at all. Guests are never counted: nobody asked them. */
  unanswered: number;
}

export interface EventOut {
  id: EventId;
  season: SeasonRef;
  type: EventType;
  /** ISO date */
  held_on: string;
  /** "HH:MM:SS", Copenhagen wall clock. */
  start_time: string;
  venue: string;
  /** Fixtures only. Always null for a training. */
  opponent: string | null;
  /** Player slots: a squad of six, or baner x 4. */
  capacity: number;
  status: EventStatus;
  note: string | null;
  /** Set once a training's results have somewhere to go. */
  session_id: SessionId | null;
  counts: EventCountsOut;
  /**
   * How many an admin has picked. Deliberately separate from `counts.yes`:
   * being available is not being selected, and nothing derives one from the
   * other.
   */
  selected_count: number;
  /** `counts.yes - capacity`. The old spreadsheet's bottom row. */
  surplus: number;
  /** Your own answer, or null when you have not answered or are logged out. */
  my_state: ResponseState | null;
}

export interface EventResponseOut {
  player: PlayerOut;
  state: ResponseState;
  /**
   * Who wrote the answer. Differs from `player.id` whenever somebody answered
   * on another person's behalf: the member who brought a guest, or an admin
   * recording an answer that only ever arrived in the group chat.
   */
  added_by: PlayerId | null;
  /** ISO datetime */
  updated_at: string;
}

/** A planned line-up. Never a result — these do not become matches by themselves. */
export interface EventMatchupOut {
  round: number;
  court: number;
  /** Exactly two each. */
  team_a: PlayerOut[];
  team_b: PlayerOut[];
}

export interface EventDetailOut extends EventOut {
  responses: EventResponseOut[];
  /** Members still to be heard from. */
  unanswered: PlayerOut[];
  selected: PlayerOut[];
  matchups: EventMatchupOut[];
}

/* ---- Profile ------------------------------------------------------------ */

export interface CurvePoint {
  match_id: MatchId;
  /** ISO datetime */
  played_at: string;
  rating: number;
}

/** Partner and opponent records always carry their sample size in `matches`. */
export interface PairStatOut {
  player_id: PlayerId;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  /** 0..1 */
  win_rate: number;
}

export interface SeasonStatOut {
  season_id: SeasonId;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  rating_gained: number;
  /** Placing among members. Null if the player did not play in the season. */
  rank: number | null;
  /** The same placing, measured over everyone who played — guests included. */
  rank_with_guests: number | null;
}

export interface HighlightsOut {
  best_partner: PairStatOut | null;
  worst_partner: PairStatOut | null;
  favourite_victim: PairStatOut | null;
  nemesis: PairStatOut | null;
  most_played_partner: PairStatOut | null;
  most_played_opponent: PairStatOut | null;
  /** Matches a pair needs before a highlight will name them. */
  min_sample: number;
}

export interface ProfileOut {
  player: PlayerOut;
  rating: number;
  /** The rating the replay seeded this player from. */
  start_rating: number;
  /**
   * Placing among MEMBERS — the ladder's own ranking, and null for a guest,
   * who has no standing on the team's ladder.
   */
  rank: number | null;
  /** The placing over the whole field that ever turned up. Always a number. */
  rank_with_guests: number | null;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  form: Verdict[];
  active: boolean;
  /** Rating after each match, oldest first. No entry-rating point. */
  curve: CurvePoint[];
  seasons: SeasonStatOut[];
  partners: PairStatOut[];
  opponents: PairStatOut[];
  highlights: HighlightsOut;
}

/* ---- Writes ------------------------------------------------------------- */

export interface LoginRequest {
  player_id: PlayerId;
  pin: string;
}

export interface SetIn {
  games_a: number;
  games_b: number;
}

export interface MatchCreate {
  session_id: SessionId;
  /** Exactly two ids. */
  team_a: PlayerId[];
  team_b: PlayerId[];
  /** One to three sets. `played_at` is stamped by the server, never sent. */
  sets: SetIn[];
}

export interface SessionCreate {
  /** ISO date. The season is resolved server-side from the date. */
  played_on: string;
  type?: SessionType;
  note?: string | null;
}

/**
 * PATCH /api/sessions/{id}. Every field is optional and an omitted one is left
 * alone. Re-dating an evening moves its matches with it, so the ladder is
 * replayed in the order the nights actually happened.
 */
export interface SessionUpdate {
  played_on?: string;
  type?: SessionType;
  /** An empty string clears the note. */
  note?: string;
}

/** POST /api/seasons. Dates are inclusive on both ends and may not overlap. */
export interface SeasonCreate {
  name: string;
  /** ISO date, YYYY-MM-DD */
  starts_on: string;
  ends_on: string;
}

/** PATCH /api/seasons/{id}. Omitted means unchanged. */
export interface SeasonUpdate {
  name?: string;
  starts_on?: string;
  ends_on?: string;
}

/** POST /api/events. Admin. The season is resolved server-side from the date. */
export interface EventCreate {
  type: EventType;
  /** ISO date */
  held_on: string;
  /** "HH:MM" or "HH:MM:SS" */
  start_time: string;
  /** Omitted means Pakhus77 for a training; a fixture has to say. */
  venue?: string;
  /** Fixtures only; ignored for a training. */
  opponent?: string | null;
  /** Omitted means six for a fixture, twelve (three baner) for a training. */
  capacity?: number;
  note?: string | null;
}

/** PATCH /api/events/{id}. Admin. Omitted means unchanged. */
export interface EventUpdate {
  held_on?: string;
  start_time?: string;
  venue?: string;
  opponent?: string | null;
  capacity?: number;
  status?: EventStatus;
  /** An empty string clears the note. */
  note?: string;
}

/** PUT /api/events/{id}/response. */
export interface ResponseIn {
  state: ResponseState;
}

/** PUT /api/events/{id}/selection. The whole squad, written as one decision. */
export interface SelectionIn {
  player_ids: PlayerId[];
}

export interface MatchupIn {
  round: number;
  court: number;
  /** Exactly two each, and all four distinct. */
  team_a: PlayerId[];
  team_b: PlayerId[];
}

/** PUT /api/events/{id}/matchups. The whole plan, written as one decision. */
export interface MatchupsIn {
  matchups: MatchupIn[];
}

/**
 * POST /api/players/guest. Any logged-in player, not just an admin.
 *
 * A route of its own rather than an opening-up of POST /players: all it can
 * ever create is a guest with no PIN and no admin flag, entering at the seed
 * rating because nobody has judged them yet.
 */
export interface GuestCreate {
  name: string;
}

export interface PlayerCreate {
  name: string;
  /** Required. There is deliberately no default — an admin must decide. */
  entry_rating: number;
  is_guest?: boolean;
  is_admin?: boolean;
  pin?: string | null;
}

export interface PlayerUpdate {
  name?: string;
  is_guest?: boolean;
  entry_rating?: number;
  is_admin?: boolean;
  pin?: string | null;
}

export interface ApiErrorBody {
  detail: string;
}
