"use client";

import { Button, Note } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-lg space-y-3">
      <Note tone="warn">
        Something went wrong while rendering this page{error.digest ? ` (ref ${error.digest})` : ""}. No fallback values are shown in place of failed data.
      </Note>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
