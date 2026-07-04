import { Link, useParams } from "react-router-dom";
import { BackLink } from "../components/BackLink";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getPlayer, getPlayerCareerStat, getPlayerHistory } from "../lib/queries";

async function loadPlayerDetail(playerId: number) {
  const [player, stats, history] = await Promise.all([
    getPlayer(playerId),
    getPlayerCareerStat(playerId),
    getPlayerHistory(playerId),
  ]);
  return { player, stats, history };
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
              <div className="stat-v">{data.stats?.avg_strokes_gained_net?.toFixed(1) ?? "—"}</div>
              <div className="stat-l">Avg Strokes Gained (Net)</div>
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
        </>
      )}
    </div>
  );
}
