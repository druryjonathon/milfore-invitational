import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BackLink } from "../components/BackLink";
import { SectionHeader } from "../components/SectionHeader";
import { Tabs } from "../components/Tabs";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getTournamentByYear, getTeamStandings, getRoundsForTournament, getTeamRoster } from "../lib/queries";

type Tab = "standings" | "rounds" | "teams";

async function loadTournament(year: number) {
  const tournament = await getTournamentByYear(year);
  const [standings, rounds, roster] = await Promise.all([
    getTeamStandings(tournament.tournament_id),
    getRoundsForTournament(tournament.tournament_id),
    getTeamRoster(tournament.tournament_id),
  ]);
  return { tournament, standings, rounds, roster };
}

export function TournamentDetail() {
  const { year } = useParams();
  const yearNum = Number(year);
  const [tab, setTab] = useState<Tab>("standings");
  const { data, loading, error } = useQuery(() => loadTournament(yearNum), [yearNum]);

  return (
    <div>
      <BackLink to="/tournaments" label="Tournaments" />
      <SectionHeader title={year ?? ""} sub={data?.tournament.name} />

      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}

      {data && (
        <>
          <Tabs
            active={tab}
            onChange={setTab}
            options={[
              { id: "standings", label: "Standings" },
              { id: "rounds", label: "Rounds" },
              { id: "teams", label: "Teams" },
            ]}
          />

          {tab === "standings" &&
            (data.standings.length === 0 ? (
              <EmptyState label="No standings recorded for this year." />
            ) : (
              data.standings.map((s, i) => (
                <div key={s.team_id} className={`standing-card${i === 0 ? " first" : ""}`}>
                  <div className="standing-rank">{i + 1}</div>
                  <div className="standing-info">
                    <div className="standing-name">{s.team_name}</div>
                    <div className="standing-members">
                      {data.roster
                        .filter((r) => r.team_id === s.team_id)
                        .map((r) => r.display_name)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="standing-pts">
                    <div className="standing-pts-num">{s.total_points}</div>
                    <div className="standing-pts-lbl">pts</div>
                  </div>
                </div>
              ))
            ))}

          {tab === "rounds" &&
            (data.rounds.length === 0 ? (
              <EmptyState label="No rounds recorded for this year." />
            ) : (
              data.rounds.map((r) => (
                <Link key={r.round_id} to={`/tournaments/${year}/rounds/${r.round_id}`} className="list-row">
                  <div className="list-row-info">
                    <div className="list-row-title">
                      Round {r.round_number} · {r.event_name}
                    </div>
                    <div className="list-row-meta">
                      {r.course_name} · {r.scoring_type}
                    </div>
                  </div>
                  <span className="list-row-arrow">→</span>
                </Link>
              ))
            ))}

          {tab === "teams" &&
            (() => {
              const teamIds = [...new Set(data.roster.map((r) => r.team_id))];
              if (teamIds.length === 0) return <EmptyState label="No team rosters recorded for this year." />;
              return teamIds.map((teamId) => {
                const members = data.roster.filter((r) => r.team_id === teamId);
                return (
                  <div key={teamId} className="card">
                    <div className="card-inner">
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{members[0]?.team_name}</div>
                      {members.map((m) => (
                        <div key={m.player_id} style={{ padding: "5px 0", borderTop: "1px solid var(--bdr)", fontSize: 13 }}>
                          {m.display_name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
        </>
      )}
    </div>
  );
}
