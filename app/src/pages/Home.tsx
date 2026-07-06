import { Link } from "react-router-dom";
import { ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getTournaments, getTeamStandings } from "../lib/queries";
import { CalendarIcon, UsersIcon, StarIcon } from "../components/icons";

async function loadHomeSummary() {
  const tournaments = await getTournaments(); // ordered by year desc
  const latest = tournaments[0] ?? null;
  const standings = latest ? await getTeamStandings(latest.tournament_id) : [];
  return { tournaments, latest, winner: standings[0] ?? null };
}

const MODULES = [
  {
    to: "/tournaments",
    Icon: CalendarIcon,
    title: "Tournament Years in Review",
    sub: "Standings, rounds, and points races by year",
  },
  {
    to: "/players",
    Icon: UsersIcon,
    title: "Players",
    sub: "Strokes gained, records, and rivalries",
  },
  {
    to: "/records",
    Icon: StarIcon,
    title: "Hall of Fame",
    sub: "All-time records across the years",
  },
];

export function Home() {
  const { data, loading, error } = useQuery(loadHomeSummary, []);

  const years = data?.tournaments.map((t) => t.year) ?? [];
  const yearRange = years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : null;

  return (
    <div>
      <div className="hero-banner">
        <div className="hero-crest">⛳</div>
        <div className="hero-title">
          The <span>Milfore</span>
        </div>
        <div className="hero-title" style={{ fontSize: 22 }}>
          Invitational
        </div>
        <div className="hero-sub">{yearRange ? `${yearRange} · ${years.length} Years of History` : "Archives"}</div>

        {loading && <div style={{ color: "rgba(255,255,255,.7)", marginTop: 20, fontSize: 13 }}>Loading…</div>}

        {data?.latest && (
          <Link to={`/tournaments/${data.latest.year}`} className="hero-champion">
            <div style={{ flex: 1, textAlign: "left" }}>
              <div className="hero-champion-label">{data.latest.year} Champion</div>
              <div className="hero-champion-name">{data.winner?.team_name ?? "Results pending"}</div>
            </div>
            {data.winner && <div className="hero-champion-pts">{data.winner.total_points}</div>}
          </Link>
        )}
      </div>

      {error !== null && <ErrorState error={error} />}
      {data && !data.latest && <EmptyState label="No tournaments recorded yet." />}

      <div style={{ padding: "20px 20px 8px" }}>
        <div className="sh-title" style={{ fontSize: 16 }}>
          Explore
        </div>
      </div>

      {MODULES.map(({ to, Icon, title, sub }) => (
        <Link key={to} to={to} className="module-card">
          <div className="module-icon">
            <Icon />
          </div>
          <div style={{ flex: 1 }}>
            <div className="module-title">{title}</div>
            <div className="module-sub">{sub}</div>
          </div>
          <span className="list-row-arrow">→</span>
        </Link>
      ))}
    </div>
  );
}
