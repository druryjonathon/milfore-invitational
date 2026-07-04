import { useParams } from "react-router-dom";
import { BackLink } from "../components/BackLink";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getMatch, getRoundHoles, getHoleScoresForMatch } from "../lib/queries";
import { vsPar, chipClass } from "../lib/format";

async function loadMatchDetail(matchId: number) {
  const match = await getMatch(matchId);
  const [holes, scores] = await Promise.all([getRoundHoles(match.round_id), getHoleScoresForMatch(matchId)]);
  return { match, holes, scores };
}

export function MatchDetail() {
  const { year, roundId, matchId } = useParams();
  const matchIdNum = Number(matchId);
  const { data, loading, error } = useQuery(() => loadMatchDetail(matchIdNum), [matchIdNum]);

  return (
    <div>
      <BackLink to={`/tournaments/${year}/rounds/${roundId}`} label="Round" />

      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}

      {data &&
        (data.holes.length === 0 ? (
          <EmptyState label="No hole-by-hole data recorded for this match." />
        ) : (
          (() => {
            // Some formats store one shared net/event score across all teammates on a
            // match (see v_team_standings' "shared award" note) rather than each
            // player's own net — detect that so we don't label a team total as "Net".
            const netValues = data.match.participants.map((p) => p.result?.net_strokes ?? null);
            const isSharedNet = netValues.length > 1 && netValues.every((v) => v !== null && v === netValues[0]);
            return data.match.participants.map((p) => {
              const playerScores = data.scores.filter((s) => s.player_id === p.player_id);
              const scoreByHole = new Map(playerScores.map((s) => [s.hole_no, s.gross_strokes]));
              const thru = playerScores.filter((s) => s.gross_strokes !== null).length;
              const gross = p.result?.gross_strokes ?? null;
              const net = p.result?.net_strokes ?? null;

              const half = (start: number, end: number) => (
                <div className="card" key={start}>
                  <div style={{ padding: "12px 16px 4px", fontSize: 12, fontWeight: 700, color: "var(--ink3)", letterSpacing: 0.5 }}>
                    {start === 0 ? "FRONT 9" : "BACK 9"}
                  </div>
                  {data.holes.slice(start, end).map((h) => {
                    const sv = scoreByHole.get(h.hole_no) ?? null;
                    const diff = sv !== null ? sv - h.par : null;
                    return (
                      <div key={h.hole_no} className="hole-row">
                        <div className={`hole-num${h.par === 3 ? " p3" : ""}`}>{h.hole_no}</div>
                        <div>
                          <div className="hole-par">Par {h.par}</div>
                          <div className="hole-si">SI {h.stroke_index ?? "—"}</div>
                        </div>
                        <div className="hole-score-v">{sv ?? "—"}</div>
                        <div className={`sc-chip ${chipClass(diff)}`}>{diff !== null ? vsPar(diff) : ""}</div>
                      </div>
                    );
                  })}
                </div>
              );

              return (
                <div key={p.player_id}>
                  <div className="sc-header" style={{ margin: "8px 16px 12px", borderRadius: 14 }}>
                    <div className="sc-names">{p.display_name}</div>
                    <div className="sc-sub">
                      {data.match.event_name} · {data.match.course_name} · {data.match.tournament_year}
                    </div>
                    <div className="sc-stats">
                      <div className="sc-stat">
                        <div className="sc-stat-v">{gross ?? "—"}</div>
                        <div className="sc-stat-l">Gross</div>
                      </div>
                      <div className="sc-stat">
                        <div className="sc-stat-v">{net ?? "—"}</div>
                        <div className="sc-stat-l">{isSharedNet ? "Team Net" : "Net"}</div>
                      </div>
                      <div className="sc-stat">
                        <div className="sc-stat-v">
                          {thru}/{data.holes.length}
                        </div>
                        <div className="sc-stat-l">Thru</div>
                      </div>
                    </div>
                  </div>
                  {half(0, 9)}
                  {half(9, data.holes.length)}
                </div>
              );
            });
          })()
        ))}
    </div>
  );
}
