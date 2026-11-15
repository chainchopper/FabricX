"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "checking" | "setup" | "enrolled" | "signin";

interface SetupResult {
  username: string;
  totpSecret: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // First-run setup form state.
  const [su, setSu] = useState("");
  const [sp, setSp] = useState("");
  const [sp2, setSp2] = useState("");
  const [setupError, setSetupError] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [created, setCreated] = useState<SetupResult | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((data: { setupAvailable?: boolean }) => {
        if (live) setPhase(data.setupAvailable ? "setup" : "signin");
      })
      .catch(() => {
        // If the probe fails, fall back to the ordinary sign-in form —
        // never lock the operator out over a bootstrap check.
        if (live) setPhase("signin");
      });
    return () => {
      live = false;
    };
  }, []);

  async function submitSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupError("");
    if (sp.length < 12) {
      setSetupError("Password must be at least 12 characters.");
      return;
    }
    if (sp !== sp2) {
      setSetupError("Passwords do not match.");
      return;
    }
    setSetupBusy(true);
    try {
      const r = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: su, password: sp }),
      });
      const data = (await r.json().catch(() => ({}))) as Partial<SetupResult> & {
        error?: string;
      };
      if (r.status === 404) {
        // Someone completed setup first — go straight to sign-in.
        setPhase("signin");
        setError("Setup is no longer available — an admin account already exists. Sign in instead.");
        return;
      }
      if (!r.ok || !data.totpSecret || !data.otpauthUri) {
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      setCreated({
        username: data.username ?? su,
        totpSecret: data.totpSecret,
        otpauthUri: data.otpauthUri,
        recoveryCodes: data.recoveryCodes ?? [],
      });
      setUsername(data.username ?? su);
      setPhase("enrolled");
    } catch (err) {
      setSetupError((err as Error).message);
    } finally {
      setSetupBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, totp }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "checking") {
    return (
      <div className="shell" style={{ maxWidth: 430 }}>
        <h1 style={{ fontSize: 22 }}>Fabric Admin</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="shell" style={{ maxWidth: 430 }}>
        <h1 style={{ fontSize: 22 }}>Fabric Admin — first run</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          No admin account exists yet. Create the first one now — this
          form disappears permanently once an admin exists.
        </p>
        <form onSubmit={submitSetup} className="card">
          <label htmlFor="su">Username</label>
          <input id="su" value={su} onChange={(e) => setSu(e.target.value)} autoComplete="username" />
          <label htmlFor="sp">Password (12+ characters)</label>
          <input id="sp" type="password" value={sp} onChange={(e) => setSp(e.target.value)} autoComplete="new-password" />
          <label htmlFor="sp2">Confirm password</label>
          <input id="sp2" type="password" value={sp2} onChange={(e) => setSp2(e.target.value)} autoComplete="new-password" />
          {setupError && <div className="err">{setupError}</div>}
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={setupBusy}>
              {setupBusy ? "Creating…" : "Create the first admin"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (phase === "enrolled" && created) {
    return (
      <div className="shell" style={{ maxWidth: 430 }}>
        <h1 style={{ fontSize: 22 }}>Admin created — save your authenticator secret now</h1>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Add this secret to your authenticator app <strong>now</strong>.
            It will <strong>not be shown again</strong> — after this page,
            it exists only encrypted in the database and in your
            authenticator.
          </p>
          <label>TOTP secret</label>
          <p>
            <code style={{ fontSize: 15, wordBreak: "break-all" }}>{created.totpSecret}</code>
          </p>
          <label>otpauth URI (for QR/enrollment)</label>
          <p>
            <code style={{ fontSize: 12.5, wordBreak: "break-all" }}>{created.otpauthUri}</code>
          </p>
          {created.recoveryCodes.length > 0 && (
            <>
              <label>Recovery codes — each works once, in place of an authenticator code</label>
              <p style={{ fontFamily: "monospace", fontSize: 13.5, lineHeight: 1.7 }}>
                {created.recoveryCodes.join("  ")}
              </p>
            </>
          )}
          <p className="muted">
            Sign-in still requires your password plus a code from the
            authenticator you just enrolled.
          </p>
          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={() => setPhase("signin")}>
              Continue to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell" style={{ maxWidth: 430 }}>
      <h1 style={{ fontSize: 22 }}>Fabric Admin — sign in</h1>
      <form onSubmit={submit} className="card">
        <label htmlFor="u">Username</label>
        <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <label htmlFor="p">Password</label>
        <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <label htmlFor="t">Authenticator code (or a recovery code)</label>
        <input id="t" value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
        {error && <div className="err">{error}</div>}
        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
