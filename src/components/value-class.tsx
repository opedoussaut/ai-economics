import { VALUE_CLASSES, type ValueClass } from "@/lib/types";
import { Badge } from "./ui";

const TONE: Record<ValueClass, "accent" | "violet" | "pos" | "warn" | "neutral" | "neg"> = {
  published: "accent",
  measured: "pos",
  calculated: "neutral",
  modeled: "violet",
  billed: "pos",
  benchmark: "warn",
};

/** Every economic value is labelled with its class (published, modeled, …). */
export function ValueClassBadge({ kind, className }: { kind: ValueClass; className?: string }) {
  const v = VALUE_CLASSES[kind];
  return (
    <Badge tone={TONE[kind]} title={`${v.label}: ${v.description}`} className={className}>
      {v.short}
    </Badge>
  );
}
