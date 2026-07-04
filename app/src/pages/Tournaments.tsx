import { Link } from "react-router-dom";
import { SectionHeader } from "../components/SectionHeader";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getTournaments, getAllTeamStandings } from "../lib/queries";

async function loadTournamentsWithWinners() {
  const [tournaments, standings] = await Promise.all([getTournaments(), getAllTeamStandings()]);
  const winnerByTournament = new Map<number, (typeof standings)[number]>();
  for (const s of standings) {
    const current = winnerByTournament.get(s.tournament_id);
    if (!current || s.total_points > current.total_points) winnerByTournament.set(s.tournament_id, s);
  }
  return tournaments.map((t) => ({ tournament: t, winner: winnerByTournament.get(t.tournament_id) ?? null }));
}

export function Tournaments() {
  const { data, loading, error } = useQuery(loadTournamentsWithWinners, []);

  return (
    <div>
      <SectionHeader title="Tournaments" />
      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data && data.length === 0 && <EmptyState label="No tournaments recorded yet." />}
      {data?.map(({ tournament, winner }) => (
        <Link key={tournament.tournament_id} to={`/tournaments/${tournament.year}`} className="list-row">
          <div className="list-row-info">
            <div className="list-row-title">{tournament.year}</div>
            <div className="list-row-meta">{winner ? `${winner.team_name} · ${winner.total_points} pts` : "Results pending"}</div>
          </div>
          <span className="list-row-arrow">→</span>
        </Link>
      ))}
    </div>
  );
}
