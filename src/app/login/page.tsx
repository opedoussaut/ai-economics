import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Button, Card, CardBody, CardHeader, Note, inputClass } from "@/components/ui";
import { SESSION_COOKIE, SESSION_TTL_MS, authConfigured, createSessionToken, safeEqual } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const nextRaw = String(formData.get("next") ?? "/monitoring/live");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/monitoring/live";
  if (!authConfigured() || !safeEqual(token, process.env.ADMIN_TOKEN!)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(process.env.SESSION_SECRET!), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  redirect(next);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card>
        <CardHeader title="Private monitoring sign-in" subtitle="Live telemetry, workload runs and integration data are restricted to administrators." />
        <CardBody>
          {!authConfigured() ? (
            <Note tone="warn">
              Private monitoring is disabled: set <code>ADMIN_TOKEN</code> and a <code>SESSION_SECRET</code> of at least 32 characters in the server environment
              (see <code>.env.example</code>), then restart.
            </Note>
          ) : (
            <form action={login} className="space-y-3">
              <input type="hidden" name="next" value={sp.next ?? "/monitoring/live"} />
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Admin token</span>
                <input name="token" type="password" autoComplete="current-password" required className={inputClass} />
              </label>
              {sp.error && <p className="text-xs text-neg" role="alert">Invalid token.</p>}
              <Button variant="primary" type="submit" className="w-full">Sign in</Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
