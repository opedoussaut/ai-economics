import { D, Decimal, sum } from "@/lib/money";

/**
 * Attribute a shared infrastructure cost (e.g. a GPU node or cluster bill for
 * a period) to jobs/projects. Methods are explicitly labelled; none treats
 * GPU-utilisation % as an exact billing share.
 *
 *  - reserved:          each job pays for the GPU-hours it held (allocated),
 *                       at the pool's effective rate; unreserved time is
 *                       reported as "unallocated idle".
 *  - billed-runtime:    each job pays its own billed instance runtime
 *                       (requires per-job billing records); remainder is idle.
 *  - proportional-usage: the WHOLE pool cost is split by measured usage share
 *                       (e.g. SM-active GPU-seconds). An approximation, not a
 *                       billing record; idle is absorbed by users.
 *
 * Invariant (tested): sum(allocations) + unallocated === total cost.
 */
export type AllocationMethod = "reserved" | "billed-runtime" | "proportional-usage";

export const ALLOCATION_METHODS: Record<AllocationMethod, { label: string; description: string }> = {
  reserved: { label: "Reserved allocation", description: "Jobs pay for GPU-hours they reserved; unreserved capacity shown as idle." },
  "billed-runtime": { label: "Billed runtime", description: "Jobs pay their own billed runtime from billing records." },
  "proportional-usage": {
    label: "Proportional usage (approximation)",
    description: "Pool cost split by measured usage share. Not a billing record.",
  },
};

export interface AllocationJob {
  id: string;
  reservedGpuHours: number;
  billedGpuHours?: number;
  /** Measured usage, e.g. utilisation-weighted GPU-hours. */
  usageGpuHours: number;
}

export function allocateCost(totalCost: number, poolGpuHours: number, jobs: AllocationJob[], method: AllocationMethod) {
  const total = D(totalCost);
  if (poolGpuHours <= 0) throw new Error("Pool GPU-hours must be > 0");
  const rate = total.div(poolGpuHours);
  let allocations: { id: string; cost: Decimal; basisGpuHours: number }[];

  if (method === "proportional-usage") {
    const usage = sum(jobs.map((j) => D(j.usageGpuHours)));
    allocations = jobs.map((j) => ({
      id: j.id,
      basisGpuHours: j.usageGpuHours,
      cost: usage.isZero() ? D(0) : total.mul(j.usageGpuHours).div(usage),
    }));
  } else {
    const basis = (j: AllocationJob) => {
      if (method === "reserved") return j.reservedGpuHours;
      if (j.billedGpuHours === undefined) throw new Error(`Job ${j.id} has no billed runtime record`);
      return j.billedGpuHours;
    };
    const claimed = sum(jobs.map((j) => D(basis(j))));
    if (claimed.gt(poolGpuHours)) throw new Error("Allocated GPU-hours exceed the pool: double counting");
    allocations = jobs.map((j) => ({ id: j.id, basisGpuHours: basis(j), cost: rate.mul(basis(j)) }));
  }
  const allocated = sum(allocations.map((a) => a.cost));
  return { method, rate, allocations, allocated, unallocated: total.sub(allocated) };
}
