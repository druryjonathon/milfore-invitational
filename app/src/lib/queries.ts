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

export interface TournamentCourses {
  tournament_id: number;
  course_names: string[];
}

export async function getTournamentCourseNames(): Promise<TournamentCourses[]> {
  const { data, error } = await supabase.from("rounds").select("tournament_id, round_number, courses(course_name)").order("round_number");
  if (error) throw error;

  const byTournament = new Map<number, string[]>();
  for (const row of (data ?? []) as any[]) {
    const name = row.courses?.course_name;
    if (!name) continue;
    const list = byTournament.get(row.tournament_id) ?? [];
    if (!list.includes(name)) list.push(name);
    byTournament.set(row.tournament_id, list);
  }
  return [...byTournament.entries()].map(([tournament_id, course_names]) => ({ tournament_id, course_names }));
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

export async function getPlayerCareerStat(playerId: number): Promise<PlayerCareerStats | null> {
  const { data, error } = await supabase
    .from("v_player_career_stats")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw error;
  return data;
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

// ── Individually-adjusted points ──
//
// round_results.tournament_points carries the FULL shared team award on
// every teammate's own row for team-scored formats (by schema design, same
// caveat as v_team_standings) -- fine for standings, but wrong for crediting
// an individual: a 4-man scramble team's 8 points isn't "8 points" for each
// of the 4 players, it's 8 points for the team, so each gets 2. This section
// detects sharing empirically per match (all participants' tournament_points
// identical) rather than assuming by format, since some "grouped" formats
// (Match Play) already store distinct per-player W/L points and must NOT be
// redivided.
//
// One format needs more than an even split: the 2024 Cha Cha Cha ("2-Man
// Shamble", handicap_method='individual_pct', grouping_size=2) is a best-ball
// pairing where each partner has their own individual per-hole net score and
// the better of the two counts for the team each hole -- so credit for that
// round should follow how many holes each partner's own score actually won,
// not a flat 50/50 split.

interface AdjustedPointsRow {
  match_id: number;
  tournament_id: number;
  year: number;
  player_id: number;
  display_name: string;
  points: number;
}

function strokesOnHole(adjustedHandicap: number, strokeIndex: number): number {
  const rounded = Math.round(adjustedHandicap);
  const base = Math.floor(rounded / 18);
  const extra = ((rounded % 18) + 18) % 18;
  return base + (strokeIndex <= extra ? 1 : 0);
}

// Per-hole net-score comparison for 2-man Shamble pairs -- returns each
// player's share (0-1) of that match's award, based on how many compared
// holes their own net score was the better (team-counting) one.
async function computeShambleContributionWeights(matchIds: number[]): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  if (matchIds.length === 0) return weights;

  const { data: participants, error: pErr } = await supabase
    .from("match_participants")
    .select("match_id, player_id, adjusted_handicap")
    .in("match_id", matchIds);
  if (pErr) throw pErr;

  const { data: matches, error: mErr } = await supabase.from("matches").select("match_id, round_id").in("match_id", matchIds);
  if (mErr) throw mErr;
  const roundIdByMatch = new Map((matches ?? []).map((m) => [m.match_id, m.round_id]));
  const roundIds = [...new Set([...roundIdByMatch.values()])];

  const { data: holes, error: hErr } = await supabase
    .from("round_holes")
    .select("round_id, hole_no, stroke_index")
    .in("round_id", roundIds);
  if (hErr) throw hErr;
  const holesByRound = new Map<number, { hole_no: number; stroke_index: number }[]>();
  for (const h of holes ?? []) {
    const list = holesByRound.get(h.round_id) ?? [];
    list.push(h);
    holesByRound.set(h.round_id, list);
  }

  const { data: scores, error: sErr } = await supabase
    .from("hole_scores")
    .select("match_id, player_id, hole_no, gross_strokes")
    .in("match_id", matchIds);
  if (sErr) throw sErr;
  const scoreMap = new Map<string, number | null>();
  for (const s of scores ?? []) scoreMap.set(`${s.match_id}_${s.player_id}_${s.hole_no}`, s.gross_strokes);

  const byMatch = new Map<number, { player_id: number; adjusted_handicap: number }[]>();
  for (const p of (participants ?? []) as any[]) {
    const list = byMatch.get(p.match_id) ?? [];
    list.push({ player_id: p.player_id, adjusted_handicap: p.adjusted_handicap });
    byMatch.set(p.match_id, list);
  }

  for (const [matchId, members] of byMatch) {
    if (members.length !== 2) continue;
    const roundId = roundIdByMatch.get(matchId);
    const roundHoles = roundId !== undefined ? holesByRound.get(roundId) ?? [] : [];
    const [a, b] = members;
    let creditA = 0;
    let creditB = 0;
    let compared = 0;
    for (const h of roundHoles) {
      const grossA = scoreMap.get(`${matchId}_${a.player_id}_${h.hole_no}`);
      const grossB = scoreMap.get(`${matchId}_${b.player_id}_${h.hole_no}`);
      if (grossA === null || grossA === undefined || grossB === null || grossB === undefined) continue;
      const netA = grossA - strokesOnHole(a.adjusted_handicap, h.stroke_index);
      const netB = grossB - strokesOnHole(b.adjusted_handicap, h.stroke_index);
      compared += 1;
      if (netA < netB) creditA += 1;
      else if (netB < netA) creditB += 1;
      else {
        creditA += 0.5;
        creditB += 0.5;
      }
    }
    if (compared === 0) {
      weights.set(`${matchId}_${a.player_id}`, 0.5);
      weights.set(`${matchId}_${b.player_id}`, 0.5);
    } else {
      weights.set(`${matchId}_${a.player_id}`, creditA / compared);
      weights.set(`${matchId}_${b.player_id}`, creditB / compared);
    }
  }
  return weights;
}

async function computeIndividuallyAdjustedPoints(): Promise<AdjustedPointsRow[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select(
      "match_id, player_id, tournament_points, players(display_name), matches(round_id, rounds(tournament_id, tournaments(year), game_formats(format_name)))"
    );
  if (error) throw error;

  const rows = (data ?? []).map((row: any) => ({
    match_id: row.match_id,
    player_id: row.player_id,
    display_name: row.players?.display_name ?? "Unknown",
    tournament_points: row.tournament_points ?? 0,
    tournament_id: row.matches?.rounds?.tournament_id,
    year: row.matches?.rounds?.tournaments?.year,
    format_name: row.matches?.rounds?.game_formats?.format_name ?? "",
  }));

  const byMatch = new Map<number, typeof rows>();
  for (const r of rows) {
    const list = byMatch.get(r.match_id) ?? [];
    list.push(r);
    byMatch.set(r.match_id, list);
  }

  const shambleMatchIds: number[] = [];
  for (const [matchId, participants] of byMatch) {
    if (
      participants.length > 1 &&
      participants[0].format_name.toLowerCase().includes("shamble") &&
      participants.every((p) => p.tournament_points === participants[0].tournament_points)
    ) {
      shambleMatchIds.push(matchId);
    }
  }
  const shambleWeights = await computeShambleContributionWeights(shambleMatchIds);

  const out: AdjustedPointsRow[] = [];
  for (const [matchId, participants] of byMatch) {
    if (!participants[0].year || !participants[0].tournament_id) continue;
    const allShared = participants.length > 1 && participants.every((p) => p.tournament_points === participants[0].tournament_points);

    if (!allShared) {
      // Either a single-participant (already individual) or already
      // per-player-distinct (e.g. Match Play win/loss) -- use as-is.
      for (const p of participants) {
        out.push({ match_id: matchId, tournament_id: p.tournament_id, year: p.year, player_id: p.player_id, display_name: p.display_name, points: p.tournament_points });
      }
      continue;
    }

    const shared = participants[0].tournament_points;
    const isShamble = shambleMatchIds.includes(matchId);
    for (const p of participants) {
      const weight = isShamble ? shambleWeights.get(`${matchId}_${p.player_id}`) ?? 1 / participants.length : 1 / participants.length;
      out.push({ match_id: matchId, tournament_id: p.tournament_id, year: p.year, player_id: p.player_id, display_name: p.display_name, points: shared * weight });
    }
  }
  return out;
}

export interface PlayerAdjustedPoints {
  player_id: number;
  display_name: string;
  points_by_year: { year: number; points: number }[];
  career_points: number;
}

// Rescales each year's individually-adjusted points by (that year's total
// points pool / the average pool size across years), so a year with a
// bigger overall point pool (more rounds, more bonus categories, etc.)
// doesn't automatically dominate the cross-year comparison. Splitting a
// shared award preserves the pool total, so this is a fair normalization.
export async function getAdjustedPlayerPoints(): Promise<PlayerAdjustedPoints[]> {
  const rows = await computeIndividuallyAdjustedPoints();

  const poolByYear = new Map<number, number>();
  const byPlayerYear = new Map<string, number>();
  const namesByPlayer = new Map<number, string>();
  for (const r of rows) {
    poolByYear.set(r.year, (poolByYear.get(r.year) ?? 0) + r.points);
    const key = `${r.player_id}_${r.year}`;
    byPlayerYear.set(key, (byPlayerYear.get(key) ?? 0) + r.points);
    namesByPlayer.set(r.player_id, r.display_name);
  }

  const years = [...poolByYear.keys()];
  const avgPool = years.length > 0 ? years.reduce((sum, y) => sum + (poolByYear.get(y) ?? 0), 0) / years.length : 0;

  const byPlayer = new Map<number, { year: number; points: number }[]>();
  for (const [key, rawPoints] of byPlayerYear) {
    const [playerIdStr, yearStr] = key.split("_");
    const playerId = Number(playerIdStr);
    const year = Number(yearStr);
    const pool = poolByYear.get(year) ?? 0;
    const normalized = pool > 0 ? (rawPoints / pool) * avgPool : 0;
    const list = byPlayer.get(playerId) ?? [];
    list.push({ year, points: Math.round(normalized * 100) / 100 });
    byPlayer.set(playerId, list);
  }

  return [...byPlayer.entries()]
    .map(([player_id, points_by_year]) => ({
      player_id,
      display_name: namesByPlayer.get(player_id) ?? "Unknown",
      points_by_year: points_by_year.sort((a, b) => b.year - a.year),
      career_points: Math.round(points_by_year.reduce((sum, y) => sum + y.points, 0) * 100) / 100,
    }))
    .sort((a, b) => b.career_points - a.career_points);
}

export interface PlayerTournamentPoints {
  player_id: number;
  display_name: string;
  team_id: number | null;
  team_name: string | null;
  points: number;
}

// Individually-adjusted points for one tournament (rule 1 only -- already
// scoped to a single year, so the cross-year pool normalization doesn't
// apply here).
export async function getIndividualPointsForTournament(tournamentId: number): Promise<PlayerTournamentPoints[]> {
  const rows = await computeIndividuallyAdjustedPoints();
  const scoped = rows.filter((r) => r.tournament_id === tournamentId);
  if (scoped.length === 0) return [];

  const totals = new Map<number, { display_name: string; points: number }>();
  for (const r of scoped) {
    const entry = totals.get(r.player_id) ?? { display_name: r.display_name, points: 0 };
    entry.points += r.points;
    totals.set(r.player_id, entry);
  }

  const roster = await getTeamRoster(tournamentId);
  const rosterByPlayer = new Map(roster.map((r) => [r.player_id, r]));

  return [...totals.entries()]
    .map(([playerId, { display_name, points }]) => {
      const rosterEntry = rosterByPlayer.get(playerId);
      return {
        player_id: playerId,
        display_name,
        team_id: rosterEntry?.team_id ?? null,
        team_name: rosterEntry?.team_name ?? null,
        points: Math.round(points * 100) / 100,
      };
    })
    .sort((a, b) => b.points - a.points);
}

export interface StrokesGainedEntry {
  match_id: number;
  round_id: number;
  year: number;
  round_number: number;
  event_name: string;
  format_name: string;
  scoring_style: string;
  grouping_size: number;
  course_par: number;
  gross_strokes: number;
  adjusted_handicap: number;
  expected_score: number;
  strokes_gained: number;
  attribution: "individual" | "team";
}

// Expected Score = course_par + adjusted_handicap (the player/pairing's own
// format-specific handicap allowance, BEFORE netting against the field's
// low handicap — that's what strokes_received is for elsewhere). Strokes
// Gained = Expected Score - actual gross score. For weighted_by_rank formats
// (2/4-Man Scramble) adjusted_handicap and gross_strokes are both shared
// team-level values (per game_formats/match_participants schema notes), so
// the result there is a team-attributed figure, not an individual one --
// tagged via `attribution` so callers can filter/label accordingly.
export async function getPlayerStrokesGained(playerId: number): Promise<StrokesGainedEntry[]> {
  const { data: participants, error: pErr } = await supabase
    .from("match_participants")
    .select(
      "match_id, adjusted_handicap, matches(round_id, rounds(round_number, course_par, event_name, tournaments(year), game_formats(format_name, scoring_style, grouping_size)))"
    )
    .eq("player_id", playerId)
    .not("adjusted_handicap", "is", null);
  if (pErr) throw pErr;

  const matchIds = (participants ?? []).map((p: any) => p.match_id);
  if (matchIds.length === 0) return [];

  const { data: results, error: rErr } = await supabase
    .from("round_results")
    .select("match_id, gross_strokes")
    .eq("player_id", playerId)
    .in("match_id", matchIds);
  if (rErr) throw rErr;
  const grossByMatch = new Map((results ?? []).map((r) => [r.match_id, r.gross_strokes]));

  const out: StrokesGainedEntry[] = [];
  for (const p of (participants ?? []) as any[]) {
    const gross = grossByMatch.get(p.match_id);
    if (gross === null || gross === undefined) continue;
    const round = p.matches?.rounds;
    const year = round?.tournaments?.year;
    const coursePar = round?.course_par;
    const fmt = round?.game_formats;
    if (!year || coursePar === null || coursePar === undefined || !fmt) continue;

    const expectedScore = coursePar + p.adjusted_handicap;
    out.push({
      match_id: p.match_id,
      round_id: p.matches.round_id,
      year,
      round_number: round.round_number,
      event_name: round.event_name,
      format_name: fmt.format_name,
      scoring_style: fmt.scoring_style,
      grouping_size: fmt.grouping_size,
      course_par: coursePar,
      gross_strokes: gross,
      adjusted_handicap: p.adjusted_handicap,
      expected_score: expectedScore,
      strokes_gained: expectedScore - gross,
      attribution: fmt.grouping_size > 1 ? "team" : "individual",
    });
  }
  return out.sort((a, b) => a.year - b.year || a.round_number - b.round_number);
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

interface FormatRecordRawRow {
  match_id: number;
  round_id: number;
  gross_strokes: number | null;
  event_score: number | null;
  event_name: string;
  scoring_type: string;
  grouping_size: number;
  year: number;
}

// Normalizes a round's display event_name into the "same recurring event"
// bucket a human would recognize (e.g. "Scramble (1/4's & 2/3's)" and
// "Scramble" in different years both count as one 2-Man Scramble lineage).
// Uses the round's actual game_formats.grouping_size rather than the cosmetic
// event_category column (schema note: event_category is DISPLAY ONLY and
// doesn't reliably reflect pair/team size -- e.g. Team Stableford rounds are
// tagged event_category='Individual' despite being a team format).
function normalizeEventBucket(eventName: string, groupingSize: number): string {
  const n = eventName.toLowerCase();
  if (n.includes("scramble")) return groupingSize >= 4 ? "4-Man Scramble" : "2-Man Scramble";
  if (n.includes("cha cha") || n.includes("shamble")) return "2-Man Shamble";
  if (n.includes("stableford")) return "Team Stableford";
  if (n.includes("head to head") || n.includes("match play")) return "Head to Head";
  return eventName;
}

export interface FormatRecordCard {
  bucket: string;
  value: string;
  year: number;
  names: string[];
}

// Only formats that have been played more than once qualify as a Hall of
// Fame category -- a single-occurrence event (e.g. a brand new format tried
// once) doesn't have enough of a track record to call anything a "record."
export async function getFormatRecords(): Promise<FormatRecordCard[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select(
      "match_id, gross_strokes, event_score, matches(round_id, rounds(event_name, scoring_type, tournaments(year), game_formats(grouping_size)))"
    )
    .not("gross_strokes", "is", null);
  if (error) throw error;

  const rows: FormatRecordRawRow[] = (data ?? []).map((row: any) => ({
    match_id: row.match_id,
    round_id: row.matches?.round_id,
    gross_strokes: row.gross_strokes,
    event_score: row.event_score,
    event_name: row.matches?.rounds?.event_name ?? "",
    scoring_type: row.matches?.rounds?.scoring_type ?? "",
    grouping_size: row.matches?.rounds?.game_formats?.grouping_size ?? 1,
    year: row.matches?.rounds?.tournaments?.year,
  }));

  const byBucket = new Map<string, FormatRecordRawRow[]>();
  for (const r of rows) {
    if (!r.year) continue;
    const bucket = normalizeEventBucket(r.event_name, r.grouping_size);
    const list = byBucket.get(bucket) ?? [];
    list.push(r);
    byBucket.set(bucket, list);
  }

  const bestByBucket: { bucket: string; match_id: number; value: string; year: number }[] = [];
  for (const [bucket, bucketRows] of byBucket) {
    const distinctRounds = new Set(bucketRows.map((r) => r.round_id));
    if (distinctRounds.size < 2) continue; // must have been played more than once

    const isStableford = bucketRows[0].scoring_type === "Stableford";
    const withMetric = bucketRows.filter((r) => (isStableford ? r.event_score !== null : r.gross_strokes !== null));
    if (withMetric.length === 0) continue;

    const best = isStableford
      ? withMetric.reduce((a, b) => (b.event_score! > a.event_score! ? b : a))
      : withMetric.reduce((a, b) => (b.gross_strokes! < a.gross_strokes! ? b : a));

    bestByBucket.push({
      bucket,
      match_id: best.match_id,
      year: best.year,
      value: isStableford ? `${best.event_score} pts` : `${best.gross_strokes}`,
    });
  }

  // Fetch every participant on each record-setting match so 2-Man/4-Man
  // records list the whole pair/team, not just one row's player.
  const matchIds = bestByBucket.map((r) => r.match_id);
  const { data: participants, error: pErr } = matchIds.length
    ? await supabase.from("match_participants").select("match_id, players(display_name)").in("match_id", matchIds)
    : { data: [], error: null };
  if (pErr) throw pErr;
  const namesByMatch = new Map<number, string[]>();
  for (const p of (participants ?? []) as any[]) {
    const list = namesByMatch.get(p.match_id) ?? [];
    list.push(p.players?.display_name ?? "Unknown");
    namesByMatch.set(p.match_id, list);
  }

  return bestByBucket
    .map((r) => ({ bucket: r.bucket, value: r.value, year: r.year, names: namesByMatch.get(r.match_id) ?? [] }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export interface RecordCard {
  label: string;
  value: string;
  detail: string;
}

// Cross-format, all-time bests -- not tied to a specific recurring event, so
// the "played more than once" rule doesn't apply the same way here. Points
// here are individually-adjusted (a shared team award is split, not
// double-counted); "Most Career Points" is also year-normalized since it
// spans multiple tournaments.
export async function getOverallRecords(): Promise<RecordCard[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select("match_id, players(display_name), matches(rounds(event_name, tournaments(year)))");
  if (error) throw error;

  const detailByMatch = new Map<number, { display_name: string; year: number; event_name: string }>();
  for (const row of (data ?? []) as any[]) {
    detailByMatch.set(row.match_id, {
      display_name: row.players?.display_name ?? "Unknown",
      year: row.matches?.rounds?.tournaments?.year,
      event_name: row.matches?.rounds?.event_name ?? "",
    });
  }

  const cards: RecordCard[] = [];
  const adjustedRows = await computeIndividuallyAdjustedPoints();
  if (adjustedRows.length) {
    const best = adjustedRows.reduce((a, b) => (b.points > a.points ? b : a));
    const detail = detailByMatch.get(best.match_id);
    cards.push({
      label: "Most Points — Single Round",
      value: `${Math.round(best.points * 100) / 100} pts`,
      detail: `${best.display_name} · ${best.year} · ${detail?.event_name ?? ""}`,
    });
  }

  const career = await getAdjustedPlayerPoints();
  if (career.length) {
    const best = career[0];
    cards.push({ label: "Most Career Points", value: `${best.career_points}`, detail: best.display_name });
  }

  return cards;
}

// ── Population Analytics (Players landing page) ──

export interface PopulationFilter {
  year?: number;
  bucket?: string;
}

function matchesFilter(year: number, bucket: string, filter: PopulationFilter): boolean {
  if (filter.year !== undefined && year !== filter.year) return false;
  if (filter.bucket !== undefined && filter.bucket !== "all" && bucket !== filter.bucket) return false;
  return true;
}

// Shared building block: every (match, player) with a computable Strokes
// Gained value (adjusted_handicap + gross_strokes both present). Reused by
// the population leaderboard, format-leader breakdown, and pairing analytics
// below so each doesn't repeat the same two-query fetch-and-join.
interface StrokesGainedRow {
  match_id: number;
  player_id: number;
  display_name: string;
  strokes_gained: number;
  event_name: string;
  grouping_size: number;
  year: number;
  bucket: string;
}

async function getAllStrokesGainedRows(filter: PopulationFilter = {}): Promise<StrokesGainedRow[]> {
  const { data: participants, error: pErr } = await supabase
    .from("match_participants")
    .select(
      "match_id, player_id, adjusted_handicap, players(display_name), matches(rounds(course_par, event_name, tournaments(year), game_formats(grouping_size)))"
    )
    .not("adjusted_handicap", "is", null);
  if (pErr) throw pErr;

  const matchIds = [...new Set((participants ?? []).map((p: any) => p.match_id))];
  const { data: results, error: rErr } = matchIds.length
    ? await supabase.from("round_results").select("match_id, player_id, gross_strokes").in("match_id", matchIds)
    : { data: [], error: null };
  if (rErr) throw rErr;
  const grossByKey = new Map((results ?? []).map((r) => [`${r.match_id}_${r.player_id}`, r.gross_strokes]));

  const rows: StrokesGainedRow[] = [];
  for (const p of (participants ?? []) as any[]) {
    const gross = grossByKey.get(`${p.match_id}_${p.player_id}`);
    const round = p.matches?.rounds;
    const coursePar = round?.course_par;
    const year = round?.tournaments?.year;
    if (gross === null || gross === undefined || coursePar === null || coursePar === undefined || !year) continue;
    const groupingSize = round.game_formats?.grouping_size ?? 1;
    const eventName = round.event_name ?? "";
    const bucket = normalizeEventBucket(eventName, groupingSize);
    if (!matchesFilter(year, bucket, filter)) continue;
    rows.push({
      match_id: p.match_id,
      player_id: p.player_id,
      display_name: p.players?.display_name ?? "Unknown",
      strokes_gained: coursePar + p.adjusted_handicap - gross,
      event_name: eventName,
      grouping_size: groupingSize,
      year,
      bucket,
    });
  }
  return rows;
}

export interface PopulationFilterOptions {
  years: number[];
  buckets: string[];
}

export async function getPopulationFilterOptions(): Promise<PopulationFilterOptions> {
  const rows = await getAllStrokesGainedRows();
  return {
    years: [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b),
    buckets: [...new Set(rows.map((r) => r.bucket))].sort(),
  };
}

export interface PlayerStrokesGainedSummary {
  player_id: number;
  display_name: string;
  avg_strokes_gained: number;
  rounds: number;
}

export async function getAllPlayersStrokesGained(filter: PopulationFilter = {}): Promise<PlayerStrokesGainedSummary[]> {
  const rows = await getAllStrokesGainedRows(filter);
  const byPlayer = new Map<number, { display_name: string; values: number[] }>();
  for (const r of rows) {
    const entry = byPlayer.get(r.player_id) ?? { display_name: r.display_name, values: [] };
    entry.values.push(r.strokes_gained);
    byPlayer.set(r.player_id, entry);
  }
  return [...byPlayer.entries()]
    .map(([player_id, { display_name, values }]) => ({
      player_id,
      display_name,
      avg_strokes_gained: values.reduce((a, b) => a + b, 0) / values.length,
      rounds: values.length,
    }))
    .sort((a, b) => b.avg_strokes_gained - a.avg_strokes_gained);
}

export interface FormatLeader {
  bucket: string;
  player_id: number;
  display_name: string;
  avg_strokes_gained: number;
}

// "Who plays best in what events" -- the top Strokes Gained average per
// recurring format bucket (same bucketing as the Hall of Fame records).
// Only the year filter applies here (a format filter doesn't make sense
// against a view that's already broken out by format).
export async function getFormatLeaders(filter: Pick<PopulationFilter, "year"> = {}): Promise<FormatLeader[]> {
  const rows = await getAllStrokesGainedRows(filter);
  const byBucketPlayer = new Map<string, { player_id: number; display_name: string; values: number[] }>();
  for (const r of rows) {
    const key = `${r.bucket}__${r.player_id}`;
    const entry = byBucketPlayer.get(key) ?? { player_id: r.player_id, display_name: r.display_name, values: [] };
    entry.values.push(r.strokes_gained);
    byBucketPlayer.set(key, entry);
  }

  const bestByBucket = new Map<string, FormatLeader>();
  for (const [key, { player_id, display_name, values }] of byBucketPlayer) {
    const bucket = key.split("__")[0];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const current = bestByBucket.get(bucket);
    if (!current || avg > current.avg_strokes_gained) bestByBucket.set(bucket, { bucket, player_id, display_name, avg_strokes_gained: avg });
  }
  return [...bestByBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export interface PlayerRecordSummary {
  player_id: number;
  display_name: string;
  wins: number;
  top3: number;
  rounds: number;
}

// "Overall record in events" -- round-level finishes (matchup_rank), not
// tournament wins (that's the team standings' job).
export async function getAllPlayersRecord(filter: PopulationFilter = {}): Promise<PlayerRecordSummary[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select(
      "player_id, matchup_rank, players(display_name), matches(rounds(event_name, tournaments(year), game_formats(grouping_size)))"
    )
    .not("matchup_rank", "is", null);
  if (error) throw error;

  const byPlayer = new Map<number, PlayerRecordSummary>();
  for (const row of (data ?? []) as any[]) {
    const round = row.matches?.rounds;
    const year = round?.tournaments?.year;
    const bucket = normalizeEventBucket(round?.event_name ?? "", round?.game_formats?.grouping_size ?? 1);
    if (!year || !matchesFilter(year, bucket, filter)) continue;

    const entry = byPlayer.get(row.player_id) ?? {
      player_id: row.player_id,
      display_name: row.players?.display_name ?? "Unknown",
      wins: 0,
      top3: 0,
      rounds: 0,
    };
    entry.rounds += 1;
    if (row.matchup_rank === 1) entry.wins += 1;
    if (row.matchup_rank <= 3) entry.top3 += 1;
    byPlayer.set(row.player_id, entry);
  }
  return [...byPlayer.values()].sort((a, b) => b.wins - a.wins || b.top3 - a.top3);
}

// ── Pairing Analytics ──

export interface PairingSummary {
  player_a: string;
  player_b: string;
  matches_together: number;
  avg_strokes_gained: number;
}

// Chemistry between teammates: every match with 2+ participants (individual-
// format matches only ever have 1, so those naturally fall out here) yields
// one shared Strokes Gained observation per unique pair of co-participants.
// Requires 2+ shared matches so a single round doesn't look like a "record."
export async function getTeammatePairings(filter: PopulationFilter = {}): Promise<PairingSummary[]> {
  const rows = await getAllStrokesGainedRows(filter);
  const byMatch = new Map<number, { player_id: number; display_name: string; strokes_gained: number }[]>();
  for (const r of rows) {
    const list = byMatch.get(r.match_id) ?? [];
    list.push({ player_id: r.player_id, display_name: r.display_name, strokes_gained: r.strokes_gained });
    byMatch.set(r.match_id, list);
  }

  const pairs = new Map<string, { a: string; b: string; values: number[] }>();
  for (const members of byMatch.values()) {
    if (members.length < 2) continue;
    const matchAvg = members.reduce((sum, m) => sum + m.strokes_gained, 0) / members.length;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = [members[i], members[j]].sort((x, y) => x.player_id - y.player_id);
        const key = `${a.player_id}_${b.player_id}`;
        const entry = pairs.get(key) ?? { a: a.display_name, b: b.display_name, values: [] };
        entry.values.push(matchAvg);
        pairs.set(key, entry);
      }
    }
  }

  return [...pairs.values()]
    .filter((p) => p.values.length >= 2)
    .map((p) => ({
      player_a: p.a,
      player_b: p.b,
      matches_together: p.values.length,
      avg_strokes_gained: p.values.reduce((a, b) => a + b, 0) / p.values.length,
    }))
    .sort((a, b) => b.avg_strokes_gained - a.avg_strokes_gained);
}

export interface RivalrySummary {
  player_a: string;
  player_b: string;
  meetings: number;
  a_wins: number;
  b_wins: number;
}

// Head-to-head record between any two players who've shared a ROUND
// (regardless of team), decided by whoever had the better matchup_rank that
// round. Generalizes "rivalry" across every format, not just literal Match
// Play. Requires 3+ meetings (or 1+ when a filter narrows the field to where
// 3 meetings isn't realistic) so a passing round doesn't read as a rivalry.
export async function getRivalries(filter: PopulationFilter = {}): Promise<RivalrySummary[]> {
  const { data, error } = await supabase
    .from("round_results")
    .select(
      "player_id, matchup_rank, players(display_name), matches(round_id, rounds(event_name, tournaments(year), game_formats(grouping_size)))"
    )
    .not("matchup_rank", "is", null);
  if (error) throw error;

  const byRound = new Map<number, { player_id: number; display_name: string; rank: number }[]>();
  for (const row of (data ?? []) as any[]) {
    const roundId = row.matches?.round_id;
    const round = row.matches?.rounds;
    const year = round?.tournaments?.year;
    const bucket = normalizeEventBucket(round?.event_name ?? "", round?.game_formats?.grouping_size ?? 1);
    if (roundId === undefined || !year || !matchesFilter(year, bucket, filter)) continue;
    const list = byRound.get(roundId) ?? [];
    list.push({ player_id: row.player_id, display_name: row.players?.display_name ?? "Unknown", rank: row.matchup_rank });
    byRound.set(roundId, list);
  }

  const pairs = new Map<string, { a: string; b: string; meetings: number; aWins: number; bWins: number }>();
  for (const members of byRound.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const m1 = members[i];
        const m2 = members[j];
        if (m1.rank === m2.rank) continue;
        const [a, b] = m1.player_id < m2.player_id ? [m1, m2] : [m2, m1];
        const key = `${a.player_id}_${b.player_id}`;
        const entry = pairs.get(key) ?? { a: a.display_name, b: b.display_name, meetings: 0, aWins: 0, bWins: 0 };
        entry.meetings += 1;
        if (a.rank < b.rank) entry.aWins += 1;
        else entry.bWins += 1;
        pairs.set(key, entry);
      }
    }
  }

  const minMeetings = filter.year !== undefined || filter.bucket !== undefined ? 1 : 3;
  return [...pairs.values()]
    .filter((p) => p.meetings >= minMeetings)
    .map((p) => ({ player_a: p.a, player_b: p.b, meetings: p.meetings, a_wins: p.aWins, b_wins: p.bWins }))
    .sort((a, b) => Math.abs(b.a_wins - b.b_wins) - Math.abs(a.a_wins - a.b_wins));
}
