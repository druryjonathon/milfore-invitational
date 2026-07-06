import { Link } from "react-router-dom";
import { SectionHeader } from "../components/SectionHeader";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getTournaments, getTournamentCourseNames } from "../lib/queries";

async function loadTournamentsWithCourses() {
  const [tournaments, courses] = await Promise.all([getTournaments(), getTournamentCourseNames()]);
  const coursesByTournament = new Map(courses.map((c) => [c.tournament_id, c.course_names]));
  return tournaments.map((t) => ({ tournament: t, courseNames: coursesByTournament.get(t.tournament_id) ?? [] }));
}

export function Tournaments() {
  const { data, loading, error } = useQuery(loadTournamentsWithCourses, []);

  return (
    <div>
      <SectionHeader title="Tournaments" />
      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data && data.length === 0 && <EmptyState label="No tournaments recorded yet." />}
      {data?.map(({ tournament, courseNames }) => (
        <Link key={tournament.tournament_id} to={`/tournaments/${tournament.year}`} className="list-row">
          <div className="list-row-info">
            <div className="list-row-title">{tournament.year}</div>
            <div className="list-row-meta">{courseNames.length > 0 ? courseNames.join(" · ") : "Courses TBD"}</div>
          </div>
          <span className="list-row-arrow">→</span>
        </Link>
      ))}
    </div>
  );
}
