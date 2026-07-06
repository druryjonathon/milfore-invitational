import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from "recharts";
import { BackLink } from "../components/BackLink";
import { Tabs } from "../components/Tabs";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import {
  getPlayer,
  getPlayerCareerStat,
  getPlayerHistory,
  getPlayerStrokesGained,
  getPlayerScoreByParType,
  getPlayerFinishDistribution,
  type StrokesGainedEntry,
} from "../lib/queries";
import { CHART_COLORS, CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_FONT, tooltipStyle } from "../lib/chartTheme";
import { vsPar } from "../lib/format";

const GAINED_COLOR = "#1a7a3a";
const LOST_COLOR = "var(--red)";

async function loadPlayerDetail(playerId: number) {
  const [player, stats, history, strokesGained, scoreByParType, finishDistribution] = await Promise.all([
    getPlayer(playerId),
    getPlayerCareerStat(playerId),
    getPlayerHistory(playerId),
    getPlayerStrokesGained(playerId),
    getPlayerScoreByParType(playerId),
    getPlayerFinishDistribution(playerId),
  ]);
  return { player, stats, history, strokesGained, scoreByParType, finishDistribution };
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function PlayerDetail() {
  const { playerId } = useParams();
  const playerIdNum = Number(playerId);
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(() => loadPlayerDetail(playerIdNum), [playerIdNum]);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const strokesGained = useMemo(() => data?.strokesGained ?? [], [data]);
  const years = useMemo(() => [...new Set(strokesGained.map((e) => e.year))].sort((a, b) => a - b), [strokesGained]);

  const byType = useMemo(
    () => strokesGained.filter((e) => typeFilter === "all" || e.attribution === typeFilter),
    [strokesGained, typeFilter]
  );

  const careerAvgStrokesGained = useMemo(() => avg(byType.map((e) => e.strokes_gained)), [byType]);

  const chartRows = useMemo(() => {
    if (yearFilter === "all") {
      const byYear = new Map<number, number[]>();
      for (const e of byType) {
        const list = byYear.get(e.year) ?? [];
        list.push(e.strokes_gained);
        byYear.set(e.year, list);
      }
      return [...byYear.entries()]
        .map(([year, vals]) => ({ key: `${year}`, label: `${year}`, value: avg(vals) ?? 0, year, entry: null as StrokesGainedEntry | null }))
        .sort((a, b) => a.year - b.year);
    }
    return byType
      .filter((e) => e.year === Number(yearFilter))
      .sort((a, b) => a.round_number - b.round_number)
      .map((e) => ({ key: `${e.match_id}`, label: `R${e.round_number}`, value: e.strokes_gained, year: e.year, entry: e as StrokesGainedEntry | null }));
  }, [byType, yearFilter]);

  const drillDownRows =
    yearFilter === "all" ? [] : byType.filter((e) => e.year === Number(yearFilter)).sort((a, b) => a.round_number - b.round_number);

  return (
    <div>
      <BackLink to="/players" label="Players" />

      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}

      {data && (
        <>
          <div style={{ padding: "12px 20px 16px", display: "flex", gap: 14, alignItems: "center" }}>
            <div className="av av-lg">{data.player.display_name[0]}</div>
            <div>
              <div style={{ fontFamily: "var(--fd)", fontSize: 22, fontWeight: 900 }}>{data.player.display_name}</div>
              <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 3 }}>
                {data.stats ? `${data.stats.years_played} years played` : "No recorded history"}
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-box">
              <div className="stat-v">{data.stats?.career_points ?? "—"}</div>
              <div className="stat-l">Career Points</div>
            </div>
            <div className="stat-box">
              <div className="stat-v" style={{ color: careerAvgStrokesGained !== null && careerAvgStrokesGained < 0 ? LOST_COLOR : GAINED_COLOR }}>
                {careerAvgStrokesGained !== null ? vsPar(Math.round(careerAvgStrokesGained * 10) / 10) : "—"}
              </div>
              <div className="stat-l">Avg Strokes Gained</div>
            </div>
          </div>

          <div className="card">
            <div className="card-inner">
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Strokes Gained</div>
              <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>
                Handicap-expected score vs. actual gross —{" "}
                {yearFilter === "all" ? "tap a year to drill in" : "tap a round for its scorecard"}
              </div>

              <Tabs
                active={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { id: "all", label: "All Formats" },
                  { id: "individual", label: "Individual" },
                  { id: "team", label: "Team" },
                ]}
              />
              <Tabs
                active={yearFilter}
                onChange={setYearFilter}
                options={[{ id: "all", label: "All Years" }, ...years.map((y) => ({ id: String(y), label: String(y) }))]}
              />

              {chartRows.length === 0 ? (
                <EmptyState label="No handicap-adjusted rounds for this filter." />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                    <YAxis tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => vsPar(v)} />
                    <ReferenceLine y={0} stroke={CHART_AXIS_COLOR} strokeDasharray="3 3" />
                    <Tooltip {...tooltipStyle} formatter={(v) => vsPar(Math.round(Number(v) * 10) / 10)} />
                    <Bar
                      dataKey="value"
                      radius={[3, 3, 3, 3]}
                      cursor="pointer"
                      onClick={(row: any) => {
                        if (yearFilter === "all") setYearFilter(String(row.year));
                        else if (row.entry) navigate(`/tournaments/${row.entry.year}/rounds/${row.entry.round_id}/matches/${row.entry.match_id}`);
                      }}
                    >
                      {chartRows.map((r) => (
                        <Cell key={r.key} fill={r.value >= 0 ? GAINED_COLOR : LOST_COLOR} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {yearFilter !== "all" && drillDownRows.length > 0 && (
            <div className="card">
              {drillDownRows.map((e) => (
                <Link
                  key={e.match_id}
                  to={`/tournaments/${e.year}/rounds/${e.round_id}/matches/${e.match_id}`}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--bdr)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      Round {e.round_number} · {e.event_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                      Gross {e.gross_strokes} · Expected {Math.round(e.expected_score)}
                      {e.attribution === "team" ? " · Team" : ""}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--fd)",
                      fontSize: 18,
                      fontWeight: 900,
                      color: e.strokes_gained >= 0 ? GAINED_COLOR : LOST_COLOR,
                    }}
                  >
                    {vsPar(Math.round(e.strokes_gained * 10) / 10)}
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div style={{ padding: "4px 20px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink3)" }}>
            Year by Year — Points
          </div>
          {data.history.length === 0 ? (
            <EmptyState label="No tournament history recorded yet." />
          ) : (
            <div className="card">
              {data.history.map((yr) => (
                <Link
                  key={yr.year}
                  to={`/tournaments/${yr.year}`}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--bdr)",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontFamily: "var(--fd)", fontSize: 20, fontWeight: 900, color: "var(--red)", width: 52 }}>{yr.year}</div>
                  <div style={{ flex: 1, fontSize: 13, color: "var(--ink3)" }}>Tournament results</div>
                  <div style={{ fontFamily: "var(--fd)", fontSize: 18, fontWeight: 900, color: "var(--red)" }}>{yr.tournament_points}pt</div>
                </Link>
              ))}
            </div>
          )}

          {data.scoreByParType.length > 0 && (
            <div className="card">
              <div className="card-inner">
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Scoring by Hole Type</div>
                <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Career avg score vs. par, by par-3/4/5</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.scoreByParType} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                    <XAxis
                      dataKey="par"
                      tickFormatter={(p) => `Par ${p}`}
                      tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }}
                    />
                    <YAxis tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => vsPar(v)} />
                    <ReferenceLine y={0} stroke={CHART_AXIS_COLOR} strokeDasharray="3 3" />
                    <Tooltip {...tooltipStyle} formatter={(v) => vsPar(Math.round(Number(v) * 10) / 10)} />
                    <Bar dataKey="avg_to_par" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.finishDistribution.length > 0 && (
            <div className="card">
              <div className="card-inner">
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Finish Distribution</div>
                <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>How often each finish position was reached</div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={data.finishDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                    <YAxis tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
