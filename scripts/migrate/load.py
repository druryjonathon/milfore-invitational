from . import db
from .compute import adjusted_handicap_individual_pct, adjusted_handicap_weighted_by_rank, strokes_received_for_field

GAME_FORMAT_RULES = {
    "Individual Stroke Play": dict(scoring_style="stroke_play", handicap_method="individual_pct", pct=0.95, field_scope="round"),
    "2-Man Scramble": dict(scoring_style="stroke_play", handicap_method="weighted_by_rank", weights=[0.35, 0.15], field_scope="round"),
    "2-Man Shamble (2024/25 - 75% Individual)": dict(scoring_style="stroke_play", handicap_method="individual_pct", pct=0.75, field_scope="round"),
    "4-Man Scramble": dict(scoring_style="stroke_play", handicap_method="weighted_by_rank", weights=[0.25, 0.20, 0.15, 0.10], field_scope="round"),
    "Team Stableford (2023 - Gross, 2-Team)": dict(scoring_style="stableford", handicap_method="none", field_scope="round"),
    "Team Stableford (2024/25 - 95% Handicap, 3-Team)": dict(scoring_style="stableford", handicap_method="individual_pct", pct=0.95, field_scope="round"),
    "Match Play 1v1 (2023)": dict(scoring_style="match_play", handicap_method="individual_pct", pct=1.0, field_scope="match"),
    "Match Play 1v1v1 (2024/25 template - INCOMPLETE)": dict(scoring_style="match_play", handicap_method="individual_pct", pct=1.0, field_scope="match"),
    "Individual Stroke Play (2022 - Raw Handicap, Tiered Field)": dict(scoring_style="stroke_play", handicap_method="individual_pct", pct=1.0, field_scope="match"),
}


def load_year(cur, year, rounds, dry_run=False):
    tournament_id = None if dry_run else db.get_or_create_tournament(cur, year)
    log = []

    if not dry_run:
        # bonus_points has no natural conflict key -- clear this tournament's
        # rows first so re-running the loader doesn't duplicate bonus awards.
        cur.execute(
            """
            delete from bonus_points where round_id in (
                select round_id from rounds where tournament_id = %s
            )
            """,
            (tournament_id,),
        )

    for rd in rounds:
        rule = GAME_FORMAT_RULES[rd["format_name"]]
        format_id = None if dry_run else db.get_format_id(cur, rd["format_name"])
        course_id = None if dry_run else db.get_or_create_course(cur, rd["course_name"])

        holes_par_total = sum(h["par"] for h in rd["holes"] if h["par"]) or None
        round_row = dict(
            round_date=rd.get("round_date"), first_tee_time=None, tee_color=rd.get("tee_color"),
            course_par=holes_par_total, course_rating=None, slope_rating=None, total_yardage=None,
            event_category=rd["event_category"], event_name=rd["event_name"],
            scoring_type=rd["scoring_type"], format_id=format_id, handicap_adjusted=rd["handicap_adjusted"],
        )
        round_id = None if dry_run else db.upsert_round(cur, tournament_id, rd["round_number"], course_id, round_row)

        if not dry_run:
            for h in rd["holes"]:
                if h["par"] is not None:
                    db.upsert_round_hole(cur, round_id, h["hole_no"], h["par"], h["yardage"], h["stroke_index"])

        # ---- compute adjusted handicaps for every match in this round ----
        round_pool = {}  # key -> adjusted_handicap, pooled across the whole round (for field_scope='round')
        for m in rd["matches"]:
            for team_name, players in m["team_players"].items():
                key = (m["match_number"], team_name)
                if rule["handicap_method"] == "none":
                    continue
                elif rule["handicap_method"] == "individual_pct":
                    for p in players:
                        if p["handicap_index"] is not None:
                            p["_adj"] = adjusted_handicap_individual_pct(p["handicap_index"], rule["pct"])
                            round_pool[(m["match_number"], p["name"])] = p["_adj"]
                elif rule["handicap_method"] == "weighted_by_rank":
                    hdcps = [p["handicap_index"] for p in players if p["handicap_index"] is not None]
                    if len(hdcps) == len(players) and hdcps:
                        adj = adjusted_handicap_weighted_by_rank(hdcps, rule["weights"])
                        for p in players:
                            p["_adj"] = adj
                        round_pool[key] = adj

        for m in rd["matches"]:
            if rule["field_scope"] == "round":
                pool = round_pool
            else:
                pool = {}
                for team_name, players in m["team_players"].items():
                    if rule["handicap_method"] == "individual_pct":
                        for p in players:
                            if "_adj" in p:
                                pool[(m["match_number"], p["name"])] = p["_adj"]
                    elif rule["handicap_method"] == "weighted_by_rank":
                        if "_adj" in players[0]:
                            pool[(m["match_number"], team_name)] = players[0]["_adj"]
            strokes = strokes_received_for_field(pool) if pool else {}

            match_id = None if dry_run else db.upsert_match(cur, round_id, m["match_number"])

            for team_name, players in m["team_players"].items():
                team_id = None if not dry_run else None
                if not dry_run:
                    team_id = db.get_or_create_team(cur, tournament_id, team_name)
                for p in players:
                    player_id = None if dry_run else db.get_or_create_player(cur, p["name"])
                    if not dry_run:
                        db.upsert_team_membership(cur, tournament_id, team_id, player_id)
                        db.upsert_player_handicap(cur, tournament_id, player_id, p["handicap_index"], source="workbook migration")

                    if rule["handicap_method"] == "individual_pct":
                        sr = strokes.get((m["match_number"], p["name"]))
                    elif rule["handicap_method"] == "weighted_by_rank":
                        sr = strokes.get((m["match_number"], team_name))
                    else:
                        sr = None

                    if not dry_run:
                        db.upsert_match_participant(
                            cur, match_id, player_id, team_id,
                            p["handicap_index"], p.get("_adj"), sr,
                        )
                        assumed_holes = p.get("_assumed_holes") or set()
                        for i, g in enumerate(p["gross_scores"]):
                            if g is not None:
                                entered_by = "migration-assumed-net-par" if (i + 1) in assumed_holes else "migration"
                                db.upsert_hole_score(cur, match_id, player_id, i + 1, g, entered_by=entered_by)

                    gross_total = sum(g for g in p["gross_scores"] if g is not None) or None
                    p["_gross_total"] = gross_total
                    p["_player_id"] = player_id
                    p["_team_id"] = team_id

            entries = m.get("leaderboard_entries", [])
            team_order = list(m["team_players"].keys())
            for idx, team_name in enumerate(team_order):
                entry = entries[idx] if idx < len(entries) else None
                players = m["team_players"][team_name]
                for p in players:
                    net_strokes = entry["event_score"] if (entry and rule["scoring_style"] == "stroke_play") else None
                    event_score = entry["event_score"] if entry else None
                    tournament_points = entry["points"] if entry else None
                    matchup_rank = entry["rank"] if entry else None
                    match_result = None
                    if entry and rule["scoring_style"] == "match_play":
                        match_result = "W" if tournament_points and tournament_points > (min(e["points"] for e in entries) if entries else 0) else ("T" if len(set(e["points"] for e in entries)) == 1 else "L")
                    is_tied = bool(entry) and sum(1 for e in entries if e.get("points") == entry.get("points")) > 1
                    if not dry_run:
                        db.upsert_round_result(
                            cur, match_id, p["_player_id"], p["_gross_total"], net_strokes, event_score,
                            matchup_rank, is_tied, tournament_points, match_result,
                        )
                        bonus_pts = entry.get("bonus_pts") if entry else None
                        if bonus_pts and rd.get("bonus_name"):
                            bonus_type_id = db.get_or_create_bonus_type(cur, rd["bonus_name"])
                            db.insert_bonus_point(cur, round_id, bonus_type_id, p["_player_id"], bonus_pts)
                    log.append((rd["round_number"], m["match_number"], team_name, p["name"], p["_gross_total"], event_score, tournament_points))

        ib = rd.get("individual_bonus")
        if ib and not dry_run:
            bonus_type_id = db.get_or_create_bonus_type(cur, rd["bonus_name"])
            player_id = db.get_or_create_player(cur, ib["player_name"])
            db.insert_bonus_point(cur, round_id, bonus_type_id, player_id, ib["points"])

        for player_name, points in (rd.get("bonus_recipients") or []):
            if not dry_run:
                bonus_type_id = db.get_or_create_bonus_type(cur, rd["bonus_name"])
                player_id = db.get_or_create_player(cur, player_name)
                db.insert_bonus_point(cur, round_id, bonus_type_id, player_id, points)

    return log
