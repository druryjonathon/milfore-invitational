import { Link, useParams } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { BackLink } from "../components/BackLink";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import {
  getPlayer,
  getPlayerCareerStat,
  getPlayerHistory,
  getPlayerNetToParByYear,
  getPlayerScoreByParType,
  getPlayerFinishDistribution,
} from "../lib/queries";
import { CHART_COLORS, CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_FONT, tooltipStyle } from "../lib/chartTheme";
import { vsPar } from "../lib/format";

async function loadPlayerDetail(playerId: number) {
  const [player, stats, history, netToParByYear, scoreByParType, finishDistribution] = await Promise.all([
    getPlayer(playerId),
    getPlayerCareerStat(playerId),
    getPlayerHistory(playerId),
    getPlayerNetToParByYear(playerId),
    getPlayerScoreByParType(playerId),
    getPlayerFinishDistribution(playerId),
  ]);
  return { player, stats, history, netToParByYear, scoreByParType, finishDistribution };
}

export function PlayerDetail() {
  const { playerId } = useParams();
  const playerIdNum = Number(playerId);
  const { data, loading, error } = useQuery(() => loadPlayerDetail(playerIdNum), [playerIdNum]);

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
              <div className="stat-v">
                {data.netToParByYear.length > 0
                  ? vsPar(
                      Math.round(
                        (data.netToParByYear.reduce((sum, y) => sum + y.avg_to_par * y.rounds_played, 0) /
                          data.netToParByYear.reduce((sum, y) => sum + y.rounds_played, 0)) *
                          10
                      ) / 10
                    )
                  : "—"}
              </div>
              <div className="stat-l">Avg Net vs Par</div>
            </div>
          </div>

          <div style={{ padding: "4px 20px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink3)" }}>
            Year by Year
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

          {data.netToParByYear.length > 1 && (
            <div className="card">
              <div className="card-inner">
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Performance Trend</div>
                <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Avg net score vs. par, by year</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data.netToParByYear} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                    <YAxis tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => vsPar(v)} />
                    <ReferenceLine y={0} stroke={CHART_AXIS_COLOR} strokeDasharray="3 3" />
                    <Tooltip {...tooltipStyle} formatter={(v) => vsPar(Math.round(Number(v) * 10) / 10)} />
                    <Line type="monotone" dataKey="avg_to_par" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
