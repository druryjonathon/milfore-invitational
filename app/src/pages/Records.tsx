import { SectionHeader } from "../components/SectionHeader";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getFormatRecords, getOverallRecords } from "../lib/queries";

async function loadRecords() {
  const [formatRecords, overallRecords] = await Promise.all([getFormatRecords(), getOverallRecords()]);
  return { formatRecords, overallRecords };
}

export function Records() {
  const { data, loading, error } = useQuery(loadRecords, []);

  return (
    <div>
      <SectionHeader title="Hall of Fame" sub="All-time records" />
      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data && data.formatRecords.length === 0 && data.overallRecords.length === 0 && (
        <EmptyState icon="🏆" label="No results recorded yet to set a record." />
      )}

      {data && data.formatRecords.length > 0 && (
        <>
          <div style={{ padding: "4px 20px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink3)" }}>
            By Event — Lowest Score
          </div>
          <div style={{ fontSize: 12, color: "var(--ink3)", padding: "0 20px 8px" }}>Events played more than once, best round on record</div>
          {data.formatRecords.map((r) => (
            <div key={r.bucket} className="standing-card">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink3)" }}>
                  {r.bucket}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink3)", marginTop: 4 }}>
                  {r.names.join(" & ")} · {r.year}
                </div>
              </div>
              <div className="standing-pts">
                <div className="standing-pts-num">{r.value}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {data && data.overallRecords.length > 0 && (
        <>
          <div style={{ padding: "16px 20px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink3)" }}>
            All-Time
          </div>
          {data.overallRecords.map((r) => (
            <div key={r.label} className="standing-card">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink3)" }}>
                  {r.label}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink3)", marginTop: 4 }}>{r.detail}</div>
              </div>
              <div className="standing-pts">
                <div className="standing-pts-num">{r.value}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
