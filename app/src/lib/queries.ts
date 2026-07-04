import { supabase } from "./supabaseClient";
import type {
  Tournament,
  Player,
  Round,
  RoundHole,
  HoleScore,
  RoundResult,
  TeamStanding,
  PlayerCareerStats,
} from "../types/database";

// ── Tournaments ──

export async function getTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .order("year", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTournamentByYear(year: number): Promise<Tournament> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("year", year)
    .single();
  if (error) throw error;
  return data;
}

export async function getAllTeamStandings(): Promise<TeamStanding[]> {
  const { data, error } = await supabase.from("v_team_standings").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function getTeamStandings(tournamentId: number): Promise<TeamStanding[]> {
  const { data, error } = await supabase
    .from("v_team_standings")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("total_points", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface RosterEntry {
  team_id: number;
  team_name: string;
  player_id: number;
  display_name: string;
}

export async function getTeamRoster(tournamentId: number): Promise<RosterEntry[]> {
  const { data, error } = await supabase
    .from("team_memberships")
    .select("team_id, teams(team_name), players(player_id, display_name)")
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    team_id: row.team_id,
    team_name: row.teams?.team_name ?? "Unknown Team",
    player_id: row.players?.player_id,
    display_name: row.players?.display_name ?? "Unknown Player",
  }));
}

export interface RoundListItem extends Round {
  course_name: string;
}

export async function getRoundsForTournament(tournamentId: number): Promise<RoundListItem[]> {
  const { data, error } = await supabase
    .from("rounds")
    .select("*, courses(course_name)")
    .eq("tournament_id", tournamentId)
    .order("round_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row, course_name: row.courses?.course_name ?? "Unknown Course" }));
}

// ── Rounds / Matches ──

export interface RoundDetailInfo extends Round {
  course_name: string;
  format_name: string;
  scoring_style: string;
  grouping_size: number;
}

export async function getRound(roundId: number): Promise<RoundDetailInfo> {
  const { data, error } = await supabase
    .from("rounds")
    .select("*, courses(course_name), game_formats(format_name, scoring_style, grouping_size)")
    .eq("round_id", roundId)
    .single();
  if (error) throw error;
  const row = data as any;
  return {
    ...row,
    course_name: row.courses?.course_name ?? "Unknown Course",
    format_name: row.game_formats?.format_name ?? "Unknown Format",
    scoring_style: row.game_formats?.scoring_style ?? "stroke_play",
    grouping_size: row.game_formats?.grouping_size ?? 1,
  };
}

export interface MatchParticipantSummary {
  player_id: number;
  display_name: string;
  team_id: number;
  result: RoundResult | null;
}

export interface MatchSummary {
  match_id: number;
  match_number: number;
  team_name: string | null;
  participants: MatchParticipantSummary[];
}

// matches / match_participants have no direct FK to round_results (both key
// off match_id + player_id independently), so round_results is fetched
// separately and merged client-side rather than embedded in one PostgREST query.
export async function getMatchesForRound(roundId: number): Promise<MatchSummary[]> {
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("match_id, match_number, teams(team_name), match_participants(player_id, team_id, players(display_name))")
    .eq("round_id", roundId)
    .order("match_number", { ascending: true });
  if (matchErr) throw matchErr;

  const matchIds = (matches ?? []).map((m: any) => m.match_id);
  const { data: results, error: resultsErr } = matchIds.length
    ? await supabase.from("round_results").select("*").in("match_id", matchIds)
    : { data: [] as RoundResult[], error: null };
  if (resultsErr) throw resultsErr;

  const resultKey = (matchId: number, playerId: number) => `${matchId}_${playerId}`;
  const resultMap = new Map<string, RoundResult>();
  for (const r of results ?? []) resultMap.set(resultKey(r.match_id, r.player_id), r);

  return (matches ?? []).map((m: any) => ({
    match_id: m.match_id,
    match_number: m.match_number,
    team_name: m.teams?.team_name ?? null,
    participants: (m.match_participants ?? []).map((p: any) => ({
      player_id: p.player_id,
      display_name: p.players?.display_name ?? "Unknown",
      team_id: p.team_id,
      result: resultMap.get(resultKey(m.match_id, p.player_id)) ?? null,
    })),
  }));
}

export interface MatchDetailInfo {
  match_id: number;
  match_number: number;
  round_id: number;
  tournament_year: number;
  course_name: string;
  event_name: string;
  participants: MatchParticipantSummary[];
}

export async function getMatch(matchId: number): Promise<MatchDetailInfo> {
  const { data, error } = await supabase
    .from("matches")
    .select(
      "match_id, match_number, round_id, rounds(event_name, tournaments(year), courses(course_name)), match_participants(player_id, team_id, players(display_name))"
    )
    .eq("match_id", matchId)
    .single();
  if (error) throw error;
  const row = data as any;

  const { data: results, error: resultsErr } = await supabase
    .from("round_results")
    .select("*")
    .eq("match_id", matchId);
  if (resultsErr) throw resultsErr;
  const resultMap = new Map<number, RoundResult>();
  for (const r of results ?? []) resultMap.set(r.player_id, r);

  return {
    match_id: row.match_id,
    match_number: row.match_number,
    round_id: row.round_id,
    tournament_year: row.rounds?.tournaments?.year,
    course_name: row.rounds?.courses?.course_name ?? "Unknown Course",
    event_name: row.rounds?.event_name ?? "",
    participants: (row.match_participants ?? []).map((p: any) => ({
      player_id: p.player_id,
      display_name: p.players?.display_name ?? "Unknown",
      team_id: p.team_id,
      result: resultMap.get(p.player_id) ?? null,
    })),
  };
}

export async function getRoundHoles(roundId: number): Promise<RoundHole[]> {
  const { data, error } = await supabase
    .from("round_holes")
    .select("*")
    .eq("round_id", roundId)
    .order("hole_no", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getHoleScoresForMatch(matchId: number): Promise<HoleScore[]> {
  const { data, error } = await supabase
    .from("hole_scores")
    .select("*")
    .eq("match_id", matchId)
    .order("hole_no", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Players ──

export async function getPlayers(): Promise<Player[]> {
  const { data, error } = await supabase.from("players").select("*").order("display_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPlayer(playerId: number): Promise<Player> {
  const { data, error } = await supabase.from("players").select("*").eq("player_id", playerId).single();
  if (error) throw error;
  return data;
}

export async function getPlayerCareerStats(): Promise<PlayerCareerStats[]> {
  const { data, error } = await supabase.from("v_player_career_stats").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function getPlayerCareerStat(playerId: number): Promise<PlayerCareerStats | null> {
  const { data, error } = await supabase
    .from("v_player_career_stats")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface PlayerYearSummary {
  year: number;
  tournament_id: number;
  tournament_points: number;
}

export async function getPlayerHistory(playerId: number): Promise<PlayerYearSummary[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select("tournament_points, matches(rounds(tournament_id, tournaments(year)))")
    .eq("player_id", playerId);
  if (error) throw error;

  const byYear = new Map<number, PlayerYearSummary>();
  for (const row of (data ?? []) as any[]) {
    const year = row.matches?.rounds?.tournaments?.year;
    const tournamentId = row.matches?.rounds?.tournament_id;
    if (!year) continue;
    const existing = byYear.get(year);
    const points = row.tournament_points ?? 0;
    if (existing) existing.tournament_points += points;
    else byYear.set(year, { year, tournament_id: tournamentId, tournament_points: points });
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}
