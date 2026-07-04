import os
import sys
from dotenv import load_dotenv
import psycopg2

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "updated.env"))

db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    print("SUPABASE_DB_URL not found in updated.env")
    sys.exit(1)

conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("select count(*) from game_formats;")
print("game_formats rows:", cur.fetchone()[0])
cur.execute("select format_name from game_formats order by format_id;")
for row in cur.fetchall():
    print(" -", row[0])
cur.close()
conn.close()
print("Connection OK")
