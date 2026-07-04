import { Link } from "react-router-dom";
import { SectionHeader } from "../components/SectionHeader";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getTournaments, getTeamStandings } from "../lib/queries";

async function loadHomeSummary() {
  const tournaments = await getTournaments(); // ordered by year desc
  const latest = tournaments[0] ?? null;
  const standings = latest ? await getTeamStandings(latest.tournament_id) : [];
  return { tournaments, latest, winner: standings[0] ?? null };
}

export function Home() {
  const { data, loading, error } = useQuery(loadHomeSummary, []);

  return (
    <div>
      <SectionHeader title="The Milfore" sub="Invitational — Archives" />

      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}

      {data && !data.latest && <EmptyState label="No tournaments recorded yet." />}

      {data?.latest && (
        <Link to={`/tournaments/${data.latest.year}`} className="standing-card first">
          <div className="standing-rank">{data.latest.year}</div>
          <div className="standing-info">
            <div className="standing-name">{data.winner?.team_name ?? "Results pending"}</div>
            <div className="standing-members">Most recent tournament</div>
          </div>
          {data.winner && (
            <div className="standing-pts">
              <div className="standing-pts-num">{data.winner.total_points}</div>
              <div className="standing-pts-lbl">pts</div>
            </div>
          )}
        </Link>
      )}

      {data && data.tournaments.length > 0 && (
        <>
          <div className="sh" style={{ paddingTop: 4 }}>
            <div className="sh-title" style={{ fontSize: 16 }}>
              All Years
            </div>
          </div>
          {data.tournaments.map((t) => (
            <Link key={t.tournament_id} to={`/tournaments/${t.year}`} className="list-row">
              <div className="list-row-info">
                <div className="list-row-title">{t.year}</div>
                <div className="list-row-meta">{t.name}</div>
              </div>
              <span className="list-row-arrow">→</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
