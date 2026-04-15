async function getHealthStatus() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1";
  const healthURL = base.replace("/api/v1", "/health");
  try {
    const res = await fetch(healthURL, { cache: "no-store" });
    if (!res.ok) {
      return `unhealthy (${res.status})`;
    }
    return "ok";
  } catch {
    return "unreachable";
  }
}

export default async function Home() {
  const health = await getHealthStatus();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-8 p-8">
      <main className="space-y-4 rounded-lg border p-8">
        <h1 className="text-3xl font-semibold">Octo-Agent</h1>
        <p className="text-muted-foreground">Full-stack scaffold is ready. Use the links below to enter auth and dashboard routes.</p>
        <div className="flex gap-4">
          <a className="rounded bg-foreground px-4 py-2 text-background" href="/login">
            Login
          </a>
          <a className="rounded border px-4 py-2" href="/dashboard">
            Dashboard
          </a>
        </div>
        <p className="text-sm text-muted-foreground">Backend base API: {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1"}</p>
        <p className="text-sm text-muted-foreground">Backend health: {health}</p>
      </main>
    </div>
  );
}
