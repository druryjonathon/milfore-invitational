import { Link } from "react-router-dom";
import { SectionHeader } from "../components/SectionHeader";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getPlayers, getPlayerCareerStats } from "../lib/queries";

async function loadPlayers() {
  const [players, stats] = await Promise.all([getPlayers(), getPlayerCareerStats()]);
  const statsByPlayer = new Map(stats.map((s) => [s.player_id, s]));
  return players.map((p) => ({ player: p, stats: statsByPlayer.get(p.player_id) ?? null }));
}

export function Players() {
  const { data, loading, error } = useQuery(loadPlayers, []);

  return (
    <div>
      <SectionHeader title="Players" />
      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data && data.length === 0 && <EmptyState label="No players recorded yet." />}
      {data?.map(({ player, stats }) => (
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
