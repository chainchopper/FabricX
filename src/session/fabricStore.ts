/**
 * Fabric store — Slice 19 "The Fabrics Drawer + session fabric authority".
 *
 * Terrell's model (Oct 28): there are MANY fabrics, each an experience
 * with its own rules — and in a hosted session the fabric choice is
 * HOST-LED. The host picks the room's fabric and edits its guest
 * rules; guests follow automatically, are told when it changes, and
 * may only leave the session (with a warning) to open a different
 * fabric on their own.
 *
 * This module is the bridge, in the exact shape sessionStore
 * established for Slice 5 (module pub/sub, no prop drilling across
 * the single persistent canvas):
 *
 * - HOST FABRIC (chrome -> canvas): the menu records the host's
 *   current fabric + its guest rules with setHostFabric. The
 *   transport hook (useFluidMultiUser) subscribes and broadcasts a
 *   `fabric-change` message on the room's control lane — once on
 *   change, with retries, and again on the host heartbeat, so a
 *   missed message always heals. Solo users and guests never
 *   broadcast: only a host's fabric is law.
 *
 * - SESSION FABRIC (canvas -> chrome): the hook publishes the
 *   session fabric as this client knows it (its own claim when
 *   hosting; the host's last fabric-change when a guest) with
 *   setSessionFabricState. The drawer renders card state from it,
 *   and FabricSessionFollower turns transitions into guest follows
 *   + toasts.
 *
 * - DIVERGENCE (chrome -> follower): when a guest deliberately
 *   leaves the session fabric (the leave-warning confirm), the
 *   menu notes the layer they walked away from. The follower
 *   honors it — no yanking a guest back onto a fabric they chose
 *   to leave — until the host picks a DIFFERENT fabric, which is
 *   a new invitation.
 *
 * The rules themselves are deliberately small and real (Terrell's
 * participant scope): guests may DRAW, guests may send VERBS,
 * guests may play NOTES. They are enforced in the send funnel,
 * UNDER the Slice 5 session modes: fabricGate can only ever take
 * a send the mode already allowed and refuse it — never grant one
 * the mode refused. The host is never bound by their own guest
 * rules. The identity seed is never part of any of this: fabric
 * messages carry a layer id, a display name, and three booleans.
 *
 * Everything above the pub/sub line is pure and dependency-free
 * so scripts/fabrics-drawer-check.mjs can prove the matrix
 * headlessly.
 *
 * Powered by Nirvana
 */

import type { SessionRole } from "./sessionStore";

// ------------------------------------------------------------------
// Guest rules (pure)
// ------------------------------------------------------------------

/** The three things a host may allow or refuse their guests, per fabric. */
export interface FabricRules {
  /** Strokes and shapes on the canvas (fluid-interaction, batches, recipes). */
  draw: boolean;
  /** Sensory verbs (heart / cheer / tickle) and verb-class events (shake). */
  verbs: boolean;
  /** Discrete notes (piano, stage key strip). */
  notes: boolean;
}

export const DEFAULT_FABRIC_RULES: FabricRules = {
  draw: true,
  verbs: true,
  notes: true,
};

export const FABRIC_RULE_KEYS = ["draw", "verbs", "notes"] as const;

export type FabricRuleKey = (typeof FABRIC_RULE_KEYS)[number];

/** The send funnel's three gated kinds — one per rule. */
export type FabricSendKind = FabricRuleKey;

export const FABRIC_RULE_LABEL: Record<FabricRuleKey, string> = {
  draw: "Guests can draw",
  verbs: "Guests can send verbs",
  notes: "Guests can play notes",
};

/**
 * Clamp an unknown value to a FabricRules: only the three known
 * keys survive, only real booleans are honored, and anything
 * missing or malformed falls back to the permissive default —
 * a garbled rules payload must never silently mute a room.
 */
export function sanitizeFabricRules(input: unknown): FabricRules {
  const out: FabricRules = { ...DEFAULT_FABRIC_RULES };
  if (!input || typeof input !== "object") return out;
  const rec = input as Record<string, unknown>;
  for (const key of FABRIC_RULE_KEYS) {
    if (typeof rec[key] === "boolean") out[key] = rec[key] as boolean;
  }
  return out;
}

/** "111" / "101" — a stable comparison key for a rules value. */
export function fabricRulesKey(rules: FabricRules): string {
  return FABRIC_RULE_KEYS.map((k) => (rules[k] ? "1" : "0")).join("");
}

// ------------------------------------------------------------------
// The enforcement gate (pure)
// ------------------------------------------------------------------

/**
 * THE RULE GATE (Slice 19). Consulted by the send funnel next to
 * Slice 5's computeCanSend, never instead of it:
 *
 * - If the session mode already refuses the send, the answer is
 *   no — rules NEVER expand a send past the mode.
 * - The host is never bound by guest rules (they are the host's
 *   settings FOR guests), and an open room has no rules at all.
 * - A guest is bound by the session fabric's rules for the kind
 *   being sent. No rules received yet (the host's first heartbeat
 *   is still in flight) means the defaults — the mode alone rules.
 */
export function fabricGate(args: {
  modeCanSend: boolean;
  role: SessionRole;
  rules: FabricRules | null;
  kind: FabricSendKind;
}): boolean {
  if (!args.modeCanSend) return false;
  if (args.role !== "guest") return true;
  if (!args.rules) return true;
  return args.rules[args.kind];
}

// ------------------------------------------------------------------
// fabric-change message validation (pure)
// ------------------------------------------------------------------

export interface ValidFabricChange {
  layerId: string;
  byName: string;
  rules: FabricRules;
}

/**
 * Validate an inbound `fabric-change` payload. Layer ids are
 * registry knowledge: when the caller has the registry (the
 * follower / the drawer) it passes the known ids and an unknown
 * id is dropped; the transport hook has no registry and passes
 * nothing, in which case the id is only structurally checked
 * (a non-empty string, length-capped) — rules are sanitized at
 * every layer regardless, so a hostile or garbled payload can
 * at worst name a layer the chrome will refuse to open.
 */
export function validateFabricChange(
  raw: unknown,
  knownLayerIds?: ReadonlySet<string>
): ValidFabricChange | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const layerId = rec.layerId;
  if (typeof layerId !== "string" || layerId.length === 0 || layerId.length > 64) {
    return null;
  }
  if (knownLayerIds && !knownLayerIds.has(layerId)) return null;
  const byName =
    typeof rec.byName === "string" ? rec.byName.slice(0, 40) : "";
  return { layerId, byName, rules: sanitizeFabricRules(rec.rules) };
}

// ------------------------------------------------------------------
// Guest follow decision (pure)
// ------------------------------------------------------------------

export type GuestFollowDecision = "follow" | "rules" | "stay";

/** Comparison key for a published session-fabric state. */
export function fabricStateKey(state: {
  layerId: string | null;
  rules: FabricRules;
}): string {
  return `${state.layerId ?? ""}:${fabricRulesKey(state.rules)}`;
}

/**
 * What a guest's client should do with a newly published session
 * fabric state:
 *
 * - "follow": the host moved the room to a fabric the guest is
 *   not on — switch to it (and toast). A state identical to the
 *   last one processed (the heartbeat repeating itself) is not
 *   new and never re-fires.
 * - "rules": the guest is already on the session fabric and its
 *   rules changed — toast the update; no switch. A RESTATED state
 *   for a fabric the guest has only just arrived on (the last key
 *   names a different or no layer — the join/rejoin path) is an
 *   arrival, not an update, and stays silent.
 * - "stay": everything else — not a guest, no fabric published,
 *   nothing new, or the guest deliberately diverged from THIS
 *   fabric (divergedLayerId) and must not be yanked back. A host
 *   move to a DIFFERENT fabric outranks the divergence: it is a
 *   new invitation, and a guest who truly left the room's
 *   transport never receives it anyway.
 */
export function decideGuestFollow(args: {
  role: SessionRole;
  activeLayerId: string | null;
  fabricLayerId: string | null;
  fabricKey: string;
  lastKey: string | null;
  divergedLayerId: string | null;
}): GuestFollowDecision {
  if (args.role !== "guest") return "stay";
  if (!args.fabricLayerId) return "stay";
  if (args.fabricKey === args.lastKey) return "stay";
  if (args.divergedLayerId === args.fabricLayerId) return "stay";
  if (args.fabricLayerId !== args.activeLayerId) return "follow";
  // On the session fabric: only a rules change to a fabric state
  // this chair has already settled into counts as an update.
  const lastLayer = args.lastKey ? args.lastKey.split(":")[0] : null;
  if (lastLayer !== args.fabricLayerId) return "stay";
  return "rules";
}

// ------------------------------------------------------------------
// Host rules persistence shape (pure)
// ------------------------------------------------------------------

/** Where the host's per-fabric guest rules live on the host's device. */
export const FABRIC_HOST_RULES_KEY = "fabric_host_rules_v1";

export type HostRulesMap = Record<string, FabricRules>;

/** Clamp a stored host-rules map: known-shape entries only, each sanitized. */
export function sanitizeHostRulesMap(input: unknown): HostRulesMap {
  if (!input || typeof input !== "object") return {};
  const out: HostRulesMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0 || key.length > 64) continue;
    if (!value || typeof value !== "object") continue;
    out[key] = sanitizeFabricRules(value);
  }
  return out;
}

// ------------------------------------------------------------------
// Host fabric (chrome -> canvas)
// ------------------------------------------------------------------

export interface HostFabricState {
  layerId: string;
  rules: FabricRules;
}

let hostFabric: HostFabricState | null = null;
let hostFabricKey = "";
const hostFabricListeners = new Set<(f: HostFabricState | null) => void>();

export function getHostFabric(): HostFabricState | null {
  return hostFabric ? { layerId: hostFabric.layerId, rules: { ...hostFabric.rules } } : null;
}

/**
 * Record the host's current fabric + guest rules. Deduped by
 * value: the menu re-asserts this on every relevant render path
 * (role change, layer change, rules edit), and only a real change
 * notifies the transport hook — which is what gets broadcast.
 */
export function setHostFabric(layerId: string, rules: FabricRules): void {
  const clean = sanitizeFabricRules(rules);
  const key = `${layerId}:${fabricRulesKey(clean)}`;
  if (key === hostFabricKey) return;
  hostFabricKey = key;
  hostFabric = { layerId, rules: clean };
  hostFabricListeners.forEach((l) => l(getHostFabric()));
}

export function clearHostFabric(): void {
  if (!hostFabric) return;
  hostFabric = null;
  hostFabricKey = "";
  hostFabricListeners.forEach((l) => l(null));
}

export function subscribeHostFabric(
  fn: (f: HostFabricState | null) => void
): () => void {
  hostFabricListeners.add(fn);
  fn(getHostFabric());
  return () => {
    hostFabricListeners.delete(fn);
  };
}

// ------------------------------------------------------------------
// Session fabric (canvas -> chrome)
// ------------------------------------------------------------------

export interface SessionFabricState {
  /** The room's fabric as this client knows it; null = none published. */
  layerId: string | null;
  /** Guest rules in force for that fabric (defaults until stated). */
  rules: FabricRules;
  /** Who leads the room (the host's fluid userId), or null when open. */
  hostId: string | null;
  /** The host's display name as carried by fabric-change (may be ""). */
  byName: string;
}

const fabricState: SessionFabricState = {
  layerId: null,
  rules: { ...DEFAULT_FABRIC_RULES },
  hostId: null,
  byName: "",
};
const fabricListeners = new Set<(s: SessionFabricState) => void>();

export function getSessionFabricState(): SessionFabricState {
  return { ...fabricState, rules: { ...fabricState.rules } };
}

export function setSessionFabricState(next: Partial<SessionFabricState>): void {
  let changed = false;
  if (next.layerId !== undefined && next.layerId !== fabricState.layerId) {
    fabricState.layerId = next.layerId;
    changed = true;
  }
  if (next.hostId !== undefined && next.hostId !== fabricState.hostId) {
    fabricState.hostId = next.hostId;
    changed = true;
  }
  if (next.byName !== undefined && next.byName !== fabricState.byName) {
    fabricState.byName = next.byName;
    changed = true;
  }
  if (next.rules !== undefined) {
    const clean = sanitizeFabricRules(next.rules);
    if (fabricRulesKey(clean) !== fabricRulesKey(fabricState.rules)) {
      fabricState.rules = clean;
      changed = true;
    }
  }
  if (changed) {
    fabricListeners.forEach((l) => l(getSessionFabricState()));
  }
}

export function subscribeSessionFabric(
  fn: (s: SessionFabricState) => void
): () => void {
  fabricListeners.add(fn);
  fn(getSessionFabricState());
  return () => {
    fabricListeners.delete(fn);
  };
}

// ------------------------------------------------------------------
// Divergence (chrome -> follower)
// ------------------------------------------------------------------

let divergedLayerId: string | null = null;

/**
 * Note the session-fabric layer a guest deliberately walked away
 * from (the leave-warning confirm), or clear the note (null) when
 * they rejoin the session fabric. Read by the follower at decision
 * time; see decideGuestFollow.
 */
export function noteFabricDivergence(layerId: string | null): void {
  divergedLayerId = layerId;
}

export function getFabricDivergence(): string | null {
  return divergedLayerId;
}

// ------------------------------------------------------------------
// Host arrival (follower -> layer gate) — Slice 20
// ------------------------------------------------------------------

let hostArrivedLayerId: string | null = null;

/**
 * Note the layer this device arrived on by FOLLOWING the host
 * (the session follower switched it), or clear the note (null)
 * when the primary opens a fabric themselves, the session ends,
 * or this device is no longer a guest.
 *
 * Read by the canvas's ghost gate (LegacyFluid): the ghostie's
 * "Follow the host's fabric" shared setting binds ONLY these
 * arrivals — with follow off, the ghost does not join fabrics its
 * primary was moved to, while fabrics the primary opened
 * themselves always get their ghost (subject to the layer's own
 * "Ghost in this layer" setting). Manual opens clear the note in
 * FabricMenu's card handlers; only the follower sets it.
 */
export function noteHostArrivedFabric(layerId: string | null): void {
  hostArrivedLayerId = layerId;
}

export function getHostArrivedFabric(): string | null {
  return hostArrivedLayerId;
}
