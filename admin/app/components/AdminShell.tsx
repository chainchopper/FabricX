"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export async function api<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return data;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    api<{ admin: { username: string } }>("/api/admin/session")
      .then((d) => setUsername(d.admin.username))
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!username) {
    return (
      <div className="shell">
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">Fabric Admin</span>
        <nav>
          <a href="/dashboard">Dashboard</a>
          <a href="/endpoints">Endpoints</a>
          <a href="/routes">Routes</a>
        </nav>
        <span className="spacer" />
        <span className="muted">{username}</span>
        <button
          className="secondary"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" }).catch(() => {});
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      </div>
      {children}
    </div>
  );
}
