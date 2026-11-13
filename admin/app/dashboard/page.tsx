"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell, api } from "../components/AdminShell";

interface RouteRow {
  route_id: string;
  product_label: string;
  shape: string;
  floor: string;
  premium: boolean;
  enabled: boolean;
}
interface Assignment {
  route_id: string;
  endpoint_id: string;
  model_id: string;
  endpoint_label: string;
  changed_at: string;
}
interface Check {
  endpoint_id: string;
  route_id: string | null;
  ok: boolean;
  error_class: string | null;
  latency_ms: number | null;
  detail: string | null;
  checked_at: string;
}
interface Alert {
  id: string;
  route_id: string | null;
  route_label: string | null;
  endpoint_label: string;
  reason: string;
  opened_at: string;
  notified_at: string | null;
  notify_detail: string | null;
}

export default function DashboardPage() {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{
        routes: RouteRow[];
        assignments: Assignment[];
        latest_checks: Check[];
        open_alerts: Alert[];
      }>("/api/admin/routes");
      setRoutes(d.routes);
      setAssignments(d.assignments);
      setChecks(d.latest_checks);
      setAlerts(d.open_alerts);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkFor = (routeId: string) => {
    const a = assignments.find((x) => x.route_id === routeId);
    if (!a) return null;
    return checks.find(
      (c) => c.endpoint_id === a.endpoint_id && c.route_id === routeId
    );
  };

  return (
    <AdminShell>
      {alerts.length > 0 ? (
        <div className="banner bad">
          <strong>{alerts.length} open alert{alerts.length > 1 ? "s" : ""}:</strong>{" "}
          {alerts.map((a) => (
            <span key={a.id} style={{ display: "block" }}>
              {a.route_label ?? a.endpoint_label}
              {a.route_id ? ` (route ${a.route_id})` : ""}: endpoint failing —{" "}
              {a.reason}
              {a.notified_at
                ? ` · notified ${new Date(a.notified_at).toLocaleString()}`
                : " · NOT YET NOTIFIED — the alerter itself needs attention"}
            </span>
          ))}
        </div>
      ) : (
        <div className="banner ok">
          No open alerts. Health below is real recorded probe results only —
          a route with no checks yet says so.
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>AI routes</h2>
          <span className="spacer" style={{ flex: 1 }} />
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              try {
                const d = await api<{ probed: number }>("/api/admin/probe", {
                  method: "POST",
                  body: JSON.stringify({ all: true }),
                });
                setMsg(`Probed ${d.probed} target(s).`);
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Health-check now (all)
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              try {
                const d = await api<{ version: number }>("/api/admin/publish", {
                  method: "POST",
                  body: JSON.stringify({ note: "published from dashboard" }),
                });
                setMsg(`Config v${d.version} published.`);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Publish config
          </button>
        </div>
        {msg && <p className="muted">{msg}</p>}
        {error && <div className="err">{error}</div>}
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Route</th>
              <th>Assigned endpoint (model)</th>
              <th>Latest real check</th>
              <th>Floor (Fallback Law)</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const a = assignments.find((x) => x.route_id === r.route_id);
              const c = checkFor(r.route_id);
              return (
                <tr key={r.route_id}>
                  <td>
                    <strong>{r.product_label}</strong>
                    <div className="muted">
                      {r.route_id} · {r.shape}
                      {r.premium ? " · premium" : ""}
                      {r.enabled ? "" : " · disabled"}
                    </div>
                  </td>
                  <td>
                    {r.shape === "local"
                      ? "— (on-device by construction)"
                      : a
                        ? `${a.endpoint_label} (${a.model_id})`
                        : "unassigned — today's built-in behavior rules"}
                  </td>
                  <td>
                    {r.shape === "local" ? (
                      <span className="muted">not probed (local)</span>
                    ) : !a ? (
                      <span className="muted">no assignment</span>
                    ) : !c ? (
                      <span className="pill warn">no checks yet</span>
                    ) : c.ok ? (
                      <span className="pill ok">
                        ok · {c.latency_ms}ms · {new Date(c.checked_at).toLocaleTimeString()}
                      </span>
                    ) : (
                      <span className="pill bad">
                        {c.error_class} · {new Date(c.checked_at).toLocaleTimeString()}
                      </span>
                    )}
                    {c && !c.ok && <div className="muted">{c.detail}</div>}
                  </td>
                  <td className="muted">{r.floor}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Surfaces for later slices (subscriptions, ads, releases) are not
        built yet and are not shown — see ADMIN-PORTAL-SPEC.md §9.
      </p>
    </AdminShell>
  );
}
