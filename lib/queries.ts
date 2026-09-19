"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as api from "@/lib/api";
import type {
  LadderOut,
  LadderScope,
  MatchCreate,
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
} from "@/lib/types";

export const keys = {
  ladder: (scope: LadderScope, includeGuests: boolean) =>
    ["ladder", scope, includeGuests ? "with-guests" : "members"] as const,
  seasons: () => ["seasons"] as const,
  players: () => ["players"] as const,
  sessions: (seasonId?: string) => ["sessions", seasonId ?? "all"] as const,
  session: (id: string) => ["session", id] as const,
  profile: (id: string) => ["profile", id] as const,
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
