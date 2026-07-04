import { Link, useParams } from "react-router-dom";
import { BackLink } from "../components/BackLink";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getRound, getMatchesForRound, type MatchSummary } from "../lib/queries";
import { vsPar } from "../lib/format";

async function loadRoundDetail(roundId: number) {
  const [round, matches] = await Promise.all([getRound(roundId), getMatchesForRound(roundId)]);
  return { round, matches };
}

function bestRank(match: MatchSummary): number {
  const ranks = match.participants.map((p) => p.result?.matchup_rank ?? Infinity);
  return Math.min(...ranks, Infinity);
}

function matchSubtitle(match: MatchSummary, scoringStyle: string, coursePar: number | null): string {
  const parts = match.participants.map((p) => {
    const r = p.result;
    if (!r) return "no result";
    if (scoringStyle === "match_play") return r.match_result ?? "—";
    if (scoringStyle === "stableford") return `${r.event_score ?? "—"} pts`;
    const net = r.net_strokes;
    const vp = net !== null && coursePar !== null ? vsPar(Math.round(net - coursePar)) : null;
    return vp ?? (net !== null ? `${net}` : "—");
  });
  return [...new Set(parts)].join(" · ");
}

export function RoundDetail() {
  const { year, roundId } = useParams();
  const roundIdNum = Number(roundId);
  const { data, loading, error } = useQuery(() => loadRoundDetail(roundIdNum), [roundIdNum]);

  return (
    <div>
      <BackLink to={`/tournaments/${year}`} label={`${year}`} />

      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}

      {data && (
        <>
          <div className="course-hero">
            <div className="course-hero-name">{data.round.event_name}</div>
            <div className="course-hero-sub">
              {data.round.course_name} · {data.round.tee_color ?? ""} · Round {data.round.round_number}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginTop: 14, gap: 8 }}>
              <div className="course-stat">
                <div className="course-stat-v">{data.round.course_par ?? "—"}</div>
                <div className="course-stat-l">Par</div>
              </div>
              <div className="course-stat">
                <div className="course-stat-v">{data.round.format_name}</div>
                <div className="course-stat-l" style={{ fontSize: 8 }}>
                  Format
                </div>
              </div>
              <div className="course-stat">
                <div className="course-stat-v">{data.round.scoring_type}</div>
                <div className="course-stat-l">Scoring</div>
              </div>
            </div>
          </div>

          {data.matches.length === 0 ? (
            <EmptyState label="No results recorded for this round." />
          ) : (
            <div className="card">
              {[...data.matches]
                .sort((a, b) => bestRank(a) - bestRank(b))
                .map((m, i) => (
                  <Link
                    key={m.match_id}
                    to={`/tournaments/${year}/rounds/${roundId}/matches/${m.match_id}`}
                    className="list-row"
                    style={{ margin: 0, borderRadius: 0, boxShadow: "none", borderBottom: "1px solid var(--bdr)" }}
                  >
                    <div style={{ fontFamily: "var(--fd)", fontSize: 18, fontWeight: 900, color: i === 0 ? "var(--gold)" : "var(--bdr)", width: 22 }}>
                      {i + 1}
                    </div>
                    <div className="list-row-info">
                      <div className="list-row-title">
                        {m.participants.map((p) => p.display_name).join(" & ")}
                        {m.team_name ? ` (${m.team_name})` : ""}
                      </div>
                      <div className="list-row-meta">{matchSubtitle(m, data.round.scoring_style, data.round.course_par)}</div>
                    </div>
                    <span className="list-row-arrow">→</span>
                  </Link>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
