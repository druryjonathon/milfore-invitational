# Milfore Invitational — Data Platform Rebuild: Handoff Brief

## Context

The Milfore Invitational is an annual multi-day golf tournament for a group of ~12 high school/college friends. Each year's tournament has lived in a siloed Google Sheet (2021–2025 archives exist), with a hand-built Power BI file attempting year-over-year analytics on top — manually re-derived from copy/paste each year, not refreshable or shareable.

There's also an existing **live-scoring React app prototype**, built as a Claude.ai artifact, covering 4 scoring formats (Cha Cha Cha, 2-Man Scramble, 4-Man Scramble, Solo Stroke Play), live standings, handicap indicators, CTP tracking, a Clubhouse module, and Admin controls — seeded with 2025 data. It currently has **no backend** (Claude artifact `window.storage` only).

## Decision: what we're building

One unified Postgres database serves BOTH live current-year scoring and historical YoY analytics — no more copy/paste between "current" and "historical" tabs.

- **Backend:** Supabase (Postgres + realtime + optional lightweight auth), deployed via Vercel.
- **Frontend:** Rebuild the existing React app's data layer against this real database (replacing local/artifact state). Realtime subscriptions drive live leaderboard updates as any player enters scores from their phone.
- **Access model:** Any player can enter their own group's scores — lean toward shareable per-match links/codes rather than full user accounts, given this is a trusted friend group.
- **Analytics:** Lives inside the same React app (not Power BI) — extending the app was the explicit decision over Power BI, Excel, or Sheets, to keep one codebase/one URL the group already trusts. Power BI's licensing/sharing tradeoffs (Pro seats or a public link) were the deciding factor against it.

## What's already designed: the schema

`milfore_schema_v2.sql` (attached) — full Postgres DDL, ready to run against a fresh Supabase project. Highlights:

- **12 core tables + 2 config lookup tables + 2 starter views.**
- `game_formats` table makes handicap rules data-driven — new formats are a new row, not new code.
- Confirmed by tracing actual 2025 formulas (Round tabs → `Admin - Teams & Handicaps`):
  - Individual stroke play: Handicap Index × 95%
  - 2-Man Scramble: (low partner × 35%) + (high partner × 15%)
  - 4-Man Scramble: ranked weights 25%/20%/15%/10%, low-to-high index
  - Strokes received is always **relative to the field** for that round — lowest adjusted handicap in the round plays scratch, everyone else gets `ROUND(their adjusted handicap − field low)`, then those strokes get distributed to holes by stroke index (2nd stroke on hardest holes once allowance exceeds 18).
  - Tournament points come from a per-round rank→points lookup table; **ties split points** (average of the point values across the tied ranks).
  - Bonus points (e.g. "Low Net") follow the same rank→points shape but are tracked as a fully separate pool from tournament points, never blended in silently.

## Open items to resolve first in Claude Code

These need the same formula-tracing approach used to build the schema, just applied to sheets/rounds not yet examined:

1. **Team Stableford and 1v1v1 Match Play scoring/handicap formulas.** The 2025 file's four live rounds (ChaChaCha, 2-Man Scramble, 4-Man Scramble, Solo Stroke Play) are fully traced and encoded in `game_formats`. Stableford and Match Play show up in the `DNU -` template tabs and in prior years (2023 had a live Team Stableford round; 2024/2025 have "Point Scenarios"/Match Play scratch tabs) — trace those the same way (formulas, not just values) before building the scoring engine for those formats.
2. **Full bonus point category list.** Only "Low Net" was confirmed (rank-based, 1.5/0.5 pts). If CTP, long drive, etc. appear elsewhere, determine whether each is rank-based (fits `bonus_rank_table`) or a one-off fixed award (`bonus_types.award_method = 'fixed'`).

## Suggested build sequence in Claude Code

1. Trace the two open items above against the source workbooks.
2. Stand up the Supabase project; run `milfore_schema_v2.sql` (adjust based on findings from step 1).
3. Write a migration script pulling all 5 years' workbooks + the Dashboard Import staging file into the new schema. Validate the migrated totals against the existing Power BI numbers as a sanity check.
4. Rebuild the React app's data layer against the live database (replace local/artifact state with Supabase client calls + realtime subscriptions).
5. Build the in-app analytics views (team standings, individual career stats, etc. — starter SQL views already in the schema file).
6. Roll out for the 2026 tournament (setup data already partially staged in the Dashboard Import file).

## Files to bring into the Claude Code project

- `milfore_schema_v2.sql` — the schema
- All 5 yearly workbooks (`ARCHIVED_-_Milfore_Invitational_2021.xlsx` through `2025.xlsx`)
- `Milfore_Invitational_-_Dashboard_Import.xlsx` — 2026 setup staging + cleaner reference tables
- `Milfore_Invitational_-_Historical_Analytics.pbix` — for reference only (DAX measure logic), not a data source
- This brief
