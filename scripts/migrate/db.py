import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "updated.env"))


def connect():
    db_url = os.environ["SUPABASE_DB_URL"]
    return psycopg2.connect(db_url)


def get_or_create_tournament(cur, year):
    cur.execute("select tournament_id from tournaments where year=%s", (year,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "insert into tournaments (year, status) values (%s, 'final') returning tournament_id",
        (year,),
    )
    return cur.fetchone()[0]


def get_or_create_player(cur, display_name):
    cur.execute("select player_id from players where display_name=%s", (display_name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "insert into players (display_name) values (%s) returning player_id",
        (display_name,),
    )
    return cur.fetchone()[0]


def get_or_create_team(cur, tournament_id, team_name):
    cur.execute(
        "select team_id from teams where tournament_id=%s and team_name=%s",
        (tournament_id, team_name),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "insert into teams (tournament_id, team_name) values (%s, %s) returning team_id",
        (tournament_id, team_name),
    )
    return cur.fetchone()[0]


def upsert_team_membership(cur, tournament_id, team_id, player_id):
    cur.execute(
        """
        insert into team_memberships (tournament_id, team_id, player_id)
        values (%s, %s, %s)
        on conflict (tournament_id, player_id) do update set team_id = excluded.team_id
        """,
        (tournament_id, team_id, player_id),
    )


def upsert_player_handicap(cur, tournament_id, player_id, handicap_index, source=None):
    if handicap_index is None:
        return
    cur.execute(
        """
        insert into player_handicaps (tournament_id, player_id, handicap_index, source)
        values (%s, %s, %s, %s)
        on conflict (tournament_id, player_id) do update
          set handicap_index = excluded.handicap_index, source = excluded.source
        """,
        (tournament_id, player_id, handicap_index, source),
    )


def get_format_id(cur, format_name):
    cur.execute("select format_id from game_formats where format_name=%s", (format_name,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Unknown game_formats.format_name: {format_name!r}")
    return row[0]


def get_or_create_course(cur, course_name, latitude=None, longitude=None):
    cur.execute("select course_id from courses where course_name=%s", (course_name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "insert into courses (course_name, latitude, longitude) values (%s, %s, %s) returning course_id",
        (course_name, latitude, longitude),
    )
    return cur.fetchone()[0]


def upsert_round(cur, tournament_id, round_number, course_id, round_data):
    cur.execute(
        """
        insert into rounds (
            tournament_id, round_number, course_id, round_date, first_tee_time,
            tee_color, course_par, course_rating, slope_rating, total_yardage,
            event_category, event_name, scoring_type, format_id, handicap_adjusted, status
        ) values (
            %(tournament_id)s, %(round_number)s, %(course_id)s, %(round_date)s, %(first_tee_time)s,
            %(tee_color)s, %(course_par)s, %(course_rating)s, %(slope_rating)s, %(total_yardage)s,
            %(event_category)s, %(event_name)s, %(scoring_type)s, %(format_id)s, %(handicap_adjusted)s, 'final'
        )
        on conflict (tournament_id, round_number) do update set
            course_id = excluded.course_id, round_date = excluded.round_date,
            first_tee_time = excluded.first_tee_time, tee_color = excluded.tee_color,
            course_par = excluded.course_par, course_rating = excluded.course_rating,
            slope_rating = excluded.slope_rating, total_yardage = excluded.total_yardage,
            event_category = excluded.event_category, event_name = excluded.event_name,
            scoring_type = excluded.scoring_type, format_id = excluded.format_id,
            handicap_adjusted = excluded.handicap_adjusted
        returning round_id
        """,
        {
            "tournament_id": tournament_id,
            "round_number": round_number,
            "course_id": course_id,
            **round_data,
        },
    )
    return cur.fetchone()[0]


def upsert_round_hole(cur, round_id, hole_no, par, yardage, stroke_index):
    cur.execute(
        """
        insert into round_holes (round_id, hole_no, par, yardage, stroke_index)
        values (%s, %s, %s, %s, %s)
        on conflict (round_id, hole_no) do update
          set par = excluded.par, yardage = excluded.yardage, stroke_index = excluded.stroke_index
        """,
        (round_id, hole_no, par, yardage, stroke_index),
    )


def upsert_match(cur, round_id, match_number, team_id=None):
    cur.execute(
        """
        insert into matches (round_id, match_number, team_id)
        values (%s, %s, %s)
        on conflict (round_id, match_number) do update set team_id = excluded.team_id
        returning match_id
        """,
        (round_id, match_number, team_id),
    )
    return cur.fetchone()[0]


def upsert_match_participant(cur, match_id, player_id, team_id, handicap_index_snapshot,
                              adjusted_handicap, strokes_received):
    cur.execute(
        """
        insert into match_participants (
            match_id, player_id, team_id, handicap_index_snapshot, adjusted_handicap, strokes_received
        ) values (%s, %s, %s, %s, %s, %s)
        on conflict (match_id, player_id) do update set
            team_id = excluded.team_id,
            handicap_index_snapshot = excluded.handicap_index_snapshot,
            adjusted_handicap = excluded.adjusted_handicap,
            strokes_received = excluded.strokes_received
        """,
        (match_id, player_id, team_id, handicap_index_snapshot, adjusted_handicap, strokes_received),
    )


def upsert_hole_score(cur, match_id, player_id, hole_no, gross_strokes, entered_by="migration"):
    if gross_strokes is None:
        return
    cur.execute(
        """
        insert into hole_scores (match_id, player_id, hole_no, gross_strokes, entered_by)
        values (%s, %s, %s, %s, %s)
        on conflict (match_id, player_id, hole_no) do update
          set gross_strokes = excluded.gross_strokes, entered_by = excluded.entered_by
        """,
        (match_id, player_id, hole_no, gross_strokes, entered_by),
    )


def upsert_round_result(cur, match_id, player_id, gross_strokes, net_strokes, event_score,
                         matchup_rank, is_tied, tournament_points, match_result):
    cur.execute(
        """
        insert into round_results (
            match_id, player_id, gross_strokes, net_strokes, event_score,
            matchup_rank, is_tied, tournament_points, match_result
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (match_id, player_id) do update set
            gross_strokes = excluded.gross_strokes, net_strokes = excluded.net_strokes,
            event_score = excluded.event_score, matchup_rank = excluded.matchup_rank,
            is_tied = excluded.is_tied, tournament_points = excluded.tournament_points,
            match_result = excluded.match_result
        """,
        (match_id, player_id, gross_strokes, net_strokes, event_score,
         matchup_rank, is_tied, tournament_points, match_result),
    )


def get_or_create_bonus_type(cur, bonus_name, award_method="rank_based"):
    cur.execute("select bonus_type_id from bonus_types where bonus_name=%s", (bonus_name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "insert into bonus_types (bonus_name, award_method) values (%s, %s) returning bonus_type_id",
        (bonus_name, award_method),
    )
    return cur.fetchone()[0]


def insert_bonus_point(cur, round_id, bonus_type_id, player_id, points, is_tied=False):
    cur.execute(
        """
        insert into bonus_points (round_id, bonus_type_id, player_id, points, is_tied)
        values (%s, %s, %s, %s, %s)
        """,
        (round_id, bonus_type_id, player_id, points, is_tied),
    )
