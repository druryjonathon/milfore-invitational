"""
Pure functions replicating the CONFIRMED handicap/scoring formulas from
milfore_schema_v2.sql's game_formats seed rows. Used to derive
adjusted_handicap / strokes_received ourselves instead of scraping the
source workbooks' pre-computed cells (several of which are broken with
#REF!/#NAME? errors in the 2024/2025 files).
"""


def adjusted_handicap_individual_pct(handicap_index, pct):
    return round(handicap_index * pct, 2)


def adjusted_handicap_weighted_by_rank(handicaps, weights):
    """handicaps: list of raw handicap_index for the group, LOW to HIGH.
    weights: e.g. [0.35, 0.15] for 2-Man, [0.25, 0.20, 0.15, 0.10] for 4-Man.
    Returns a single team-level adjusted handicap (same value for every teammate)."""
    ordered = sorted(handicaps)
    return round(sum(h * w for h, w in zip(ordered, weights)), 2)


def strokes_received_for_field(adjusted_handicaps_by_player, field_low=None):
    """adjusted_handicaps_by_player: {player_key: adjusted_handicap}
    field_low: override the field-low value (e.g. round-wide low for stroke-play
    formats vs match-local low for Match Play). If None, uses the min of the
    dict itself (i.e. the dict IS the field).
    Returns {player_key: strokes_received}"""
    low = field_low if field_low is not None else min(adjusted_handicaps_by_player.values())
    return {
        k: round(v - low)
        for k, v in adjusted_handicaps_by_player.items()
    }


def strokes_on_hole(stroke_index, total_strokes_received):
    """Confirmed distribution rule: 1 stroke on each of the N hardest holes
    (by stroke index, 1=hardest) up to total_strokes_received; once that
    total exceeds 18, every hole gets a base stroke and the hardest
    (total-18) holes get a 2nd."""
    if total_strokes_received <= 18:
        return 1 if stroke_index <= total_strokes_received else 0
    return 2 if stroke_index <= (total_strokes_received - 18) else 1
