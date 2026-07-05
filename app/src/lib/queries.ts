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

// ── Analytics ──

export interface TeamRoundPoints {
  round_number: number;
  team_id: number;
  team_name: string;
  points: number;
}

// Points-by-round per team, for a tournament's "how the lead changed" chart.
// Teammates on a shared-award match all carry the same tournament_points value
// (same caveat as v_team_standings), so matches are deduped by (match_id, team_id)
// before summing — otherwise a 4-man team's award gets counted 4x.
export async function getTeamPointsByRound(tournamentId: number): Promise<TeamRoundPoints[]> {
  const { data: rounds, error: roundsErr } = await supabase
    .from("rounds")
    .select("round_id, round_number")
    .eq("tournament_id", tournamentId)
    .order("round_number", { ascending: true });
  if (roundsErr) throw roundsErr;
  const roundIds = (rounds ?? []).map((r) => r.round_id);
  if (roundIds.length === 0) return [];
  const roundNumberByRoundId = new Map((rounds ?? []).map((r) => [r.round_id, r.round_number]));

  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select("match_id, round_id, match_participants(player_id, team_id)")
    .in("round_id", roundIds);
  if (matchesErr) throw matchesErr;

  const matchIds = (matches ?? []).map((m: any) => m.match_id);
  const { data: results, error: resultsErr } = matchIds.length
    ? await supabase.from("round_results").select("match_id, player_id, tournament_points").in("match_id", matchIds)
    : { data: [], error: null };
  if (resultsErr) throw resultsErr;

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("team_id, team_name")
    .eq("tournament_id", tournamentId);
  if (teamsErr) throw teamsErr;
  const teamNameById = new Map((teams ?? []).map((t) => [t.team_id, t.team_name]));

  const teamByMatchPlayer = new Map<string, number>();
  const roundIdByMatchId = new Map<number, number>();
  for (const m of (matches ?? []) as any[]) {
    roundIdByMatchId.set(m.match_id, m.round_id);
    for (const p of m.match_participants ?? []) {
      teamByMatchPlayer.set(`${m.match_id}_${p.player_id}`, p.team_id);
    }
  }

  const seenAwards = new Set<string>();
  const totals = new Map<string, number>();
  for (const r of (results ?? []) as any[]) {
    const teamId = teamByMatchPlayer.get(`${r.match_id}_${r.player_id}`);
    if (teamId === undefined) continue;
    const awardKey = `${r.match_id}_${teamId}`;
    if (seenAwards.has(awardKey)) continue;
    seenAwards.add(awardKey);

    const roundId = roundIdByMatchId.get(r.match_id);
    const roundNumber = roundId !== undefined ? roundNumberByRoundId.get(roundId) : undefined;
    if (roundNumber === undefined) continue;

    const totalKey = `${roundNumber}_${teamId}`;
    totals.set(totalKey, (totals.get(totalKey) ?? 0) + (r.tournament_points ?? 0));
  }

  return [...totals.entries()]
    .map(([key, points]) => {
      const [roundNumberStr, teamIdStr] = key.split("_");
      const teamId = Number(teamIdStr);
      return {
        round_number: Number(roundNumberStr),
        team_id: teamId,
        team_name: teamNameById.get(teamId) ?? "Unknown Team",
        points,
      };
    })
    .sort((a, b) => a.round_number - b.round_number || a.team_id - b.team_id);
}

export interface PlayerTournamentPoints {
  player_id: number;
  display_name: string;
  team_id: number | null;
  team_name: string | null;
  points: number;
}

export async function getIndividualPointsForTournament(tournamentId: number): Promise<PlayerTournamentPoints[]> {
  const { data: rounds, error: roundsErr } = await supabase.from("rounds").select("round_id").eq("tournament_id", tournamentId);
  if (roundsErr) throw roundsErr;
  const roundIds = (rounds ?? []).map((r) => r.round_id);
  if (roundIds.length === 0) return [];

  const { data: matches, error: matchesErr } = await supabase.from("matches").select("match_id").in("round_id", roundIds);
  if (matchesErr) throw matchesErr;
  const matchIds = (matches ?? []).map((m) => m.match_id);
  if (matchIds.length === 0) return [];

  const { data: results, error: resultsErr } = await supabase
    .from("round_results")
    .select("player_id, tournament_points")
    .in("match_id", matchIds);
  if (resultsErr) throw resultsErr;

  const totals = new Map<number, number>();
  for (const r of results ?? []) totals.set(r.player_id, (totals.get(r.player_id) ?? 0) + (r.tournament_points ?? 0));

  const roster = await getTeamRoster(tournamentId);
  const rosterByPlayer = new Map(roster.map((r) => [r.player_id, r]));

  const playerIds = [...totals.keys()];
  const { data: players, error: playersErr } = await supabase
    .from("players")
    .select("player_id, display_name")
    .in("player_id", playerIds);
  if (playersErr) throw playersErr;
  const nameByPlayer = new Map((players ?? []).map((p) => [p.player_id, p.display_name]));

  return playerIds
    .map((playerId) => {
      const rosterEntry = rosterByPlayer.get(playerId);
      return {
        player_id: playerId,
        display_name: nameByPlayer.get(playerId) ?? "Unknown",
        team_id: rosterEntry?.team_id ?? null,
        team_name: rosterEntry?.team_name ?? null,
        points: totals.get(playerId) ?? 0,
      };
    })
    .sort((a, b) => b.points - a.points);
}

export interface PlayerYearToPar {
  year: number;
  avg_to_par: number;
  rounds_played: number;
}

// Stand-in for "strokes gained" (strokes_gained_gross/net are 0% populated in
// the live data) — net-to-par tells a similar year-over-year trend story
// using fields that are actually filled in (net_strokes is ~81% populated).
export async function getPlayerNetToParByYear(playerId: number): Promise<PlayerYearToPar[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select("match_id, net_strokes, matches(rounds(course_par, tournaments(year)))")
    .eq("player_id", playerId)
    .not("net_strokes", "is", null);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const matchIds = [...new Set(rows.map((r) => r.match_id))];

  // Some formats store one shared team net across all teammates on a match
  // (see MatchDetail's "Team Net" handling) — exclude those here since the
  // value isn't actually this player's own net score and would otherwise
  // badly skew a per-player trend (confirmed: one such row inflated a
  // player's yearly average by ~200 strokes-to-par).
  const { data: allMatchResults, error: matchResultsErr } = matchIds.length
    ? await supabase.from("round_results").select("match_id, net_strokes").in("match_id", matchIds)
    : { data: [], error: null };
  if (matchResultsErr) throw matchResultsErr;

  const netsByMatch = new Map<number, number[]>();
  for (const r of allMatchResults ?? []) {
    if (r.net_strokes === null) continue;
    const list = netsByMatch.get(r.match_id) ?? [];
    list.push(r.net_strokes);
    netsByMatch.set(r.match_id, list);
  }
  const isSharedMatch = (matchId: number) => {
    const nets = netsByMatch.get(matchId) ?? [];
    return nets.length > 1 && nets.every((n) => n === nets[0]);
  };

  const byYear = new Map<number, { sum: number; count: number }>();
  for (const row of rows) {
    if (isSharedMatch(row.match_id)) continue;
    const year = row.matches?.rounds?.tournaments?.year;
    const coursePar = row.matches?.rounds?.course_par;
    if (!year || coursePar === null || coursePar === undefined) continue;
    const existing = byYear.get(year) ?? { sum: 0, count: 0 };
    existing.sum += row.net_strokes - coursePar;
    existing.count += 1;
    byYear.set(year, existing);
  }

  return [...byYear.entries()]
    .map(([year, { sum, count }]) => ({ year, avg_to_par: sum / count, rounds_played: count }))
    .sort((a, b) => a.year - b.year);
}

export interface ScoreByParType {
  par: number;
  avg_score: number;
  avg_to_par: number;
  holes_played: number;
}

export async function getPlayerScoreByParType(playerId: number): Promise<ScoreByParType[]> {
  const { data: scores, error: scoresErr } = await supabase
    .from("hole_scores")
    .select("match_id, hole_no, gross_strokes")
    .eq("player_id", playerId)
    .not("gross_strokes", "is", null);
  if (scoresErr) throw scoresErr;
  if (!scores || scores.length === 0) return [];

  const matchIds = [...new Set(scores.map((s) => s.match_id))];
  const { data: matches, error: matchesErr } = await supabase.from("matches").select("match_id, round_id").in("match_id", matchIds);
  if (matchesErr) throw matchesErr;
  const roundIdByMatch = new Map((matches ?? []).map((m) => [m.match_id, m.round_id]));

  const roundIds = [...new Set([...roundIdByMatch.values()])];
  const { data: holes, error: holesErr } = await supabase
    .from("round_holes")
    .select("round_id, hole_no, par")
    .in("round_id", roundIds);
  if (holesErr) throw holesErr;
  const parByRoundHole = new Map((holes ?? []).map((h) => [`${h.round_id}_${h.hole_no}`, h.par]));

  const byPar = new Map<number, { sum: number; count: number }>();
  for (const s of scores) {
    const roundId = roundIdByMatch.get(s.match_id);
    if (roundId === undefined || s.gross_strokes === null) continue;
    const par = parByRoundHole.get(`${roundId}_${s.hole_no}`);
    if (par === undefined) continue;
    const existing = byPar.get(par) ?? { sum: 0, count: 0 };
    existing.sum += s.gross_strokes;
    existing.count += 1;
    byPar.set(par, existing);
  }

  return [...byPar.entries()]
    .map(([par, { sum, count }]) => ({ par, avg_score: sum / count, avg_to_par: sum / count - par, holes_played: count }))
    .sort((a, b) => a.par - b.par);
}

export interface FinishBucket {
  label: string;
  count: number;
}

export async function getPlayerFinishDistribution(playerId: number): Promise<FinishBucket[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select("matchup_rank")
    .eq("player_id", playerId)
    .not("matchup_rank", "is", null);
  if (error) throw error;

  const buckets = new Map<string, number>();
  for (const row of data ?? []) {
    const rank = row.matchup_rank as number;
    const label = rank <= 3 ? `${rank}${rank === 1 ? "st" : rank === 2 ? "nd" : "rd"}` : "4th+";
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  const order = ["1st", "2nd", "3rd", "4th+"];
  return order.filter((l) => buckets.has(l)).map((label) => ({ label, count: buckets.get(label)! }));
}

// ── Records ──

interface RecordsRow {
  display_name: string;
  gross_strokes: number | null;
  event_score: number | null;
  tournament_points: number | null;
  event_name: string;
  scoring_type: string;
  year: number;
}

function classifyFormat(eventName: string): string {
  const n = eventName.toLowerCase();
  if (n.includes("scramble")) return "Scramble";
  if (n.includes("cha cha") || n.includes("shamble")) return "Shamble";
  return "Individual Stroke Play";
}

export interface RecordCard {
  label: string;
  value: string;
  detail: string;
}

export async function getRecords(): Promise<RecordCard[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select(
      "gross_strokes, event_score, tournament_points, players(display_name), matches(rounds(event_name, scoring_type, tournaments(year)))"
    );
  if (error) throw error;

  const rows: RecordsRow[] = (data ?? []).map((row: any) => ({
    display_name: row.players?.display_name ?? "Unknown",
    gross_strokes: row.gross_strokes,
    event_score: row.event_score,
    tournament_points: row.tournament_points,
    event_name: row.matches?.rounds?.event_name ?? "",
    scoring_type: row.matches?.rounds?.scoring_type ?? "",
    year: row.matches?.rounds?.tournaments?.year,
  }));

  const cards: RecordCard[] = [];
  const lowest = (candidates: RecordsRow[]) => candidates.reduce((a, b) => (b.gross_strokes! < a.gross_strokes! ? b : a));

  const strokePlayRows = rows.filter((r) => r.scoring_type !== "Stableford" && r.gross_strokes !== null);
  if (strokePlayRows.length) {
    const best = lowest(strokePlayRows);
    cards.push({ label: "Lowest Gross Score (Overall)", value: `${best.gross_strokes}`, detail: `${best.display_name} · ${best.year} · ${best.event_name}` });
  }

  for (const bucket of ["Scramble", "Shamble", "Individual Stroke Play"]) {
    const bucketRows = strokePlayRows.filter((r) => classifyFormat(r.event_name) === bucket);
    if (!bucketRows.length) continue;
    const best = lowest(bucketRows);
    cards.push({ label: `Lowest Gross — ${bucket}`, value: `${best.gross_strokes}`, detail: `${best.display_name} · ${best.year} · ${best.event_name}` });
  }

  const stablefordRows = rows.filter((r) => r.scoring_type === "Stableford" && r.event_score !== null);
  if (stablefordRows.length) {
    const best = stablefordRows.reduce((a, b) => (b.event_score! > a.event_score! ? b : a));
    cards.push({ label: "Best Stableford Round", value: `${best.event_score} pts`, detail: `${best.display_name} · ${best.year}` });
  }

  const pointsRows = rows.filter((r) => r.tournament_points !== null);
  if (pointsRows.length) {
    const best = pointsRows.reduce((a, b) => (b.tournament_points! > a.tournament_points! ? b : a));
    cards.push({ label: "Most Points — Single Round", value: `${best.tournament_points} pts`, detail: `${best.display_name} · ${best.year} · ${best.event_name}` });
  }

  const career = await getPlayerCareerStats();
  if (career.length) {
    const best = career.reduce((a, b) => ((b.career_points ?? 0) > (a.career_points ?? 0) ? b : a));
    cards.push({ label: "Most Career Points", value: `${best.career_points}`, detail: best.display_name });
  }

  return cards;
}
