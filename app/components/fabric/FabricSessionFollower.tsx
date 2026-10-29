/**
 * FabricSessionFollower — Slice 19 ("The Fabrics Drawer").
 *
 * The guest half of host-led fabrics, headless: it watches the
 * session fabric the canvas hook publishes (fabricStore) and, for
 * a GUEST, turns transitions into action —
 *
 * - the host moved the room to a fabric the guest is not on:
 *   toast "… moved the room to {fabric}" and switch to it —
 *   carrying the session room across the switch (see
 *   carrySessionRoom below), so the session itself survives
 *   the move;
 * - the rules of the fabric the guest is already on changed:
 *   toast "… updated {fabric}'s rules" (enforcement itself lives
 *   in the send funnel — this component never gates anything);
 * - anything else (heartbeats repeating the same state, the
 *   guest's own deliberate divergence, non-guest roles): nothing.
 *
 * The decision is the pure decideGuestFollow in fabricStore; this
 * component only supplies the live inputs (role, active layer,
 * divergence note) and performs the two effects (toast + switch).
 * A fabric id this client's registry doesn't know is never
 * followed into the void — the switch is skipped, the state is
 * still marked handled so the next real change is seen fresh.
 *
 * It renders nothing and never touches the canvas: switching goes
 * through the same switchExperience the menu uses, so the
 * single-canvas authority is untouched.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef } from "react";
import { useExperience } from "../../context/ExperienceContext";
import { useToast } from "../Toast";
import {
  getSessionPublicState,
  subscribeSessionState,
} from "../../../src/session/sessionStore";
import { displayNameFor } from "../../../src/identity/identityStore";
import { hostChangeNotice } from "../../../src/session/roleResolution";
import type { ExperienceConfig } from "../../../src/types/experience";
import {
  decideGuestFollow,
  fabricStateKey,
  getFabricDivergence,
  noteFabricDivergence,
  noteHostArrivedFabric,
  subscribeSessionFabric,
  type SessionFabricState,
} from "../../../src/session/fabricStore";

/**
 * Carry the session room across a fabric switch (Slice 19).
 *
 * Switching layers resets the experience config to the new
 * layer's defaults — including its default room — which would
 * silently dissolve a hosted session mid-follow: the host's claim
 * belongs to the session room, and guests who followed would land
 * in the fabric's lobby instead of beside their host. The carry
 * re-asserts the session room on the new layer's config (a
 * shallow specific-merge, so nothing else about the layer is
 * touched) plus the URL, so the claim, the transport, and the
 * fabric heartbeat all survive the move.
 *
 * The write is repeated on a short fuse (0 / 300 / 900 ms): the
 * per-layer settings mirror resolves its stored config
 * asynchronously after an activation, and a stored roomId from
 * some earlier session must not be allowed to win the race. The
 * repeats are idempotent — same value, same URL — and after the
 * last one the mirror's own write-back persists the session room
 * under the new layer, exactly as the mint flow already did for
 * the first.
 */
export function carrySessionRoom(
  updateConfig: (cfg: Partial<ExperienceConfig>) => void,
  roomId: string,
  layerId: string
): void {
  const apply = () => {
    updateConfig({ specific: { roomId } });
    if (typeof window !== "undefined") {
      try {
        const loc = new URL(window.location.href);
        loc.searchParams.set("room", roomId);
        loc.searchParams.set("exp", layerId);
        window.history.replaceState({}, "", loc.toString());
      } catch {
        // URL hygiene only — the config write is the binding one.
      }
    }
  };
  apply();
  if (typeof window !== "undefined") {
    window.setTimeout(apply, 300);
    window.setTimeout(apply, 900);
  }
}

export default function FabricSessionFollower() {
  const { state, switchExperience, updateConfig } = useExperience();
  const toast = useToast();

  const activeRef = useRef<string | null>(null);
  activeRef.current = state.activeExperience?.id ?? null;
  const layersRef = useRef(state.availableExperiences);
  layersRef.current = state.availableExperiences;
  const switchRef = useRef(switchExperience);
  switchRef.current = switchExperience;
  const updateConfigRef = useRef(updateConfig);
  updateConfigRef.current = updateConfig;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  /** State key last processed; null until the first state is seen. */
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const onFabric = (fab: SessionFabricState) => {
      const key = fabricStateKey(fab);
      const first = lastKeyRef.current === null;
      const pub = getSessionPublicState();
      const decision = decideGuestFollow({
        role: pub.role,
        activeLayerId: activeRef.current,
        fabricLayerId: fab.layerId,
        fabricKey: key,
        lastKey: lastKeyRef.current,
        divergedLayerId: getFabricDivergence(),
        // Hotfix 2.6: the self guard — a fabric whose stated host
        // is THIS client is never followed, whatever the role
        // field says (see decideGuestFollow).
        fabricHostId: fab.hostId,
        selfId: pub.selfId,
      });
      lastKeyRef.current = key;
      // Host-arrival bookkeeping (Slice 20): the note marks layers
      // this device was MOVED to by following, and only those —
      // the ghostie's "Follow the host's fabric" setting binds
      // them. Anything that is not a live guest on a live session
      // fabric clears the note: solo, hosting, or a session whose
      // fabric is gone means every fabric here was opened by hand.
      const role = pub.role;
      if (role !== "guest" || !fab.layerId) noteHostArrivedFabric(null);
      // Hotfix 2.6: the follower is INERT on the host's own client
      // by construction. A host's chair performs no follow effect —
      // no toast, no switch, no divergence bookkeeping — whatever
      // the published fabric says (including this host's own
      // fabric-change heartbeat coming back around). Role
      // resolution (src/session/roleResolution) decides who hosts;
      // this guard makes the follower's half of that contract
      // independent of the label it was handed.
      if (role === "host") return;
      // A guest who lands already ON the session fabric (invite
      // link) has nothing to announce — the first sighting of the
      // state that merely confirms where they already are is not
      // an "update".
      if (first && decision === "rules") return;
      if (decision === "stay" || !fab.layerId) return;
      const layer = layersRef.current.find((e) => e.id === fab.layerId);
      if (!layer) return;
      const hostName = fab.byName ? fab.byName : "Your host";
      if (decision === "follow") {
        // Following re-joins the session fabric by definition —
        // any earlier divergence is spent. The session room is
        // carried across the switch, so the guest lands beside
        // the host (claim, mode, and rules intact), not in the
        // fabric's default lobby.
        noteFabricDivergence(null);
        // This arrival is host-led: mark it before the switch so
        // the new layer's ghost gate resolves with the note set.
        noteHostArrivedFabric(fab.layerId);
        toastRef.current.show(`${hostName} moved the room to ${layer.name}`);
        const sessionRoom = getSessionPublicState().roomId;
        void switchRef.current(fab.layerId);
        if (sessionRoom) {
          carrySessionRoom(updateConfigRef.current, sessionRoom, fab.layerId);
        }
      } else {
        toastRef.current.show(`${hostName} updated ${layer.name}’s rules`);
      }
    };
    return subscribeSessionFabric(onFabric);
  }, []);

  return null;
}

/**
 * HostChangeNotifier — Hotfix 2.6 ("Who's hosting?").
 *
 * Role resolution used to change silently: a claim could be lost
 * to seniority, a host could depart, and nobody was told — the app
 * just started treating you as a guest (or stopped). This headless
 * watcher owns the one plain notice for a host change, on the same
 * toast channel as the follower's: "You're hosting now." when the
 * room lands on you, "{Name} is hosting now." when it lands on
 * someone else. The wording decision is the pure hostChangeNotice
 * in roleResolution (the first observed host is a baseline, never
 * a notice). It renders nothing and follows nothing — it only
 * speaks, once per actual change.
 */
export function HostChangeNotifier() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const prevHostRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    return subscribeSessionState((s) => {
      const notice = hostChangeNotice({
        prevHostId: prevHostRef.current,
        nextHostId: s.hostId,
        selfId: s.selfId,
        hostName: displayNameFor(s.hostId, s.selfId),
      });
      prevHostRef.current = s.hostId;
      if (notice) toastRef.current.show(notice);
    });
  }, []);

  return null;
}
