-- ============================================================================
-- MILFORE INVITATIONAL — UNIFIED DATABASE SCHEMA (v2)
-- Postgres / Supabase
--
-- Design goals:
--   1. One schema serves BOTH live current-year scoring AND YoY analytics.
--   2. No copy/paste between "current" and "historical" — a round is
--      historical the moment it's marked final.
--   3. Flexible enough to handle new game formats without a schema change
--      (Shamble, Scramble, Stableford, Match Play, Solo Stroke Play, etc.)
--   4. Preserves everything the Power BI report was built on: strokes
--      gained, to-par (gross/net/expected), handicap allowances, match
--      W/L, teammate pairing performance, team rank.
--
-- CONFIRMED FROM 2025 FORMULAS (traced Round tabs -> Admin - Teams & Handicaps):
--   - Handicap allowance is USGA-style, applied per game format:
--       Individual stroke play  -> Handicap Index x 95%
--       2-Man Scramble          -> (low partner x 35%) + (high partner x 15%)
--       4-Man Scramble          -> ranked weights 25% / 20% / 15% / 10% (low->high index)
--   - "Strokes Received" is always RELATIVE TO THE FIELD for that round:
--     the lowest adjusted handicap in the round plays scratch (0 strokes);
--     everyone else = ROUND(their adjusted handicap - field low, 0).
--     Those strokes are then distributed to holes by stroke index, with a
--     2nd stroke on the hardest holes once allowance exceeds 18.
--   - Tournament points are looked up from a per-round rank->points table
--     (varies by round/field size). TIES SPLIT POINTS: tied entries each
--     receive the AVERAGE of the point values for the ranks they occupy
--     (e.g. two entries tied for 1st/2nd each get avg(rank1_pts, rank2_pts)).
--   - Bonus points (e.g. "Low Net" in Round 1: 1.5 / 0.5) follow the SAME
--     rank->points shape as tournament points, just a separate, smaller,
--     round-specific pool — tracked distinctly per Jon's requirement that
--     bonus points remain separate from (not blended into) tournament points.
--
-- TEAM STABLEFORD & MATCH PLAY (traced from 2023-2025 workbooks; formats
-- changed between years, so BOTH variants are seeded below as distinct
-- game_formats rows -- 2026's rounds.format_id pick is still an open call):
--   - Team Stableford 2023 (live, 2 teams x 6): GROSS scoring, no handicap.
--     Points/hole: dbogey+2->0.5, bogey->1, par->2, birdie->3, eagle->5,
--     albatross->10. Team award: flat 3 pts win / 0 pts loss, ties 1.5/1.5.
--   - Team Stableford 2024 (live) / 2025 (unplayed template), 3 teams x 4:
--     95% Handicap Index (same as Individual Stroke Play), NET-to-par
--     scoring, points/hole: bogey+->0, par->1, birdie->3, eagle->5,
--     albatross->10. Team tournament points are RANK-based (confirmed
--     2024: 1st=4, 2nd=2, 3rd=0), plus a "Top Individual Finisher" bonus
--     (rank-based, 1st only, 1 pt).
--   - Both years' source sheets have the same bug: the albatross-or-better
--     tier's lookup key is stored as literal text ("IF -3" / ">-3") instead
--     of the number -3, so VLOOKUP silently fails and awards 0 instead of
--     the intended 10 pts. Not observed to affect any real historical
--     score, but do NOT replicate the bug -- points_alt_table below uses
--     the correct numeric to_par threshold.
--   - Match Play 2023 (live, 1v1 pairs): fully confirmed. Uses 100% of
--     RAW Handicap Index (not the 95%-reduced or 75%-reduced column used
--     elsewhere). Strokes received are scoped to the MATCH itself (lowest
--     handicap between the 2 opponents plays scratch), NOT round-wide like
--     every stroke-play format. 2 tournament pts per match win, plus 1
--     BONUS pt for most holes won overall (rank-based, 1st only).
--   - Match Play 2024/2025 "DNU - 1v1v1 (Match Play)" template (NEVER
--     ACTUALLY PLAYED): evolved to 3-player pods, same match-scoped 100%
--     raw-handicap treatment, but hole wins are FRACTION-SPLIT among tied
--     low scorers (e.g. 2-way tie for low = 0.5 holes won each) to rank
--     the 3 pod members. The tournament-points-per-pod-rank formula was
--     never finished in the source file -- genuinely incomplete, not just
--     undocumented. Needs a decision from Jon before this format goes live.
--
-- OPEN QUESTIONS FOR JON (flagged inline with -- ??):
--   - Which Team Stableford variant (2023 gross vs 2024/25 handicapped) and
--     which Match Play variant (2023 1v1 vs unfinished 1v1v1) is canonical
--     for 2026 -- both are seeded as separate game_formats rows for now.
--   - Full bonus point category list beyond "Low Net", "Top Individual
--     Finisher" (Team Stableford), and "Most Holes Won" (Match Play) --
--     e.g. CTP, long drive -- and whether any are FIXED awards (not
--     rank-based) e.g. a single CTP winner.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CORE REFERENCE ENTITIES
-- ----------------------------------------------------------------------------

CREATE TABLE players (
    player_id       SERIAL PRIMARY KEY,
    display_name    TEXT NOT NULL UNIQUE,   -- e.g. "Miller, J" — matches historical shorthand
    full_name       TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tournaments (
    tournament_id   SERIAL PRIMARY KEY,
    year            INT NOT NULL UNIQUE,
    name            TEXT NOT NULL DEFAULT 'Milfore Invitational',
    status          TEXT NOT NULL DEFAULT 'setup'
                        CHECK (status IN ('setup', 'in_progress', 'final')),
    start_date      DATE,
    end_date        DATE
);

CREATE TABLE teams (
    team_id         SERIAL PRIMARY KEY,
    tournament_id   INT NOT NULL REFERENCES tournaments(tournament_id),
    team_name       TEXT NOT NULL,           -- "Team 1", "Team 2", etc.
    UNIQUE (tournament_id, team_name)
);

-- Team rosters reshuffle every year, so membership is tournament-scoped, not global
CREATE TABLE team_memberships (
    tournament_id   INT NOT NULL REFERENCES tournaments(tournament_id),
    team_id         INT NOT NULL REFERENCES teams(team_id),
    player_id       INT NOT NULL REFERENCES players(player_id),
    PRIMARY KEY (tournament_id, player_id)
);

-- Handicap is looked up fresh each year (GHIN/SwingU), not a fixed player attribute
CREATE TABLE player_handicaps (
    tournament_id   INT NOT NULL REFERENCES tournaments(tournament_id),
    player_id       INT NOT NULL REFERENCES players(player_id),
    handicap_index  NUMERIC(4,1) NOT NULL,
    source          TEXT,                    -- 'GHIN', 'SwingU', manual, etc.
    PRIMARY KEY (tournament_id, player_id)
);

-- ----------------------------------------------------------------------------
-- GAME FORMATS  (reusable handicap allowance + play-style config)
-- This is what makes new formats addable without touching app code — a
-- future "6-Man Scramble" or new Stableford variant is just a new row here.
-- ----------------------------------------------------------------------------

CREATE TABLE game_formats (
    format_id           SERIAL PRIMARY KEY,
    format_name          TEXT NOT NULL UNIQUE,      -- 'Individual Stroke Play', '2-Man Scramble', '4-Man Scramble', 'Team Stableford', 'Match Play'
    grouping_size         INT NOT NULL,               -- 1 = individual, 2 = pairs, 3 = 1v1v1 pods, 4 = foursomes, 6 = 6-man teams
    scoring_style          TEXT NOT NULL,              -- 'stroke_play', 'stableford', 'match_play'
    handicap_method         TEXT NOT NULL
                                CHECK (handicap_method IN ('individual_pct', 'weighted_by_rank', 'none')),
    -- individual_pct: single multiplier applied to each player's index (e.g. 0.95, or 1.0 for Match Play's raw index)
    allowance_pct            NUMERIC(4,3),
    -- weighted_by_rank: ordered weights from LOWEST to HIGHEST handicap in the
    -- group, e.g. 2-Man Scramble = [0.35, 0.15]; 4-Man Scramble = [0.25, 0.20, 0.15, 0.10]
    rank_weights              NUMERIC(4,3)[],
    -- 'round': strokes_received is relative to the lowest adjusted handicap
    --   across the WHOLE round's field (every stroke-play/stableford format).
    -- 'match': strokes_received is relative to the lowest adjusted handicap
    --   within just this match's own participants (confirmed for BOTH
    --   Match Play variants, 2023 1v1 and the 2024/25 1v1v1 template —
    --   the "field" is your opponent(s), not the whole round).
    strokes_field_scope      TEXT NOT NULL DEFAULT 'round'
                                CHECK (strokes_field_scope IN ('round', 'match')),
    notes                     TEXT
);

-- Seed values confirmed from 2025 formulas — adjust/expand as new formats appear
INSERT INTO game_formats (format_name, grouping_size, scoring_style, handicap_method, allowance_pct, rank_weights, strokes_field_scope, notes) VALUES
    ('Individual Stroke Play', 1, 'stroke_play', 'individual_pct', 0.95, NULL, 'round', NULL),
    ('2-Man Scramble',         2, 'stroke_play', 'weighted_by_rank', NULL, ARRAY[0.35, 0.15], 'round', NULL),
    ('4-Man Scramble',         4, 'stroke_play', 'weighted_by_rank', NULL, ARRAY[0.25, 0.20, 0.15, 0.10], 'round', NULL),
    ('2-Man Shamble (2024/25 - 75% Individual)', 2, 'stroke_play', 'individual_pct', 0.75, NULL, 'round',
        'Confirmed via 2024 migration: unlike 2-Man Scramble, 2024/25 Shamble ("Cha Cha Cha") gives EACH partner their own 75% individual handicap allowance and their own gross/net score per hole -- NOT a shared team score. The hole''s team result is the BETTER (lower) of the two partners'' own net scores that hole (true shamble/best-ball, confirmed by reading the sheet''s own "Team N" aggregate row = MIN of the two partners'' net rows). 2023''s Shamble round used the OLD shared-score 2-Man Scramble formula (35%/15% weighted) instead -- point to that format_id for 2023 data.'),
    -- ?? Team Stableford & Match Play: BOTH historical variants are seeded below.
    -- Jon needs to pick which format_id each 2026 round should reference.
    ('Team Stableford (2023 - Gross, 2-Team)', 6, 'stableford', 'none', NULL, NULL, 'round',
        'Live 2023 only. No handicap applied (gross scoring). 2 teams of 6, team total = sum of all 6 players'' per-hole Stableford points. Team tournament points are a flat 3 (win) / 0 (loss), ties split 1.5/1.5 — NOT rank-based via points_rank_table.'),
    ('Team Stableford (2024/25 - 95% Handicap, 3-Team)', 4, 'stableford', 'individual_pct', 0.95, NULL, 'round',
        'Live 2024, carried as unmodified DNU template into 2025. 3 teams of 4, net-to-par Stableford scoring. Team tournament points ARE rank-based via points_rank_table (confirmed 2024: 1st=4, 2nd=2, 3rd=0). Also awards a rank-based "Top Individual Finisher" bonus (1st only, 1 pt) — see bonus_types.'),
    ('Match Play 1v1 (2023)', 2, 'match_play', 'individual_pct', 1.0, NULL, 'match',
        'Live 2023 only, fully confirmed. Uses 100% of RAW Handicap Index (not the 95%-reduced column used elsewhere). 2 tournament pts per match win, ties split. Plus a rank-based "Most Holes Won" bonus (1st only, 1 pt) — see bonus_types.'),
    ('Match Play 1v1v1 (2024/25 template - INCOMPLETE)', 3, 'match_play', 'individual_pct', 1.0, NULL, 'match',
        '?? NEVER ACTUALLY PLAYED — present only as a "DNU" template in 2024 and 2025. Same 100% raw-handicap treatment as the 2023 1v1 version, but 3-player pods where each hole''s win is fraction-split among tied low net scorers (e.g. 2-way tie for low = 0.5 holes won each) to rank the 3 pod members. The tournament-points-per-pod-rank formula was never finished in the source workbooks — needs a decision from Jon before this format can go live.'),
    ('Individual Stroke Play (2022 - Raw Handicap, Tiered Field)', 1, 'stroke_play', 'individual_pct', 1.0, NULL, 'match',
        'Confirmed via 2022 migration: 2022''s "Head-to-Head" round used 100% of RAW Handicap Index (not the 95%-reduced allowance used in 2024/25''s Individual Stroke Play), and strokes received are scoped to each 3-player "tier" grouping (players ranked 1st/2nd/3rd within their static season team, grouped across teams), not the whole round''s field -- confirmed by back-solving the sheet''s own HDCP/Strokes columns against the Teams sheet''s raw handicaps. Structurally closer to Match Play''s field-scoping than to the later Individual Stroke Play format, despite being plain stroke-play scoring.');

-- ----------------------------------------------------------------------------
-- COURSES & ROUND SETUP  (mirrors Admin - Setup + 3_HistoricalData_CourseInfo)
-- ----------------------------------------------------------------------------

CREATE TABLE courses (
    course_id       SERIAL PRIMARY KEY,
    course_name     TEXT NOT NULL UNIQUE,
    latitude        NUMERIC(9,6),
    longitude       NUMERIC(9,6)
);

-- A course's tee/par/rating can differ by year (different tees chosen, course changes),
-- so round setup is its own versioned entity rather than living directly on `courses`.
CREATE TABLE rounds (
    round_id            SERIAL PRIMARY KEY,
    tournament_id       INT NOT NULL REFERENCES tournaments(tournament_id),
    round_number        INT NOT NULL,             -- 1, 2, 3, 4
    course_id           INT NOT NULL REFERENCES courses(course_id),
    round_date          DATE,
    first_tee_time      TIME,
    tee_color           TEXT,
    course_par          INT,
    course_rating       NUMERIC(4,1),
    slope_rating         INT,
    total_yardage        INT,
    event_category       TEXT NOT NULL,           -- 'Individual', '2-Man', '4-Man', etc. — DISPLAY label only
    event_name           TEXT NOT NULL,           -- 'Cha Cha Cha', 'Scramble', 'Solo Stroke Play' — DISPLAY label only
    scoring_type          TEXT NOT NULL,           -- 'Stroke Play', 'Stableford', 'Match Play' — DISPLAY label only
    format_id              INT NOT NULL REFERENCES game_formats(format_id),  -- drives ACTUAL handicap/scoring computation
    handicap_adjusted     BOOLEAN NOT NULL DEFAULT TRUE,
    status                TEXT NOT NULL DEFAULT 'not_started'
                              CHECK (status IN ('not_started', 'in_progress', 'final')),
    UNIQUE (tournament_id, round_number)
);

CREATE TABLE round_holes (
    round_id        INT NOT NULL REFERENCES rounds(round_id),
    hole_no         INT NOT NULL CHECK (hole_no BETWEEN 1 AND 18),
    par             INT NOT NULL,
    yardage         INT,
    stroke_index    INT,                     -- course "Handicap" column (hole difficulty rank)
    PRIMARY KEY (round_id, hole_no)
);

-- ----------------------------------------------------------------------------
-- MATCHES / GROUPINGS  (the "1.1, 1.2, ..." Match ID pattern from every sheet)
-- ----------------------------------------------------------------------------

-- A "match" is a scoring group within a round: a 2-man pairing, a 4-man team,
-- a 1v1v1 match play pod, etc. This is what Match ID (e.g. 1.1) represents.
CREATE TABLE matches (
    match_id        SERIAL PRIMARY KEY,
    round_id        INT NOT NULL REFERENCES rounds(round_id),
    match_number    NUMERIC(4,1) NOT NULL,   -- preserves "1.1" style numbering for continuity
    team_id         INT REFERENCES teams(team_id),  -- nullable: some formats mix teams (match play pods)
    UNIQUE (round_id, match_number)
);

CREATE TABLE match_participants (
    match_id             INT NOT NULL REFERENCES matches(match_id),
    player_id            INT NOT NULL REFERENCES players(player_id),
    team_id              INT NOT NULL REFERENCES teams(team_id),
    -- Full allowance chain, mirrors the 2025 formula trace exactly:
    handicap_index_snapshot   NUMERIC(4,1),   -- player_handicaps value at time of round (audit trail)
    adjusted_handicap          NUMERIC(5,2),   -- after game_formats.allowance_pct OR rank_weights applied
                                                 -- (for weighted_by_rank formats, same value repeats for all
                                                 --  teammates in the match — it's a team-level figure)
    strokes_received             INT,           -- ROUND(adjusted_handicap - field-low adjusted_handicap, 0)
                                                 -- "field-low" scope depends on games_formats.strokes_field_scope
                                                 -- for this match's format:
                                                 --   'round' = lowest adjusted_handicap across ALL matches in
                                                 --     the same round (stroke_play/stableford formats)
                                                 --   'match' = lowest adjusted_handicap among just THIS match's
                                                 --     own participants (both confirmed Match Play variants —
                                                 --     your opponent(s) are the field, not the whole round)
    PRIMARY KEY (match_id, player_id)
);

-- ----------------------------------------------------------------------------
-- SCORING — DETAIL (hole-by-hole) & SUMMARY (per round/match/player)
-- Mirrors 1b/2b_..._Detailed and 1a/2a_..._Summary tabs, unified.
-- ----------------------------------------------------------------------------

CREATE TABLE hole_scores (
    match_id        INT NOT NULL REFERENCES matches(match_id),
    player_id       INT NOT NULL REFERENCES players(player_id),
    hole_no         INT NOT NULL CHECK (hole_no BETWEEN 1 AND 18),
    gross_strokes   INT,        -- null = not yet entered (live tracking state)
    entered_at      TIMESTAMPTZ DEFAULT now(),
    entered_by      TEXT,       -- device/session identifier, for audit trail on shared links
    PRIMARY KEY (match_id, player_id, hole_no)
);

-- Net strokes, strokes gained, points, and rank are DERIVED values.
-- Store them here as a materialized summary (refreshed on score entry) for
-- fast leaderboard/analytics reads, rather than recomputing on every query.
CREATE TABLE round_results (
    match_id                    INT NOT NULL REFERENCES matches(match_id),
    player_id                   INT NOT NULL REFERENCES players(player_id),
    gross_strokes                INT,
    net_strokes                  NUMERIC(5,1),
    event_score                  NUMERIC(6,2),   -- format-specific: net score, stableford pts, etc.
    matchup_rank                  INT,            -- rank BEFORE tie-averaging (raw finish position)
    is_tied                       BOOLEAN NOT NULL DEFAULT FALSE,
    tournament_points              NUMERIC(5,2),   -- AFTER tie-averaging is applied (see points_rank_table)
    match_result                  TEXT,           -- 'W'/'L'/'T' for match play formats
    strokes_gained_gross           NUMERIC(5,2),
    strokes_gained_net             NUMERIC(5,2),
    PRIMARY KEY (match_id, player_id)
);

-- Bonus points (e.g. "Low Net") — kept as their OWN pool, distinct from
-- tournament_points above, per requirement that bonus points never blend
-- into the main point total silently. Reuses the same rank->points shape.
CREATE TABLE bonus_types (
    bonus_type_id    SERIAL PRIMARY KEY,
    bonus_name        TEXT NOT NULL UNIQUE,     -- 'Low Net', 'CTP', 'Long Drive', 'Top Individual Finisher', 'Most Holes Won'
    award_method       TEXT NOT NULL
                           CHECK (award_method IN ('rank_based', 'fixed')),
    notes              TEXT
);
-- Confirmed so far, all rank_based with only a 1st-place row populated in
-- bonus_rank_table (i.e. a single-winner award, not a full field payout):
--   - 'Low Net' (2-Man Shamble/Scramble rounds): 1st = 1.5 pts, 2nd = 0.5 pts
--   - 'Top Individual Finisher' (Team Stableford 2024/25): 1st = 1 pt
--   - 'Most Holes Won' (Match Play 2023 1v1): 1st = 1 pt
-- ?? confirm full list beyond these (CTP, Long Drive, etc.) and which are fixed vs rank-based
-- (note: Par-3 Closest-to-Pin and Hole-in-One pots are side CASH games settled
-- outside the tournament-points system across all traced years — not bonus_points)

CREATE TABLE bonus_rank_table (
    bonus_type_id    INT NOT NULL REFERENCES bonus_types(bonus_type_id),
    round_id         INT NOT NULL REFERENCES rounds(round_id),
    rank             INT NOT NULL,
    points           NUMERIC(4,2) NOT NULL,
    PRIMARY KEY (bonus_type_id, round_id, rank)
);

-- The actual awarded instance — one row per player per bonus per round
CREATE TABLE bonus_points (
    bonus_id        SERIAL PRIMARY KEY,
    round_id        INT NOT NULL REFERENCES rounds(round_id),
    bonus_type_id   INT NOT NULL REFERENCES bonus_types(bonus_type_id),
    player_id       INT NOT NULL REFERENCES players(player_id),
    points          NUMERIC(4,2) NOT NULL,
    is_tied         BOOLEAN NOT NULL DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- POINTS CONFIGURATION  (mirrors 1_EventData / 1_AltPoints — keeps rules data-driven)
-- ----------------------------------------------------------------------------

-- Rank-based points table per round (varies by field size / format each year).
-- TIE RULE (application-level, confirmed from 2025 Leaderboard): when N entries
-- tie for a rank span, each receives AVG(points_rank..points_rank+N-1).
CREATE TABLE points_rank_table (
    tournament_id   INT NOT NULL REFERENCES tournaments(tournament_id),
    round_id        INT NOT NULL REFERENCES rounds(round_id),
    rank            INT NOT NULL,
    points          NUMERIC(4,2) NOT NULL,
    PRIMARY KEY (round_id, rank)
);

-- Threshold-based points for Stableford-style scoring (to-par -> points).
-- SCOPED PER ROUND: confirmed the curve itself changes between years, not just
-- the field/rank tables. 2023 Team Stableford (gross, metric 'To Par - Gross'):
-- dbogey+2->0.5, bogey->1, par->2, birdie->3, eagle->5, albatross(to_par<=-3)->10.
-- 2024/25 Team Stableford (net, metric 'To Par - Net'): bogey+1 or worse->0,
-- par->1, birdie->3, eagle->5, albatross(to_par<=-3)->10. Populate per-round
-- during migration/setup rather than assuming one global curve.
CREATE TABLE points_alt_table (
    round_id        INT NOT NULL REFERENCES rounds(round_id),
    scoring_type    TEXT NOT NULL,
    metric          TEXT NOT NULL,       -- 'To Par - Gross', 'To Par - Net'
    to_par           INT NOT NULL,
    points           NUMERIC(4,2) NOT NULL,
    PRIMARY KEY (round_id, scoring_type, metric, to_par)
);

-- ----------------------------------------------------------------------------
-- CONVENIENCE VIEWS (starting points — expand as analytics needs grow)
-- ----------------------------------------------------------------------------

-- Team standings, any tournament.
-- IMPORTANT: teammates who share one award (a 2-Man pair, a 6-man Team
-- Stableford roster, etc.) all carry the SAME tournament_points value on
-- their own round_results row -- confirmed via 2023 migration, where naively
-- summing per-player rows gave Team 1 = 38 points against a real, source-
-- verified season total of 17. Dedupe to one row per (match, team) award
-- BEFORE summing, or every shared award gets counted once per teammate.
CREATE VIEW v_team_standings AS
SELECT t.tournament_id, tm.team_id, tm.team_name,
       SUM(match_award.tournament_points) AS total_points
FROM (
    SELECT DISTINCT rr.match_id, mp.team_id, rr.tournament_points
    FROM round_results rr
    JOIN match_participants mp ON mp.match_id = rr.match_id AND mp.player_id = rr.player_id
) match_award
JOIN teams tm ON tm.team_id = match_award.team_id
JOIN matches m ON m.match_id = match_award.match_id
JOIN rounds r ON r.round_id = m.round_id
JOIN tournaments t ON t.tournament_id = r.tournament_id
GROUP BY t.tournament_id, tm.team_id, tm.team_name;

-- Career player stats across all years — the heart of "Individual Analytics"
CREATE VIEW v_player_career_stats AS
SELECT p.player_id, p.display_name,
       COUNT(DISTINCT r.tournament_id) AS years_played,
       AVG(rr.strokes_gained_gross) AS avg_strokes_gained_gross,
       AVG(rr.strokes_gained_net) AS avg_strokes_gained_net,
       SUM(rr.tournament_points) AS career_points
FROM round_results rr
JOIN players p ON p.player_id = rr.player_id
JOIN matches m ON m.match_id = rr.match_id
JOIN rounds r ON r.round_id = m.round_id
GROUP BY p.player_id, p.display_name;

-- ============================================================================
-- ROW LEVEL SECURITY
-- Access model: trusted ~12-person friend group, no user accounts (per the
-- brief's "shareable links, not accounts" decision). The React app talks to
-- Supabase with the public "anon" key from the browser, so RLS is the real
-- security boundary here -- that key is not a secret.
--   - LIVE-SCORING tables (hole_scores, round_results, bonus_points): public
--     read + write, so any player can enter their own group's scores from
--     their phone with no login.
--   - SETUP/ADMIN tables (everything else): public READ only (leaderboards
--     and history need this), but NO write policy for anon. Writes (new
--     tournament, teams, handicaps, round/course setup, format config) go
--     through the Supabase Studio dashboard or a script using the
--     service_role key, which bypasses RLS by design -- "admin" is a key,
--     not a user account, matching the no-accounts decision.
--   - CAVEAT: round_results and bonus_points are DERIVED values (net score,
--     points, rank) that the client recomputes and writes directly, since
--     there's no backend/trigger computing them server-side. A bad-faith
--     anon-key user could in theory write a fabricated total directly,
--     bypassing the scoring formulas -- effectively the same trust exposure
--     as just mis-entering your own gross score, so acceptable for this
--     group, but worth revisiting with a Postgres trigger/function later if
--     that stops being an acceptable tradeoff.
-- ============================================================================

-- Live-scoring tables: public read + write
ALTER TABLE hole_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON hole_scores FOR SELECT USING (true);
CREATE POLICY "public insert" ON hole_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON hole_scores FOR UPDATE USING (true) WITH CHECK (true);

ALTER TABLE round_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON round_results FOR SELECT USING (true);
CREATE POLICY "public insert" ON round_results FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON round_results FOR UPDATE USING (true) WITH CHECK (true);

ALTER TABLE bonus_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON bonus_points FOR SELECT USING (true);
CREATE POLICY "public insert" ON bonus_points FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON bonus_points FOR UPDATE USING (true) WITH CHECK (true);

-- Setup/admin tables: public read only; writes via service_role (dashboard/script)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON players FOR SELECT USING (true);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON tournaments FOR SELECT USING (true);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON teams FOR SELECT USING (true);

ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON team_memberships FOR SELECT USING (true);

ALTER TABLE player_handicaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON player_handicaps FOR SELECT USING (true);

ALTER TABLE game_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON game_formats FOR SELECT USING (true);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON courses FOR SELECT USING (true);

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON rounds FOR SELECT USING (true);

ALTER TABLE round_holes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON round_holes FOR SELECT USING (true);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON matches FOR SELECT USING (true);

ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON match_participants FOR SELECT USING (true);

ALTER TABLE bonus_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON bonus_types FOR SELECT USING (true);

ALTER TABLE bonus_rank_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON bonus_rank_table FOR SELECT USING (true);

ALTER TABLE points_rank_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON points_rank_table FOR SELECT USING (true);

ALTER TABLE points_alt_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON points_alt_table FOR SELECT USING (true);

-- Views run as the querying user (anon), not the view owner, so the RLS
-- policies above are actually enforced through the view instead of bypassed
-- (Supabase's "Security Definer View" lint otherwise flags this).
ALTER VIEW v_team_standings SET (security_invoker = true);
ALTER VIEW v_player_career_stats SET (security_invoker = true);
