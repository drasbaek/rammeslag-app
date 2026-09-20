"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as api from "@/lib/api";
import type {
  EventCreate,
  EventDetailOut,
  EventOut,
  EventScope,
  EventType,
  EventUpdate,
  GuestCreate,
  LadderOut,
  LadderScope,
  MatchCreate,
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

export const keys = {
  ladder: (scope: LadderScope, includeGuests: boolean) =>
    ["ladder", scope, includeGuests ? "with-guests" : "members"] as const,
  seasons: () => ["seasons"] as const,
  players: () => ["players"] as const,
  sessions: (seasonId?: string) => ["sessions", seasonId ?? "all"] as const,
  session: (id: string) => ["session", id] as const,
  profile: (id: string) => ["profile", id] as const,
  events: (scope: EventScope, type?: EventType) =>
    ["events", scope, type ?? "begge"] as const,
  event: (id: string) => ["event", id] as const,
  me: () => ["me"] as const,
};

export function useLadder(scope: LadderScope, includeGuests: boolean): UseQueryResult<LadderOut> {
  return useQuery({
    queryKey: keys.ladder(scope, includeGuests),
    queryFn: () => api.fetchLadder(scope, includeGuests),
    placeholderData: (previous) => previous,
  });
}

export function useSeasons(): UseQueryResult<SeasonOut[]> {
  return useQuery({ queryKey: keys.seasons(), queryFn: api.fetchSeasons, staleTime: 5 * 60_000 });
}

export function usePlayers(): UseQueryResult<PlayerOut[]> {
  return useQuery({ queryKey: keys.players(), queryFn: api.fetchPlayers, staleTime: 5 * 60_000 });
}

export function useSessions(seasonId?: string): UseQueryResult<SessionOut[]> {
  return useQuery({ queryKey: keys.sessions(seasonId), queryFn: () => api.fetchSessions(seasonId) });
}

export function useSession(id: string): UseQueryResult<SessionDetailOut> {
  return useQuery({ queryKey: keys.session(id), queryFn: () => api.fetchSession(id), enabled: Boolean(id) });
}

export function usePlayerProfile(id: string): UseQueryResult<ProfileOut> {
  return useQuery({ queryKey: keys.profile(id), queryFn: () => api.fetchPlayerProfile(id), enabled: Boolean(id) });
}

export function useMe(): UseQueryResult<MeOut | null> {
  return useQuery({ queryKey: keys.me(), queryFn: api.fetchMe, staleTime: 60_000 });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ playerId, pin }: { playerId: string; pin: string }) => api.login(playerId, pin),
    onSuccess: (me) => client.setQueryData(keys.me(), me),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: (me) => client.setQueryData(keys.me(), me),
  });
}

export function useCreateMatch(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MatchCreate) => api.createMatch(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.session(sessionId) });
      void client.invalidateQueries({ queryKey: ["ladder"] });
      void client.invalidateQueries({ queryKey: ["sessions"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useCreatePlayer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PlayerCreate) => api.createPlayer(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.players() });
      void client.invalidateQueries({ queryKey: ["ladder"] });
    },
  });
}

export function useUpdatePlayer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PlayerUpdate }) =>
      api.updatePlayer(id, body),
    onSuccess: () => {
      // An entry rating edit re-writes the replay, so everything derived moves.
      void client.invalidateQueries({ queryKey: keys.players() });
      void client.invalidateQueries({ queryKey: ["ladder"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
      void client.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

export function useCreateSeason() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SeasonCreate) => api.createSeason(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.seasons() });
      // A new season changes which window the ladder and the session list
      // group by, so neither can keep what it had.
      void client.invalidateQueries({ queryKey: ["ladder"] });
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useUpdateSeason() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SeasonUpdate }) => api.updateSeason(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.seasons() });
      void client.invalidateQueries({ queryKey: ["ladder"] });
      void client.invalidateQueries({ queryKey: ["sessions"] });
      // Moving a season's dates moves which sessions fall inside it, and the
      // profile's per-season numbers with them.
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useCreateSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionCreate) => api.createSession(body),
    // The caller navigates straight into the new session's entry screen, so
    // the list behind it has to know the evening exists before it is read.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

/**
 * Editing an evening can move it to another date and another season, and the
 * rating replay runs in date order — so a corrected session moves everybody's
 * numbers, not just its own row. Everything derived is dropped.
 */
export function useUpdateSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionUpdate) => api.updateSession(sessionId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.session(sessionId) });
      void client.invalidateQueries({ queryKey: ["sessions"] });
      void client.invalidateQueries({ queryKey: ["ladder"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

/** Deleting takes the evening's matches with it, so the whole board is replayed. */
export function useDeleteSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteSession(sessionId),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.session(sessionId) });
      void client.invalidateQueries({ queryKey: ["sessions"] });
      void client.invalidateQueries({ queryKey: ["ladder"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useCloseSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.closeSession(sessionId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.session(sessionId) });
      void client.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}


/* ---- Events -------------------------------------------------------------
 * Answering is the one write in this app that people do casually, standing in
 * a queue, several at once. So every mutation below writes the event straight
 * into the cache from the response rather than refetching: the toggle lands
 * instantly and the tally is the server's, not a guess.
 * -------------------------------------------------------------------------- */

export function useEvents(
  scope: EventScope = "upcoming",
  type?: EventType,
): UseQueryResult<EventOut[]> {
  return useQuery({
    queryKey: keys.events(scope, type),
    queryFn: () => api.fetchEvents(scope, type),
    placeholderData: (previous) => previous,
  });
}

export function useEvent(id: string): UseQueryResult<EventDetailOut> {
  return useQuery({
    queryKey: keys.event(id),
    queryFn: () => api.fetchEvent(id),
    enabled: Boolean(id),
  });
}

/**
 * An answer changes the tally on the row AND the detail screen, and the two
 * are separate queries. The response carries the fresh counts, so the list is
 * patched in place and only the detail — which also carries the per-player
 * rows — is refetched.
 */
function patchEvent(client: ReturnType<typeof useQueryClient>, event: EventOut): void {
  client.setQueriesData<EventOut[]>({ queryKey: ["events"] }, (previous) =>
    previous?.map((row) => (row.id === event.id ? { ...row, ...event } : row)),
  );
  void client.invalidateQueries({ queryKey: keys.event(event.id) });
}

export function useSetMyResponse(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (state: ResponseState) => api.setMyResponse(eventId, state),
    onSuccess: (event) => patchEvent(client, event),
  });
}

/** A guest you are bringing, or — if you are an admin — anyone at all. */
export function useSetResponseFor(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ playerId, state }: { playerId: string; state: ResponseState }) =>
      api.setResponseFor(eventId, playerId, state),
    onSuccess: (event) => patchEvent(client, event),
  });
}

export function useClearResponse(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (playerId: string) => api.clearResponse(eventId, playerId),
    onSuccess: (event) => patchEvent(client, event),
  });
}

export function useCreateEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: EventCreate) => api.createEvent(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

/** Re-dating an event can move it between seasons and in and out of "upcoming". */
export function useUpdateEvent(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: EventUpdate) => api.updateEvent(eventId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["events"] });
      void client.invalidateQueries({ queryKey: keys.event(eventId) });
    },
  });
}

export function useDeleteEvent(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteEvent(eventId),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.event(eventId) });
      void client.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useSetSelection(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SelectionIn) => api.setSelection(eventId, body),
    onSuccess: (detail) => {
      client.setQueryData(keys.event(eventId), detail);
      void client.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useSetMatchups(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MatchupsIn) => api.setMatchups(eventId, body),
    // A plan, not a result. Nothing derived from matches can have moved, so
    // the ladder and the sessions are deliberately left alone.
    onSuccess: (detail) => client.setQueryData(keys.event(eventId), detail),
  });
}

/** Any logged-in player, not just an admin. */
export function useCreateGuest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: GuestCreate) => api.createGuest(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.players() });
    },
  });
}

/**
 * Opens the evening a training's results go into. The new session shows up in
 * the history list, and the event now points at it.
 */
export function useCreateSessionForEvent(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.createSessionForEvent(eventId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["sessions"] });
      void client.invalidateQueries({ queryKey: keys.event(eventId) });
      void client.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
