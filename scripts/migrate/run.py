import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
os.chdir(os.path.join(os.path.dirname(__file__), "..", ".."))

from scripts.migrate import db
from scripts.migrate.load import load_year

EXTRACTORS = {}


def _lazy_extractors():
    if not EXTRACTORS:
        from scripts.migrate import extract_2022, extract_2023, extract_2024, extract_2025
        EXTRACTORS[2022] = extract_2022.extract
        EXTRACTORS[2023] = extract_2023.extract
        EXTRACTORS[2024] = extract_2024.extract
        EXTRACTORS[2025] = extract_2025.extract
    return EXTRACTORS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--commit", action="store_true", help="Actually write to Supabase. Default is dry-run.")
    args = ap.parse_args()

    extractors = _lazy_extractors()
    if args.year not in extractors:
        print(f"No extractor yet for {args.year}. Available: {list(extractors)}")
        sys.exit(1)

    rounds = extractors[args.year]()

    if not args.commit:
        conn = None
        cur = _DryCursor()
        log = load_year(cur, args.year, rounds, dry_run=True)
        print(f"DRY RUN for {args.year} -- {len(log)} round_results rows would be written")
        for r in log:
            print(" ", r)
        return

    conn = db.connect()
    cur = conn.cursor()
    try:
        log = load_year(cur, args.year, rounds, dry_run=False)
        conn.commit()
        print(f"Committed {args.year}: {len(log)} round_results rows written")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


class _DryCursor:
    def execute(self, *a, **k):
        pass

    def fetchone(self):
        return None


if __name__ == "__main__":
    main()
