"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell, api } from "../components/AdminShell";

interface RouteRow {
  route_id: string;
  product_label: string;
  shape: string;
  floor: string;
  premium: boolean;
  entitlement_key: string | null;
  enabled: boolean;
}
interface Assignment {
  route_id: string;
  endpoint_id: string;
  model_id: string;
  params: Record<string, unknown>;
  endpoint_label: string;
  prior_endpoint_id: string | null;
  changed_at: string;
  changed_by: string | null;
}
interface EndpointLite {
  id: string;
  label: string;
  capabilities: string[];
  status: string;
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointLite[]>([]);
  const [form, setForm] = useState<Record<string, { endpoint_id: string; model_id: string }>>({});
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ routes: RouteRow[]; assignments: Assignment[] }>(
        "/api/admin/routes"
      );
      setRoutes(d.routes);
      setAssignments(d.assignments);
      const eps = await api<{ endpoints: EndpointLite[] }>("/api/admin/endpoints");
      setEndpoints(eps.endpoints);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function swap(routeId: string) {
    const f = form[routeId];
    if (!f?.endpoint_id || !f?.model_id) {
      setError("Pick an endpoint and enter a model ID first.");
      return;
    }
    if (
      !window.confirm(
        `Assign to ${routeId}? The panel first runs a real probe of that endpoint in this route's shape — the assignment only changes if the probe passes.`
      )
    )
      return;
    setError("");
    setMsg("");
    try {
      await api("/api/admin/assignments", {
        method: "PUT",
        body: JSON.stringify({
          route_id: routeId,
          endpoint_id: f.endpoint_id,
          model_id: f.model_id,
        }),
      });
      setMsg(`${routeId} assigned. Publish config from the dashboard to ship the new revision to apps.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <AdminShell>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Routes & assignments</h2>
        <p className="muted">
          The route is the unit of configuration (§4.2). Assignments live
          server-side only — the published config carries route IDs and
          product labels, never endpoints or models. Voice input is a
          platform service and is deliberately not a route.
        </p>
        {error && <div className="err">{error}</div>}
        {msg && <p className="muted">{msg}</p>}
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Current assignment</th>
              <th>Swap (probe must pass first)</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const a = assignments.find((x) => x.route_id === r.route_id);
              const f = form[r.route_id] ?? { endpoint_id: "", model_id: "" };
              const needed = r.shape === "segmentation" ? "segmentation" : "chat";
              const eligible = endpoints.filter(
                (e) => e.capabilities.includes(needed) && e.status !== "retired"
              );
              return (
                <tr key={r.route_id}>
                  <td>
                    <strong>{r.product_label}</strong>
                    <div className="muted">
                      {r.route_id} · {r.shape}
                      {r.premium ? ` · premium (${r.entitlement_key})` : ""}
                    </div>
                    <div className="muted">Floor: {r.floor}</div>
                  </td>
                  <td>
                    {r.shape === "local"
                      ? "— local by construction; labels/offering only"
                      : a
                        ? `${a.endpoint_label} (${a.model_id}) — since ${new Date(a.changed_at).toLocaleString()}${a.prior_endpoint_id ? " · one-click rollback target recorded" : ""}`
                        : "unassigned"}
                  </td>
                  <td>
                    {r.shape === "local" ? (
                      <span className="muted">no endpoint can be designated</span>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <select
                          value={f.endpoint_id}
                          onChange={(e) =>
                            setForm({ ...form, [r.route_id]: { ...f, endpoint_id: e.target.value } })
                          }
                        >
                          <option value="">endpoint…</option>
                          {eligible.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.label} ({e.status})
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="model ID"
                          value={f.model_id}
                          onChange={(e) =>
                            setForm({ ...form, [r.route_id]: { ...f, model_id: e.target.value } })
                          }
                        />
                        <button onClick={() => void swap(r.route_id)}>Assign</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
