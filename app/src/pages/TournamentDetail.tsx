import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  getTeamStandingsWithBonus,
  getRoundsForTournament,
  getTeamRoster,
  getTeamPointsByRound,
  getIndividualPointsForTournament,
  type TeamRoundPoints,
} from "../lib/queries";
import { CHART_COLORS, CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_FONT, tooltipStyle } from "../lib/chartTheme";

type DrillTab = "standings" | "rounds" | "teams";

async function loadTournament(year: number) {
  const tournament = await getTournamentByYear(year);
  const [standings, rounds, roster, pointsByRound, individualPoints] = await Promise.all([
    getTeamStandingsWithBonus(tournament.tournament_id),
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
    const point: Record<string, number | string> = { round: `R${rn}`, round_number: rn };
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
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(() => loadTournament(yearNum), [yearNum]);
  const [drillTab, setDrillTab] = useState<DrillTab>("standings");
  const [highlightRoundId, setHighlightRoundId] = useState<number | null>(null);
  const roundRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (highlightRoundId === null) return;
    const el = roundRefs.current.get(highlightRoundId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightRoundId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightRoundId]);

  const focusRoundByNumber = (roundNumber: number) => {
    const round = data?.rounds.find((r) => r.round_number === roundNumber);
    if (!round) return;
    setDrillTab("rounds");
    setHighlightRoundId(round.round_id);
  };

  return (
    <div>
      <BackLink to="/tournaments" label="Tournaments" />
      <SectionHeader title={year ?? ""} sub={data?.tournament.name} />

      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}

      {data &&
        (() => {
          const teamNames = data.standings.map((s) => s.team_name);
          const colorByTeam = new Map(teamNames.map((name, i) => [name, CHART_COLORS[i % CHART_COLORS.length]]));
          const cumulativeData = pivotByRound(data.pointsByRound, teamNames, true);
          const perRoundData = pivotByRound(data.pointsByRound, teamNames, false);

          return (
            <>
              {cumulativeData.length === 0 && data.individualPoints.length === 0 ? (
                <EmptyState label="No results recorded yet to chart." />
              ) : (
                <>
                  {cumulativeData.length > 0 && (
                    <div className="card">
                      <div className="card-inner">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Points Race — Cumulative by Round</div>
                        <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Tap a round to see its results</div>
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
                                dot={{ r: 4, cursor: "pointer", onClick: (e: any) => focusRoundByNumber(e.payload.round_number) }}
                                activeDot={{ r: 6, cursor: "pointer", onClick: (e: any) => focusRoundByNumber(e.payload.round_number) }}
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
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Points Earned by Round</div>
                        <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Tap a round to see its results</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={perRoundData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
                            <XAxis dataKey="round" tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                            <YAxis tick={{ fontSize: 11, fontFamily: CHART_FONT, fill: CHART_AXIS_COLOR }} />
                            <Tooltip {...tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: CHART_FONT }} />
                            {teamNames.map((name) => (
                              <Bar
                                key={name}
                                dataKey={name}
                                fill={colorByTeam.get(name)}
                                radius={[3, 3, 0, 0]}
                                cursor="pointer"
                                onClick={(row: any) => focusRoundByNumber(row.round_number)}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {data.individualPoints.length > 0 && (
                    <div className="card">
                      <div className="card-inner">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Who Earned the Points</div>
                        <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 8 }}>Tap a player to see their profile</div>
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
                            <Bar
                              dataKey="points"
                              radius={[0, 3, 3, 0]}
                              cursor="pointer"
                              onClick={(row: any) => navigate(`/players/${row.player_id}`)}
                            >
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
              )}

              <div style={{ padding: "12px 20px 0", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink3)" }}>
                Details
              </div>
              <Tabs
                active={drillTab}
                onChange={setDrillTab}
                options={[
                  { id: "standings", label: "Standings" },
                  { id: "rounds", label: "Rounds" },
                  { id: "teams", label: "Teams" },
                ]}
              />

              {drillTab === "standings" &&
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
                        {s.bonus_points > 0 && (
                          <div className="standing-members">
                            {s.tournament_points} pts + {s.bonus_points} bonus
                          </div>
                        )}
                      </div>
                      <div className="standing-pts">
                        <div className="standing-pts-num">{s.total_points}</div>
                        <div className="standing-pts-lbl">pts</div>
                      </div>
                    </div>
                  ))
                ))}

              {drillTab === "rounds" &&
                (data.rounds.length === 0 ? (
                  <EmptyState label="No rounds recorded for this year." />
                ) : (
                  data.rounds.map((r) => (
                    <Link
                      key={r.round_id}
                      ref={(el) => {
                        if (el) roundRefs.current.set(r.round_id, el);
                        else roundRefs.current.delete(r.round_id);
                      }}
                      to={`/tournaments/${year}/rounds/${r.round_id}`}
                      className="list-row"
                      style={highlightRoundId === r.round_id ? { boxShadow: "0 0 0 2px var(--red)" } : undefined}
                    >
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

              {drillTab === "teams" &&
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
          );
        })()}
    </div>
  );
}
