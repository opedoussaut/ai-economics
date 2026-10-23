import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mt-16">
      <EmptyState title="Page not found">
        <Link href="/" className="text-accent">Back to the overview</Link>
      </EmptyState>
    </div>
  );
}
