import os
from dotenv import load_dotenv
import psycopg2

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "updated.env"))
conn = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
cur = conn.cursor()

for label, q in [
    ("players", "select count(*) from players"),
    ("teams (2023)", "select count(*) from teams t join tournaments tm on tm.tournament_id=t.tournament_id where tm.year=2023"),
    ("rounds (2023)", "select count(*) from rounds r join tournaments tm on tm.tournament_id=r.tournament_id where tm.year=2023"),
    ("matches (2023)", "select count(*) from matches m join rounds r on r.round_id=m.round_id join tournaments tm on tm.tournament_id=r.tournament_id where tm.year=2023"),
    ("hole_scores (2023)", "select count(*) from hole_scores hs join matches m on m.match_id=hs.match_id join rounds r on r.round_id=m.round_id join tournaments tm on tm.tournament_id=r.tournament_id where tm.year=2023"),
    ("round_results (2023)", "select count(*) from round_results rr join matches m on m.match_id=rr.match_id join rounds r on r.round_id=m.round_id join tournaments tm on tm.tournament_id=r.tournament_id where tm.year=2023"),
]:
    cur.execute(q)
    print(f"{label}: {cur.fetchone()[0]}")

print()
print("v_team_standings for 2023:")
cur.execute("""
    select team_name, total_points from v_team_standings v
    join tournaments t on t.tournament_id = v.tournament_id
    where t.year = 2023
""")
for row in cur.fetchall():
    print(" ", row)

print()
print("Team Stableford round_results check (round 3):")
cur.execute("""
    select p.display_name, t.team_name, rr.gross_strokes, rr.event_score, rr.tournament_points
    from round_results rr
    join matches m on m.match_id = rr.match_id
    join rounds r on r.round_id = m.round_id
    join tournaments tm on tm.tournament_id = r.tournament_id
    join players p on p.player_id = rr.player_id
    join match_participants mp on mp.match_id=rr.match_id and mp.player_id=rr.player_id
    join teams t on t.team_id = mp.team_id
    where tm.year = 2023 and r.round_number = 3
    order by t.team_name, p.display_name
""")
for row in cur.fetchall():
    print(" ", row)

cur.close()
conn.close()
