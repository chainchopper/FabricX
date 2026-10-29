/**
 * Rewards feed — Slice 24.
 *
 * The headless watcher that turns facts the app already knows
 * into rewards events (rewardsCore's typed union), so no feature
 * screen ever scrapes its own stats:
 *
 * - SESSION (sessionStore): the edge into sharing (another human
 *   present) reports session-shared once per session; a host's
 *   room GROWING reports again with countSession false so Good
 *   Host's crowd fact stays true mid-session. While sharing,
 *   the small hours (local 00:00–05:59) report night-active once
 *   per local date — Night Owl counts nights, not minutes, and
 *   a 60s tick catches a session that crosses midnight.
 * - LINT (lintStore): a device registering for the first time
 *   reports lint-joined WITH ITS SOURCE: "relay" is a real
 *   object that joined over the room relay; "local" is the
 *   in-app simulator's preview. The reducer earns First Light
 *   only for the real thing — the source rides the event so the
 *   honesty lives in the data, not in a comment.
 * - WARM WELCOME: while this client HOSTS, a guest id appearing
 *   that wasn't in the previous snapshot is a join. When the
 *   host has earned Good Host (the Warm Welcome power-up), the
 *   feed dispatches FABRIC_WARM_WELCOME_EVENT; the canvas
 *   (LegacyFluid) answers by asking its ghost to greet — through
 *   the ghost's own budget, so a spent budget means no greeting
 *   (GhostPeer decides, and its refusal is final). The feed's
 *   first snapshot never greets: those guests were here before
 *   the hosting was.
 *
 * Started once by the RewardsFeed chrome component (app
 * _layout's ChromeLayer, beside the FabricSessionFollower) —
 * idempotent, and independent of which experience is on screen.
 *
 * Powered by Nirvana
 */

import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../session/sessionStore";
import { getLintSnapshot, subscribeLintStore } from "../lint/lintStore";
import { FABRIC_WARM_WELCOME_EVENT } from "../ghost/ghostStore";
import { powerUpUnlocked } from "./rewardsCore";
import {
  getRewardsSnapshot,
  recordLintJoined,
  recordNightActive,
  recordSessionShared,
} from "./rewardsStore";

let started = false;

function localNightKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Past local midnight, before 6am — Terrell's hours, as a fact. */
function isNightHour(d: Date): boolean {
  return d.getHours() < 6;
}

export function startRewardsFeed(): () => void {
  if (started) return () => undefined;
  started = true;

  let wasShared = false;
  let lastHostCrowd = 0;
  let prevGuests: Set<string> | null = null;
  let lastSession: SessionPublicState = getSessionPublicState();

  const checkNight = (s: SessionPublicState) => {
    if (s.peers < 1) return;
    const now = new Date();
    if (isNightHour(now)) recordNightActive(localNightKey(now));
  };

  const offSession = subscribeSessionState((s) => {
    lastSession = s;
    const shared = s.peers >= 1;
    const crowd = s.peers + 1;
    if (shared && !wasShared) {
      recordSessionShared({
        isHost: s.role === "host",
        peerCount: crowd,
        countSession: true,
      });
      lastHostCrowd = s.role === "host" ? crowd : 0;
    } else if (shared && s.role === "host" && crowd > lastHostCrowd) {
      lastHostCrowd = crowd;
      recordSessionShared({
        isHost: true,
        peerCount: crowd,
        countSession: false,
      });
    }
    if (!shared) lastHostCrowd = 0;
    wasShared = shared;
    checkNight(s);

    // Warm Welcome: new guest ids while hosting (never the
    // first snapshot — those guests predate this hosting).
    if (s.role === "host") {
      const guests = new Set(s.guestIds);
      if (prevGuests !== null) {
        const joined = [...guests].some((g) => !prevGuests!.has(g));
        if (
          joined &&
          typeof window !== "undefined" &&
          powerUpUnlocked(getRewardsSnapshot(), "warm-welcome")
        ) {
          window.dispatchEvent(
            new CustomEvent(FABRIC_WARM_WELCOME_EVENT, {
              detail: getRewardsSnapshot().equipped.welcomeVerb,
            })
          );
        }
      }
      prevGuests = guests;
    } else {
      prevGuests = null;
    }
  });

  const nightTick = setInterval(() => checkNight(lastSession), 60_000);

  const seenLint = new Set<string>(
    getLintSnapshot().devices.map((d) => d.peerId)
  );
  const offLint = subscribeLintStore((snap) => {
    for (const d of snap.devices) {
      if (seenLint.has(d.peerId)) continue;
      seenLint.add(d.peerId);
      // Honest source: only a relay-heard hello is a real lint
      // object joining the fabric; the simulator's local preview
      // is reported as simulated and earns nothing (reducer).
      recordLintJoined(d.source !== "relay");
    }
  });

  return () => {
    started = false;
    offSession();
    offLint();
    clearInterval(nightTick);
  };
}
