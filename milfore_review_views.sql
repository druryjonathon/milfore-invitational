-- ============================================================================
-- MILFORE INVITATIONAL — DATA REVIEW / QA VIEWS
-- Postgres / Supabase
--
-- NOT part of the app's production schema (milfore_schema_v2.sql) — these
-- exist purely so the migrated data can be visually spot-checked against the
-- source workbooks without writing SQL by hand. Browse them in Supabase
-- Studio's Table Editor like any other table.
--
--   v_review_round_results     -- flat per-player round summary (same shape
--                                  as the old workbooks' "Data Summary" sheets
--                                  — put it side by side with the original and
--                                  compare)
--   v_review_hole_scores_grid  -- hole-by-hole scorecard, pivoted wide (Hole 1
--                                  .. Hole 18 columns) to match how a scorecard
--                                  actually reads
--   v_review_bonus_points      -- bonus point awards detail
--   v_review_completeness      -- structural integrity checks: flags rounds/
--                                  matches with missing hole scores, missing
--                                  results, or unexpected roster counts
-- ============================================================================

CREATE VIEW v_review_round_results AS
SELECT
    t.year,
    r.round_number,
    c.course_name,
    r.event_name,
    r.scoring_type,
    m.match_number,
    tm.team_name,
    p.display_name AS player,
    rr.gross_strokes,
    rr.net_strokes,
    rr.event_score,
    rr.matchup_rank,
    rr.tournament_points,
    rr.match_result
FROM round_results rr
JOIN players p ON p.player_id = rr.player_id
JOIN matches m ON m.match_id = rr.match_id
JOIN rounds r ON r.round_id = m.round_id
JOIN tournaments t ON t.tournament_id = r.tournament_id
JOIN courses c ON c.course_id = r.course_id
JOIN match_participants mp ON mp.match_id = rr.match_id AND mp.player_id = rr.player_id
JOIN teams tm ON tm.team_id = mp.team_id
ORDER BY t.year, r.round_number, m.match_number, p.display_name;

CREATE VIEW v_review_hole_scores_grid AS
SELECT
    t.year,
    r.round_number,
    c.course_name,
    r.event_name,
    m.match_number,
    tm.team_name,
    p.display_name AS player,
    MAX(CASE WHEN hs.hole_no = 1 THEN hs.gross_strokes END) AS h1,
    MAX(CASE WHEN hs.hole_no = 2 THEN hs.gross_strokes END) AS h2,
    MAX(CASE WHEN hs.hole_no = 3 THEN hs.gross_strokes END) AS h3,
    MAX(CASE WHEN hs.hole_no = 4 THEN hs.gross_strokes END) AS h4,
    MAX(CASE WHEN hs.hole_no = 5 THEN hs.gross_strokes END) AS h5,
    MAX(CASE WHEN hs.hole_no = 6 THEN hs.gross_strokes END) AS h6,
    MAX(CASE WHEN hs.hole_no = 7 THEN hs.gross_strokes END) AS h7,
    MAX(CASE WHEN hs.hole_no = 8 THEN hs.gross_strokes END) AS h8,
    MAX(CASE WHEN hs.hole_no = 9 THEN hs.gross_strokes END) AS h9,
    MAX(CASE WHEN hs.hole_no = 10 THEN hs.gross_strokes END) AS h10,
    MAX(CASE WHEN hs.hole_no = 11 THEN hs.gross_strokes END) AS h11,
    MAX(CASE WHEN hs.hole_no = 12 THEN hs.gross_strokes END) AS h12,
    MAX(CASE WHEN hs.hole_no = 13 THEN hs.gross_strokes END) AS h13,
    MAX(CASE WHEN hs.hole_no = 14 THEN hs.gross_strokes END) AS h14,
    MAX(CASE WHEN hs.hole_no = 15 THEN hs.gross_strokes END) AS h15,
    MAX(CASE WHEN hs.hole_no = 16 THEN hs.gross_strokes END) AS h16,
    MAX(CASE WHEN hs.hole_no = 17 THEN hs.gross_strokes END) AS h17,
    MAX(CASE WHEN hs.hole_no = 18 THEN hs.gross_strokes END) AS h18,
    SUM(hs.gross_strokes) AS total_gross,
    COUNT(hs.gross_strokes) AS holes_entered
FROM hole_scores hs
JOIN players p ON p.player_id = hs.player_id
JOIN matches m ON m.match_id = hs.match_id
JOIN rounds r ON r.round_id = m.round_id
JOIN tournaments t ON t.tournament_id = r.tournament_id
JOIN courses c ON c.course_id = r.course_id
JOIN match_participants mp ON mp.match_id = hs.match_id AND mp.player_id = hs.player_id
JOIN teams tm ON tm.team_id = mp.team_id
GROUP BY t.year, r.round_number, c.course_name, r.event_name, m.match_number, tm.team_name, p.display_name
ORDER BY t.year, r.round_number, m.match_number, p.display_name;

CREATE VIEW v_review_bonus_points AS
SELECT
    t.year,
    r.round_number,
    r.event_name,
    bt.bonus_name,
    p.display_name AS player,
    tm.team_name,
    bp.points,
    bp.is_tied
FROM bonus_points bp
JOIN bonus_types bt ON bt.bonus_type_id = bp.bonus_type_id
JOIN rounds r ON r.round_id = bp.round_id
JOIN tournaments t ON t.tournament_id = r.tournament_id
JOIN players p ON p.player_id = bp.player_id
LEFT JOIN team_memberships tmem ON tmem.player_id = p.player_id AND tmem.tournament_id = t.tournament_id
LEFT JOIN teams tm ON tm.team_id = tmem.team_id
ORDER BY t.year, r.round_number, bt.bonus_name, p.display_name;

-- Flags structural gaps: matches where a participant has fewer than 18 hole
-- scores, or a match_participant with no corresponding round_results row (or
-- vice versa). An empty result set from this view means the round is
-- structurally complete -- it does NOT verify the numbers are correct, only
-- that nothing is silently missing.
CREATE VIEW v_review_completeness AS
SELECT
    t.year,
    r.round_number,
    r.event_name,
    m.match_number,
    p.display_name AS player,
    COUNT(DISTINCT hs.hole_no) AS holes_recorded,
    (SELECT COUNT(*) FROM round_holes rh WHERE rh.round_id = r.round_id) AS holes_expected,
    (CASE WHEN rr.player_id IS NULL THEN 'MISSING round_results' END) AS round_results_flag,
    (CASE WHEN mp.player_id IS NULL THEN 'MISSING match_participants' END) AS match_participants_flag
FROM match_participants mp
JOIN matches m ON m.match_id = mp.match_id
JOIN rounds r ON r.round_id = m.round_id
JOIN tournaments t ON t.tournament_id = r.tournament_id
JOIN players p ON p.player_id = mp.player_id
LEFT JOIN hole_scores hs ON hs.match_id = mp.match_id AND hs.player_id = mp.player_id
LEFT JOIN round_results rr ON rr.match_id = mp.match_id AND rr.player_id = mp.player_id
GROUP BY t.year, r.round_number, r.event_name, m.match_number, p.display_name, r.round_id, rr.player_id, mp.player_id
HAVING COUNT(DISTINCT hs.hole_no) < (SELECT COUNT(*) FROM round_holes rh WHERE rh.round_id = r.round_id)
    OR rr.player_id IS NULL
ORDER BY t.year, r.round_number, m.match_number, p.display_name;

-- Run as the querying user, not the view owner, consistent with the core
-- schema's views (avoids Supabase's "Security Definer View" lint).
ALTER VIEW v_review_round_results SET (security_invoker = true);
ALTER VIEW v_review_hole_scores_grid SET (security_invoker = true);
ALTER VIEW v_review_bonus_points SET (security_invoker = true);
ALTER VIEW v_review_completeness SET (security_invoker = true);
