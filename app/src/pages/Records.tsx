import { SectionHeader } from "../components/SectionHeader";
import { EmptyState } from "../components/StatusStates";

export function Records() {
  return (
    <div>
      <SectionHeader title="Hall of Fame" sub="All-time records" />
      <EmptyState icon="🏆" label="Record categories haven't been decided yet — coming soon." />
    </div>
  );
}
