import { SectionHeader } from "../components/SectionHeader";
import { LoadingState, ErrorState, EmptyState } from "../components/StatusStates";
import { useQuery } from "../lib/useQuery";
import { getRecords } from "../lib/queries";

export function Records() {
  const { data, loading, error } = useQuery(getRecords, []);

  return (
    <div>
      <SectionHeader title="Hall of Fame" sub="All-time records" />
      {loading && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data && data.length === 0 && <EmptyState icon="🏆" label="No results recorded yet to set a record." />}
      {data?.map((r) => (
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
    </div>
  );
}
