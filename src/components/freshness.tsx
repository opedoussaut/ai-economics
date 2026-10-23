import type { FreshnessState } from "@/lib/data/freshness";
import { Badge } from "./ui";

const TONE: Record<FreshnessState, "pos" | "warn" | "neg" | "neutral"> = {
  fresh: "pos",
  failing: "warn",
  stale: "neg",
  never: "neg",
  "not-configured": "neutral",
};
const LABEL: Record<FreshnessState, string> = {
  fresh: "Fresh",
  failing: "Refresh failing",
  stale: "Stale",
  never: "No data",
  "not-configured": "Not connected",
};

export function FreshnessBadge({ state, title }: { state: FreshnessState; title?: string }) {
  return (
    <Badge tone={TONE[state]} title={title}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {LABEL[state]}
    </Badge>
  );
}
