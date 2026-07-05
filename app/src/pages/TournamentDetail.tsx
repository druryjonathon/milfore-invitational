import { useState } from "react";
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
  Legend,
  Cell,
} from "recharts";
import { BackLink } from "../components/BackLink";
import { SectionHeader } from "../components/SectionHeader";
import { Tabs } from "../components/Tabs";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import {
  getTournamentByYear,
  getTeamStandings,
  getRoundsForTournament,
  getTeamRoster,
  getTeamPointsByRound,
  getIndividualPointsForTournament,
  type TeamRoundPoints,
} from "../lib/queries";
import { CHART_COLORS, CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_FONT, tooltipStyle } from "../lib/chartTheme";

type Tab = "standings" | "rounds" | "teams" | "analytics";

async function loadTournament(year: number) {
  const tournament = await getTournamentByYear(year);
  const [standings, rounds, roster, pointsByRound, individualPoints] = await Promise.all([
    getTeamStandings(tournament.tournament_id),
    getRoundsForTournament(tournament.tournament_id),
    getTeamRoster(tournament.tournament_id),
    getTeamPointsByRound(tournament.tournament_id),
    getIndividualPointsForTournament(tournament.tournament_id),
  ]);
  return { tournament, standings, rounds, roster, pointsByRound, individualPoints };
}

function pivotByRound(rows: TeamRoundPoints[], teamNames: string[], cumulative: boolean) {
  const roundNumbers = [...new Set(rows.map((r) => r.round_number))].sort((a, b) => a - b);
  const running = new Map<string, number>();
  return roundNumbers.map((rn) => {
    const point: Record<string, number | string> = { round: `R${rn}` };
    for (const teamName of teamNames) {
      const row = rows.find((r) => r.round_number === rn && r.team_name === teamName);
      const val = row?.points ?? 0;
      if (cumulative) {
        const next = (running.get(teamName) ?? 0) + val;
        running.set(teamName, next);
        point[teamName] = next;
      } else {
        point[teamName] = val;
      }
    }
    return point;
  });
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
              { id: "analytics", label: "Analytics" },
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

          {tab === "analytics" &&
            (() => {
              const teamNames = data.standings.map((s) => s.team_name);
              const colorByTeam = new Map(teamNames.map((name, i) => [name, CHART_COLORS[i % CHART_COLORS.length]]));

              if (data.pointsByRound.length === 0 && data.individualPoints.length === 0) {
                return <EmptyState label="No results recorded yet to chart." />;
              }

              const cumulativeData = pivotByRound(data.pointsByRound, teamNames, true);
              const perRoundData = pivotByRound(data.pointsByRound, teamNames, false);

              return (
                <>
                  {cumulativeData.length > 0 && (
                    <div className="card">
                      <div className="card-inner">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Points Race — Cumulative by Round</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={cumulativeData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                            <XAxis dataKey="round" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                            <YAxis tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                            <Tooltip {...tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: CHART_FONT }} />
                            {teamNames.map((name) => (
                              <Line
                                key={name}
                                type="monotone"
                                dataKey={name}
                                stroke={colorByTeam.get(name)}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {perRoundData.length > 0 && (
                    <div className="card">
                      <div className="card-inner">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Points Earned by Round</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={perRoundData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                            <XAxis dataKey="round" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                            <YAxis tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                            <Tooltip {...tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: CHART_FONT }} />
                            {teamNames.map((name) => (
                              <Bar key={name} dataKey={name} fill={colorByTeam.get(name)} radius={[3, 3, 0, 0]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {data.individualPoints.length > 0 && (
                    <div className="card">
                      <div className="card-inner">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Who Earned the Points</div>
                        <ResponsiveContainer width="100%" height={Math.max(180, data.individualPoints.length * 32)}>
                          <BarChart
                            data={data.individualPoints}
                            layout="vertical"
                            margin={{ top: 4, right: 16, left: -8, bottom: 0 }}
                          >
                            <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                            <YAxis
                              type="category"
                              dataKey="display_name"
                              width={90}
                              tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }}
                            />
                            <Tooltip {...tooltipStyle} />
                            <Bar dataKey="points" radius={[0, 3, 3, 0]}>
                              {data.individualPoints.map((p) => (
                                <Cell key={p.player_id} fill={colorByTeam.get(p.team_name ?? "") ?? CHART_COLORS[0]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
        </>
      )}
    </div>
  );
}
