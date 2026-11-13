"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell, api } from "../components/AdminShell";

interface Endpoint {
  id: string;
  provider_kind: string;
  label: string;
  base_url: string;
  credential_ref: string | null;
  credential_configured: boolean;
  has_stored_key: boolean;
  capabilities: string[];
  status: string;
  timeout_ms: number;
  probe_model: string | null;
  notes: string | null;
  assigned_routes: string[];
}

const KINDS = [
  "openai_compatible",
  "meta_model_api",
  "fireworks",
  "ollama",
  "anthropic",
  "private",
];

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    label: "",
    base_url: "",
    provider_kind: "openai_compatible",
    credential_ref: "",
    api_key: "",
    probe_model: "",
    notes: "",
    cap_chat: true,
    cap_segmentation: false,
    status: "draft",
  });

  const load = useCallback(async () => {
    try {
      const d = await api<{ endpoints: Endpoint[] }>("/api/admin/endpoints");
      setEndpoints(d.endpoints);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const capabilities = [
        ...(form.cap_chat ? ["chat"] : []),
        ...(form.cap_segmentation ? ["segmentation"] : []),
      ];
      await api("/api/admin/endpoints", {
        method: "POST",
        body: JSON.stringify({
          label: form.label,
          base_url: form.base_url,
          provider_kind: form.provider_kind,
          credential_ref: form.credential_ref || null,
          api_key: form.api_key || null,
          probe_model: form.probe_model || null,
          notes: form.notes || null,
          capabilities,
          status: form.status,
        }),
      });
      setForm({ ...form, label: "", base_url: "", api_key: "" });
      setMsg("Endpoint created.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError("");
    setMsg("");
    try {
      await api(`/api/admin/endpoints/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      const message = (err as Error).message;
      // §4.1: taking an assigned endpoint out of active service requires
      // confirming its routes fall to their floor.
      if (message.includes("confirm") || message.includes("floor")) {
        if (
          window.confirm(
            message + "\n\nConfirm: its routes fall to their on-device floor?"
          )
        ) {
          try {
            await api(`/api/admin/endpoints/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ ...body, confirm_floor: true }),
            });
            await load();
            return;
          } catch (e2) {
            setError((e2 as Error).message);
            return;
          }
        }
      }
      setError(message);
    }
  }

  return (
    <AdminShell>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Endpoints</h2>
        {error && <div className="err">{error}</div>}
        {msg && <p className="muted">{msg}</p>}
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Base URL</th>
              <th>Credential</th>
              <th>Capabilities</th>
              <th>Status</th>
              <th>Assigned to</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep) => (
              <tr key={ep.id}>
                <td>
                  <strong>{ep.label}</strong>
                  {ep.notes && <div className="muted">{ep.notes}</div>}
                </td>
                <td>{ep.provider_kind}</td>
                <td style={{ wordBreak: "break-all" }}>{ep.base_url}</td>
                <td>
                  {ep.credential_configured ? (
                    <span className="pill ok">
                      configured{ep.credential_ref ? ` (${ep.credential_ref})` : " (stored key)"}
                    </span>
                  ) : (
                    <span className="pill warn">not configured</span>
                  )}
                </td>
                <td>{ep.capabilities.join(", ") || "—"}</td>
                <td>{ep.status}</td>
                <td>{ep.assigned_routes.join(", ") || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="secondary"
                    onClick={async () => {
                      setMsg("");
                      try {
                        const d = await api<{ check: { ok: boolean; error_class: string; detail: string } }>(
                          "/api/admin/probe",
                          { method: "POST", body: JSON.stringify({ endpoint_id: ep.id }) }
                        );
                        setMsg(
                          `Check for ${ep.label}: ${d.check.ok ? "OK" : d.check.error_class + " — " + d.check.detail}`
                        );
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    Check now
                  </button>{" "}
                  {ep.status !== "active" && (
                    <button className="secondary" onClick={() => void patch(ep.id, { status: "active" })}>
                      Activate
                    </button>
                  )}{" "}
                  {ep.status === "active" && (
                    <button className="secondary" onClick={() => void patch(ep.id, { status: "disabled" })}>
                      Disable
                    </button>
                  )}{" "}
                  {ep.status !== "retired" && (
                    <button className="danger" onClick={() => void patch(ep.id, { status: "retired" })}>
                      Retire
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {endpoints.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No endpoints yet. Add one below — including a private
                  endpoint on your own hardware; it is a config row plus a
                  passing check, never a code change.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Add endpoint</h2>
        <form onSubmit={create}>
          <div className="grid">
            <div>
              <label>Label</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </div>
            <div>
              <label>Base URL (public API, LAN, or tailnet host — all first-class)</label>
              <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} required placeholder="https://…" />
            </div>
            <div>
              <label>Provider type</label>
              <select value={form.provider_kind} onChange={(e) => setForm({ ...form, provider_kind: e.target.value })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Credential reference (e.g. env:FIREWORKS_API_KEY) — or enter a key instead</label>
              <input value={form.credential_ref} onChange={(e) => setForm({ ...form, credential_ref: e.target.value })} />
            </div>
            <div>
              <label>API key (stored server-side only; never shown again)</label>
              <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <label>Probe model (for endpoint-level checks before assignment)</label>
              <input value={form.probe_model} onChange={(e) => setForm({ ...form, probe_model: e.target.value })} />
            </div>
          </div>
          <label>Capabilities</label>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.cap_chat} onChange={(e) => setForm({ ...form, cap_chat: e.target.checked })} /> chat
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.cap_segmentation} onChange={(e) => setForm({ ...form, cap_segmentation: e.target.checked })} /> segmentation
            </label>
          </div>
          <label>Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div style={{ marginTop: 14 }}>
            <button type="submit">Create endpoint (draft)</button>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
