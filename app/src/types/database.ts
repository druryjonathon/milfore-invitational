// Hand-written types mirroring milfore_schema_v2.sql.
// Kept minimal — only fields the app actually reads.

export interface Tournament {
  tournament_id: number;
  year: number;
  name: string;
  status: "setup" | "in_progress" | "final";
  start_date: string | null;
  end_date: string | null;
}

export interface Team {
  team_id: number;
  tournament_id: number;
  team_name: string;
}

export interface Player {
  player_id: number;
  display_name: string;
  full_name: string | null;
}

export interface PlayerHandicap {
  tournament_id: number;
  player_id: number;
  handicap_index: number;
  source: string | null;
}

export interface GameFormat {
  format_id: number;
  format_name: string;
  grouping_size: number;
  scoring_style: "stroke_play" | "stableford" | "match_play";
  handicap_method: "individual_pct" | "weighted_by_rank" | "none";
  allowance_pct: number | null;
  rank_weights: number[] | null;
  strokes_field_scope: "round" | "match";
  notes: string | null;
}

export interface Course {
  course_id: number;
  course_name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Round {
  round_id: number;
  tournament_id: number;
  round_number: number;
  course_id: number;
  round_date: string | null;
  first_tee_time: string | null;
  tee_color: string | null;
  course_par: number | null;
  course_rating: number | null;
  slope_rating: number | null;
  total_yardage: number | null;
  event_category: string;
  event_name: string;
  scoring_type: string;
  format_id: number;
  handicap_adjusted: boolean;
  status: "not_started" | "in_progress" | "final";
}

export interface RoundHole {
  round_id: number;
  hole_no: number;
  par: number;
  yardage: number | null;
  stroke_index: number | null;
}

export interface Match {
  match_id: number;
  round_id: number;
  match_number: number;
  team_id: number | null;
}

export interface MatchParticipant {
  match_id: number;
  player_id: number;
  team_id: number;
  handicap_index_snapshot: number | null;
  adjusted_handicap: number | null;
  strokes_received: number | null;
}

export interface HoleScore {
  match_id: number;
  player_id: number;
  hole_no: number;
  gross_strokes: number | null;
}

export interface RoundResult {
  match_id: number;
  player_id: number;
  gross_strokes: number | null;
  net_strokes: number | null;
  event_score: number | null;
  matchup_rank: number | null;
  is_tied: boolean;
  tournament_points: number | null;
  match_result: "W" | "L" | "T" | null;
  strokes_gained_gross: number | null;
  strokes_gained_net: number | null;
}

export interface BonusType {
  bonus_type_id: number;
  bonus_name: string;
  award_method: "rank_based" | "fixed";
}

export interface BonusPoint {
  bonus_id: number;
  round_id: number;
  bonus_type_id: number;
  player_id: number;
  points: number;
  is_tied: boolean;
}

// ── Views ──

export interface TeamStanding {
  tournament_id: number;
  team_id: number;
  team_name: string;
  total_points: number;
}

export interface PlayerCareerStats {
  player_id: number;
  display_name: string;
  years_played: number;
  avg_strokes_gained_gross: number | null;
  avg_strokes_gained_net: number | null;
  career_points: number | null;
}
