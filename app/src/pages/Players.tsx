import { Link, useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from "recharts";
import { SectionHeader } from "../components/SectionHeader";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import {
  getPlayers,
  getPlayerCareerStats,
  getAllPlayersStrokesGained,
  getAllPlayersRecord,
  getFormatLeaders,
  getTeammatePairings,
  getRivalries,
} from "../lib/queries";
import { CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_FONT, tooltipStyle } from "../lib/chartTheme";
import { vsPar } from "../lib/format";

const GAINED_COLOR = "#1a7a3a";
const LOST_COLOR = "var(--red)";

async function loadPlayers() {
  const [players, stats, strokesGained, record, formatLeaders, pairings, rivalries] = await Promise.all([
    getPlayers(),
    getPlayerCareerStats(),
    getAllPlayersStrokesGained(),
    getAllPlayersRecord(),
    getFormatLeaders(),
    getTeammatePairings(),
    getRivalries(),
  ]);
  const statsByPlayer = new Map(stats.map((s) => [s.player_id, s]));
  const roster = players.map((p) => ({ player: p, stats: statsByPlayer.get(p.player_id) ?? null }));
  return { roster, strokesGained, record, formatLeaders, pairings, rivalries };
}

export function Players() {
  const { data, loading, error } = useQuery(loadPlayers, []);
  const navigate = useNavigate();

  return (
    <div>
      <SectionHeader title="Players" />
      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data && data.roster.length === 0 && <EmptyState label="No players recorded yet." />}

      {data && data.strokesGained.length > 0 && (
        <div className="card">
          <div className="card-inner">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Strokes Gained Leaderboard</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>
              Who plays best relative to their own handicap — tap a name to drill in
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, data.strokesGained.length * 28)}>
              <BarChart data={data.strokesGained} layout="vertical" margin={{ top: 4, right: 24, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} tickFormatter={(v) => vsPar(v)} />
                <YAxis
                  type="category"
                  dataKey="display_name"
                  width={80}
                  tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }}
                />
                <ReferenceLine x={0} stroke={CHART_AXIS_COLOR} strokeDasharray="3 3" />
                <Tooltip {...tooltipStyle} formatter={(v) => vsPar(Math.round(Number(v) * 10) / 10)} />
                <Bar
                  dataKey="avg_strokes_gained"
                  radius={[0, 3, 3, 0]}
                  cursor="pointer"
                  onClick={(row: any) => navigate(`/players/${row.player_id}`)}
                >
                  {data.strokesGained.map((p) => (
                    <Cell key={p.player_id} fill={p.avg_strokes_gained >= 0 ? GAINED_COLOR : LOST_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data && data.record.length > 0 && (
        <div className="card">
          <div className="card-inner">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Overall Record</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Round finishes across every tournament</div>
            {data.record.slice(0, 8).map((r) => (
              <div
                key={r.player_id}
                onClick={() => navigate(`/players/${r.player_id}`)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--bdr)", cursor: "pointer" }}
              >
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.display_name}</div>
                <div style={{ fontSize: 12, color: "var(--ink3)" }}>{r.rounds} rds</div>
                <div style={{ fontSize: 12, color: "var(--gold)", fontWeight: 700, width: 60, textAlign: "right" }}>{r.top3} top-3</div>
                <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 800, width: 50, textAlign: "right" }}>{r.wins}W</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.formatLeaders.length > 0 && (
        <div className="card">
          <div className="card-inner">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Best in Format</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Top Strokes Gained average, by recurring event</div>
            {data.formatLeaders.map((f) => (
              <div
                key={f.bucket}
                onClick={() => navigate(`/players/${f.player_id}`)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--bdr)", cursor: "pointer" }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{f.bucket}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{f.display_name}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: f.avg_strokes_gained >= 0 ? GAINED_COLOR : LOST_COLOR }}>
                  {vsPar(Math.round(f.avg_strokes_gained * 10) / 10)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (data.pairings.length > 0 || data.rivalries.length > 0) && (
        <div style={{ padding: "12px 20px 0", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink3)" }}>
          Pairing Analytics
        </div>
      )}

      {data && data.pairings.length > 0 && (
        <div className="card">
          <div className="card-inner">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Best Teammate Pairings</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Avg Strokes Gained when playing together (2+ matches together)</div>
            {data.pairings.slice(0, 5).map((p, i) => (
              <div key={`${p.player_a}-${p.player_b}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--bdr)" }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  {p.player_a} & {p.player_b}
                  <span style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 400 }}> · {p.matches_together} rounds</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: p.avg_strokes_gained >= 0 ? GAINED_COLOR : LOST_COLOR }}>
                  {vsPar(Math.round(p.avg_strokes_gained * 10) / 10)}
                </div>
              </div>
            ))}
            {data.pairings.length > 5 && (
              <>
                <div style={{ fontSize: 11, color: "var(--ink3)", padding: "10px 0 4px", borderTop: "1px solid var(--bdr)" }}>Needs work together</div>
                {data.pairings.slice(-3).reverse().map((p) => (
                  <div key={`${p.player_a}-${p.player_b}-worst`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                      {p.player_a} & {p.player_b}
                      <span style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 400 }}> · {p.matches_together} rounds</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: p.avg_strokes_gained >= 0 ? GAINED_COLOR : LOST_COLOR }}>
                      {vsPar(Math.round(p.avg_strokes_gained * 10) / 10)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {data && data.rivalries.length > 0 && (
        <div className="card">
          <div className="card-inner">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Rivalries</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Head-to-head record on rounds played together (3+ meetings)</div>
            {data.rivalries.slice(0, 6).map((r, i) => (
              <div key={`${r.player_a}-${r.player_b}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--bdr)" }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  {r.player_a} vs {r.player_b}
                  <span style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 400 }}> · {r.meetings} meetings</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>
                  {r.a_wins}–{r.b_wins}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "12px 20px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink3)" }}>
        All Players
      </div>
      {data?.roster.map(({ player, stats }) => (
        <Link key={player.player_id} to={`/players/${player.player_id}`} className="player-card">
          <div className="av av-sm">{player.display_name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{player.display_name}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
              {stats ? `${stats.years_played} year${stats.years_played === 1 ? "" : "s"} played` : "No history yet"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--fd)", fontSize: 22, fontWeight: 900, color: "var(--red)" }}>
              {stats?.career_points ?? "—"}
            </div>
            <div style={{ fontSize: 10, color: "var(--ink3)" }}>PTS</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
