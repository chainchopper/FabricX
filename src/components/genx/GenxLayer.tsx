/**
 * GenxLayer — "The Fold" (Slice 36): the distributed-compute
 * fabric's face on the fluid.
 *
 * The fluid is this fabric's ground (the sam-see precedent: its
 * own experience, its own rules, the shared fluid as surface).
 * On it, the room's compute field renders as a MICROCOSM:
 *
 * - Every contributor is an entity — a mote with a trail, in
 *   their signature hue (the ghost in its own, the GenX node as
 *   a ringed machine mote). An entity's SPEED, SIZE and REACH
 *   scale with its VERIFIED contributed compute: the mote of
 *   the device that has proven the most work moves fastest,
 *   swells largest, and reaches furthest toward the targets.
 *   Nothing about an entity is decorative arithmetic — the
 *   numbers underneath are the contribution table itself.
 * - The job's target regions are hostile cells: clusters the
 *   room's entities converge on. A target shrinks as its shards
 *   verify and dies exactly when its last shard is verified —
 *   never on a timer, never on a schedule. Its death bloom is
 *   an event the field state recorded, rendered once.
 * - Spectating is a view: riding a participant moves this
 *   screen's mote-focus to their entity and says so ("view
 *   only"). It claims no compute and changes no state.
 *
 * The HUD carries the field's facts (progress from verified
 * shards, room power from join benchmarks, ETA from the same),
 * the GenX node card (the node's own reports, telemetry
 * labelled node-reported), follow alerts, and the bounty board.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import {
  brainChipVisible,
  getBrainSnapshot,
  subscribeOnDeviceBrain,
  type BrainSnapshot,
} from "../../ai/onDeviceBrain";
import { ChromeMount } from "../ui/ChromeMount";
import { getGhostPublicState } from "../../ghost/ghostStore";
import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionRole,
} from "../../session/sessionStore";
import {
  getIdentitySnapshot,
  hueCss,
  hueDyeColor,
  subscribeIdentity,
  type IdentitySnapshot,
} from "../../identity/identityStore";
import type { FluidInteraction } from "../../types/fluid";
import { allCardData, fmtEta, fmtJuice, fmtRate } from "../../genx/boardData";
import {
  contributionsOf,
  missionProgress,
  targetsOf,
} from "../../genx/fieldState";
import {
  getGenxSnapshot,
  setGenxFollowed,
  setGenxSpectating,
  subscribeGenx,
  type GenxSnapshot,
} from "../../genx/genxStore";
import type { GenxWireMessage } from "../../genx/genxTypes";
import { useGenxRoom } from "../../genx/useGenxRoom";
import { fetchNodeJobResults, pdbTextFromResults } from "../../genx/nodeBridge";
import { parsePdb } from "../../genx/pdb";
import {
  HEMOGLOBIN_STRUCTURE_ID,
  bundledStructureMeta,
  structureShards,
} from "../../genx/structures";
import { loadBundledStructure } from "../../genx/molStructures";
import type { MolStructure } from "../../genx/molMath";
import { colors, radius, spacing } from "../../theme/tokens";
import BountyBoard from "./BountyBoard";
import StructureView, { type StructureBinding } from "./StructureView";

export interface GenxLayerProps {
  userId: string;
  lendDevice: boolean;
  nodeUrl: string;
  sendGenx: (msg: Omit<GenxWireMessage, "from">) => void;
  injectInteraction: (interaction: FluidInteraction) => void;
}

/** Deterministic 0..1 hash of an id (entity anchors are stable per room). */
function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

interface Entity {
  id: string;
  hue: number;
  verifiedWork: number;
  isNode: boolean;
}

/**
 * Slice 44 (supersedes Slice 43's numbers, same pattern): the
 * Fold cluster's declared anchors. The chip slot moved in
 * Slice 44 — BrainChrome's chip wrapper now sits at top:68 and
 * its pill is ~29pt tall (5+5 padding, the 12pt caption line,
 * borders), so the chip's bottom edge lands at ≈97pt. The
 * cluster's resting top is 92 (just under the Essence card's
 * bottom edge at ≈86), and while the chip is up the cluster
 * starts at 92 + 12 = 104, clearing the chip with room to
 * spare. The cluster's bottom is 118, above the Fold HUD
 * band's top edge (≈98pt of HUD + margin) by ~20pt.
 */
const CLUSTER_TOP = 92;
const CLUSTER_BOTTOM = 118;
const BRAIN_CHIP_CLEARANCE = 12;

export default function GenxLayer(props: GenxLayerProps) {
  // Allocator eligibility follows the room's authority: the
  // host allocates; in an open room the starter of a mission is
  // its allocator (the mission record carries the id). A guest
  // never allocates.
  const [role, setRole] = useState<SessionRole>(
    () => getSessionPublicState().role
  );
  useEffect(
    () => subscribeSessionState((s) => setRole(s.role)),
    []
  );
  const isHost = role !== "guest";
  const room = useGenxRoom({
    userId: props.userId,
    lendDevice: props.lendDevice,
    nodeUrl: props.nodeUrl,
    sendGenx: props.sendGenx,
  });
  const [snap, setSnap] = useState<GenxSnapshot>(() => getGenxSnapshot());
  const [ident, setIdent] = useState<IdentitySnapshot>(() =>
    getIdentitySnapshot()
  );
  const [boardOpen, setBoardOpen] = useState(true);
  useEffect(() => subscribeGenx(setSnap), []);
  useEffect(() => subscribeIdentity(setIdent), []);

  // Slice 43: the brain's progress chip (BrainChrome, root
  // chrome) rides the top edge centered at top:60 — while it is
  // up, the Fold's top cluster starts below it instead of
  // underneath it. The predicate is BrainChrome's own showChip
  // condition read from the same store, so the layer and the
  // chrome can never disagree about whether the chip is up.
  // (The one-time ASK card is a different, modal moment that
  // every layer sits under; only the chip moves the cluster.)
  const [brainSnap, setBrainSnap] = useState<BrainSnapshot>(() =>
    getBrainSnapshot()
  );
  useEffect(() => subscribeOnDeviceBrain(setBrainSnap), []);
  // Slice 44: the predicate is the shared brainChipVisible()
  // from the brain store — BrainChrome renders by it,
  // GroundingChrome yields by it, this layer clears by it; one
  // expression, no copies to drift.
  const brainChipUp = brainChipVisible(brainSnap);
  const narrow = Dimensions.get("window").width < 640;
  const clusterTop = CLUSTER_TOP + (brainChipUp ? BRAIN_CHIP_CLEARANCE : 0);

  const field = snap.field;
  const mission = field.mission;
  const cards = useMemo(
    () => allCardData(field, props.userId),
    [field, props.userId]
  );
  const missionCard = mission
    ? cards.find((c) => c.def.id === mission.spec.jobId) ?? null
    : null;
  const progress = missionProgress(mission);
  const contributions = useMemo(
    () =>
      contributionsOf(
        mission,
        missionCard?.def.juicePool ?? null
      ),
    [mission, missionCard]
  );

  /* ---------------- Slice 40: the molecular view ---------------- */
  // Bounty defs bind a structureId (Slice 39's data contract); the
  // registry resolves it and the loader fetches + parses the real
  // .pdb asset. The view binds ranges to the live mission's shards
  // positionally — range i of structureShards(structure, shardCount)
  // belongs to mission shard i.
  const [viewer, setViewer] = useState<{
    structure: MolStructure;
    binding: StructureBinding;
    title?: string;
    note?: string;
  } | null>(null);
  // Slice 44: the structure view fades out through ChromeMount
  // on close, so the last open viewer is kept for the exit —
  // clearing `viewer` starts the fade instead of unmounting.
  const lastViewerRef = useRef(viewer);
  if (viewer) lastViewerRef.current = viewer;
  const shownViewer = viewer ?? lastViewerRef.current;
  const [resultBusy, setResultBusy] = useState(false);
  const [resultNote, setResultNote] = useState<string | null>(null);
  const [structureBusy, setStructureBusy] = useState(false);

  const openStructureById = async (
    structureId: string,
    jobId: string | null,
    title: string
  ) => {
    setResultNote(null);
    setStructureBusy(true);
    try {
      const structure = await loadBundledStructure(structureId);
      if (!structure) {
        setResultNote("That structure couldn't be loaded — nothing to show.");
        return;
      }
      if (mission && jobId && mission.spec.jobId === jobId) {
        // The live binding: range i belongs to mission shard i, and
        // the view settles each range as that shard verifies.
        setViewer({
          structure,
          title,
          binding: {
            ranges: structureShards(structure, mission.shards.length),
            shardIds: mission.shards.map((s) => s.shardId),
            key: mission.spec.missionId,
          },
        });
        return;
      }
      // No live mission behind this structure: the honest unclaimed
      // segmentation (16 ranges, the seed mission's shape) — the
      // chain renders unfolded and shaking until real work verifies.
      const ranges = structureShards(structure, 16);
      setViewer({
        structure,
        title,
        note: "No room fold is working this structure yet — its domains settle here, one by one, as shards verify.",
        binding: {
          ranges,
          shardIds: ranges.map((r) => `unclaimed-${r.shardId}`),
          key: `unclaimed:${structure.id}`,
        },
      });
    } finally {
      setStructureBusy(false);
    }
  };

  const openNodeResult = async (jobId: string) => {
    const nodeJob = field.bounties[jobId]?.nodeJob;
    if (!nodeJob?.nodeJobId || resultBusy) return;
    setResultBusy(true);
    setResultNote(null);
    try {
      const res = await fetchNodeJobResults(
        props.nodeUrl,
        nodeJob.provider || "esmfold",
        nodeJob.nodeJobId
      );
      const text = res.ok && res.text ? pdbTextFromResults(res.text) : null;
      if (!text) {
        setResultNote(
          "The node's results didn't carry a readable structure — nothing to show yet."
        );
        return;
      }
      let structure: MolStructure | null = null;
      try {
        structure = parsePdb(text, {
          id: `node-${jobId}`,
          name: "Node result",
          source: "node",
        }) as unknown as MolStructure;
      } catch {
        structure = null;
      }
      if (!structure || structure.totalResidues === 0) {
        setResultNote(
          "The node's results didn't carry a readable structure — nothing to show yet."
        );
        return;
      }
      const ranges = structureShards(structure, 16);
      setViewer({
        structure,
        title: "Node result",
        note: "The finished structure the node returned for this job.",
        binding: {
          ranges,
          shardIds: ranges.map((r) => `result-${r.shardId}`),
          forceSettled: true,
          key: `result:${jobId}:${nodeJob.nodeJobId}`,
        },
      });
    } finally {
      setResultBusy(false);
    }
  };

  // Which board cards can open the structure view / a node result.
  const viewableStructureIds = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const c of cards) {
      if (c.structureId && bundledStructureMeta(c.structureId)) {
        map[c.def.id] = true;
      }
    }
    return map;
  }, [cards]);
  const resultJobIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) {
      const nodeJob = field.bounties[c.def.id]?.nodeJob;
      if (nodeJob?.hasResults && nodeJob.nodeJobId) set.add(c.def.id);
    }
    return set;
  }, [cards, field]);
  // The field card's structure button: the active mission's bound
  // structure when there is one, else hemoglobin (the structure
  // room fold's target) as the standing sample.
  const missionStructureId =
    missionCard?.structureId && bundledStructureMeta(missionCard.structureId)
      ? missionCard.structureId
      : null;
  const sampleMeta = bundledStructureMeta(HEMOGLOBIN_STRUCTURE_ID);

  /* ---------------- the microcosm ---------------- */
  const injectRef = useRef(props.injectInteraction);
  injectRef.current = props.injectInteraction;
  const seqRef = useRef(0);
  const prevShardStatusRef = useRef<Map<number, string>>(new Map());
  const spectatingRef = useRef<string | null>(null);
  spectatingRef.current = snap.spectating;

  useEffect(() => {
    const emit = (
      id: string,
      hue: number,
      x: number,
      y: number,
      pressure: number,
      fx = 0,
      fy = 0
    ) => {
      injectRef.current({
        userId: `mote:${id}`,
        position: { x, y },
        force: { x: fx, y: fy },
        pressure,
        color: hueDyeColor(hue, Math.min(1, 0.4 + pressure)),
        hue,
        timestamp: Date.now(),
        seq: ++seqRef.current,
      });
    };

    const tick = { n: 0 };
    const id = setInterval(() => {
      tick.n += 1;
      const f = getGenxSnapshot().field;
      const m = f.mission;
      // Verification blooms: rendered once per recorded
      // transition into "verified" — the field state's event,
      // drawn at the shard's own tile, in its worker's hue.
      if (m) {
        const idsNow = getIdentitySnapshot();
        for (const s of m.shards) {
          const prev = prevShardStatusRef.current.get(s.shardId);
          if (prev !== undefined && prev !== s.status && s.status === "verified") {
            // Structure missions have no tile to bloom at: the
            // molecular view blooms at the verified range's real
            // centroid instead (StructureView). Only tile shards
            // bloom here, at their own tile.
            if (!m.spec.structure) {
              const hue =
                (s.claimedBy ? idsNow.peers[s.claimedBy]?.hue : undefined) ??
                (s.claimedBy === props.userId ? idsNow.self?.hue : undefined) ??
                187;
              const cx = (s.tileX + m.spec.tileW / 2) / m.spec.fieldW;
              const cy = (s.tileY + m.spec.tileH / 2) / m.spec.fieldH;
              for (let i = 0; i < 3; i++) {
                emit(
                  `bloom-${s.shardId}`,
                  hue,
                  cx + (hash01(`b${s.shardId}`, i) - 0.5) * 0.05,
                  cy + (hash01(`c${s.shardId}`, i) - 0.5) * 0.05,
                  0.5
                );
              }
            }
          }
          prevShardStatusRef.current.set(s.shardId, s.status);
        }
      }
      const contribs = contributionsOf(m, null);
      const workOf = new Map(contribs.map((c) => [c.participantId, c.verifiedWork]));
      const maxWork = Math.max(1, ...workOf.values());
      const tgts = targetsOf(m);
      const aliveTargets = tgts.filter((t) => !t.dead);
      const entities: Entity[] = [];
      const ids = getIdentitySnapshot();
      const pushEntity = (eid: string, hue: number, isNode = false) => {
        entities.push({
          id: eid,
          hue,
          verifiedWork: workOf.get(eid) ?? 0,
          isNode,
        });
      };
      if (ids.self) pushEntity(props.userId, ids.self.hue);
      for (const [pid, peer] of Object.entries(ids.peers)) {
        pushEntity(pid, peer.hue);
      }
      const ghost = getGhostPublicState();
      if (ghost.ghostHue !== null && ghost.ghostName) {
        entities.push({
          id: `ghost:${props.userId}`,
          hue: ghost.ghostHue,
          verifiedWork: 0,
          isNode: false,
        });
      }
      if (f.node?.reachable) {
        entities.push({ id: "genx-node", hue: 187, verifiedWork: 0, isNode: true });
      }
      const spectated = spectatingRef.current;
      for (const e of entities) {
        // Verified work is the entity's physique: size + speed
        // + reach all scale with what it has PROVEN.
        const share = e.verifiedWork / maxWork;
        const bx = 0.14 + 0.72 * hash01(e.id, 7);
        const by = 0.16 + 0.68 * hash01(e.id, 13);
        // Its target: the live target nearest its base — the
        // attack vector is drawn toward real unfinished work.
        let tx = bx;
        let ty = by;
        if (aliveTargets.length > 0) {
          let best = aliveTargets[0];
          let bestD = Infinity;
          for (const t of aliveTargets) {
            const d = (t.x - bx) ** 2 + (t.y - by) ** 2;
            if (d < bestD) {
              bestD = d;
              best = t;
            }
          }
          tx = best.x;
          ty = best.y;
        }
        const reach = 0.2 + 0.6 * share;
        const cxp = bx + (tx - bx) * reach;
        const cyp = by + (ty - by) * reach;
        const speed = 0.5 + share;
        const wob = tick.n * 0.7 * speed + hash01(e.id, 29) * 6.28;
        const x = Math.min(0.97, Math.max(0.03, cxp + Math.cos(wob) * 0.02));
        const y = Math.min(0.97, Math.max(0.03, cyp + Math.sin(wob * 1.3) * 0.02));
        emit(e.id, e.hue, x, y, 0.16 + 0.3 * share, Math.cos(wob) * 26, Math.sin(wob) * 26);
        if (spectated === e.id) {
          // The riding view: a soft ring around the ridden
          // entity — this screen's focus, and nothing else's.
          emit(
            `ride-${e.id}`,
            e.hue,
            x + 0.035,
            y,
            0.22
          );
        }
        if (e.isNode) {
          // The machine mote wears a ring: a second, offset,
          // fainter splat at a fixed orbit — labelled in the HUD.
          emit("genx-node-ring", e.hue, x + 0.045, y + 0.03, 0.12);
        }
      }
      // Targets breathe menace while alive: a dark-heart pulse
      // at each live target's centroid, dimming as it verifies.
      for (const t of aliveTargets) {
        emit(
          `target-${t.id}`,
          348,
          t.x,
          t.y,
          0.1 + 0.16 * (1 - t.verifiedFraction)
        );
      }
    }, 650);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.spec.missionId]);

  /* ---------------- render ---------------- */
  const node = field.node;
  const latestAlert = snap.alerts[0] ?? null;
  const spectatedName = snap.spectating
    ? snap.spectating === props.userId
      ? "yourself"
      : (ident.peers[snap.spectating]?.name ?? "a participant")
    : null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 4 }}
    >
      {/* The top cluster (Slice 43): the field status column and
          the bounty board in ONE responsive container. They used
          to be independent absolute panels — the card capped at
          maxWidth 330 from left:12, the board width 348 anchored
          right with a maxWidth "86%" cap — whose rects at a
          390pt phone overlapped by ~300pt: the board is painted
          later, so its translucent surface, filter chips and
          empty text rendered ON TOP of the card's title and
          status lines (Terrell's Nov 2 screenshot: the cut
          "THE FOLD" title, two empty-state texts superimposed).
          Now: on phone widths (< 640) the cluster is a single
          column — field card first, board below it in the
          remaining height; on wide screens they sit side by
          side, as before. All widths are window-derived pixels
          (the drawer family's pattern), never % caps. */}
      {/* Slice 44: the cluster itself mounts through
          ChromeMount — entering the Fold fades/rises the whole
          cluster in instead of snapping it onto the fluid. */}
      <ChromeMount
        visible
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: clusterTop,
          left: 12,
          right: 12,
          bottom: CLUSTER_BOTTOM,
          flexDirection: narrow ? "column" : "row",
          gap: narrow ? 6 : 12,
        }}
      >
        {/* Field status — top of the column, left of the row. */}
        <View
          pointerEvents="box-none"
          style={{
            width: narrow ? undefined : 330,
            alignSelf: narrow ? "stretch" : "flex-start",
            gap: 6,
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(2,8,23,0.82)",
              borderWidth: 1,
              borderColor: "rgba(34,211,238,0.4)",
              borderRadius: radius.card,
              padding: spacing.sm + 2,
              gap: 3,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
              THE FOLD{" "}
              <Text style={{ color: colors.textDim, fontWeight: "400" }}>
                {mission
                  ? mission.status === "complete"
                    ? "· settled"
                    : "· folding"
                  : "· the room's compute field"}
              </Text>
            </Text>
            {mission ? (
              <>
                <View
                  style={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: "rgba(242,247,249,0.14)",
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 5,
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <Text style={{ color: colors.textDim, fontSize: 11 }}>
                  {Math.round(progress * 100)}% verified ·{" "}
                  {mission.shards.filter((s) => s.status === "verified").length}/
                  {mission.shards.length} shards
                  {missionCard
                    ? ` · ETA ${fmtEta(missionCard.etaSeconds)} at ${fmtRate(missionCard.roomPower)}`
                    : ""}
                </Text>
                {contributions.map((c) => (
                  <Text key={c.participantId} style={{ color: colors.textDim, fontSize: 11 }}>
                    <Text style={{ color: hueCss(ident.peers[c.participantId]?.hue ?? (c.participantId === props.userId ? ident.self?.hue ?? 187 : 187)) }}>
                      ●
                    </Text>{" "}
                    {c.participantId === props.userId
                      ? "You"
                      : (ident.peers[c.participantId]?.name ?? "A device")}{" "}
                    · {c.verifiedShards} verified · {Math.round(c.share * 100)}% ·{" "}
                    {fmtJuice(c.juice)}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={{ color: colors.textDim, fontSize: 11 }}>
                {cards.length > 0
                  ? "Pick a bounty below — join with a measured benchmark, and the host's start splits real work across the room."
                  : "The field is idle — no fold is running yet."}
              </Text>
            )}
            <Text style={{ color: colors.textDim, fontSize: 11 }}>
              Your Juice (verified, all rooms): {fmtJuice(snap.juiceLifetime)}
              {snap.spectating ? ` · Riding ${spectatedName} — view only` : ""}
            </Text>
            {latestAlert ? (
              <Text style={{ color: colors.accent, fontSize: 11 }}>{latestAlert.text}</Text>
            ) : null}
          </View>

          {/* The GenX node card — the node's own reports, labelled. */}
          {node || props.nodeUrl ? (
            <View
              style={{
                backgroundColor: "rgba(2,8,23,0.82)",
                borderWidth: 1,
                borderColor: "rgba(242,247,249,0.2)",
                borderRadius: radius.card,
                padding: spacing.sm + 2,
                gap: 2,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
                GENX NODE{" "}
                <Text style={{ color: node?.reachable ? colors.accent : colors.danger, fontWeight: "700" }}>
                  {node ? (node.reachable ? "· REPORTING" : "· NOT ANSWERING") : "· …"}
                </Text>
              </Text>
              {node?.reachable ? (
                <>
                  <Text style={{ color: colors.textDim, fontSize: 11 }}>
                    {node.label} · Folding@home: {node.fahStatus}
                    {node.fahStatus === "ONLINE"
                      ? ` · ${Math.round(node.fahPointsPerDay).toLocaleString()} points/day (node-reported)`
                      : ""}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: 11 }}>
                    Allocator: {node.nodes} node{node.nodes === 1 ? "" : "s"} ·{" "}
                    {node.queuedTasks} queued · {node.activeTasks} active
                    {node.providersInstalled.length > 0
                      ? ` · providers: ${node.providersInstalled.join(", ")}`
                      : ""}
                  </Text>
                  {node.cpuLoadReported !== null ? (
                    <Text style={{ color: colors.textDim, fontSize: 11 }}>
                      CPU load {Math.round(node.cpuLoadReported)}% — node-reported
                      (its collector, not a measurement)
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={{ color: colors.textDim, fontSize: 11 }}>
                  {snap.probe.state === "blocked"
                    ? "A server answers there, but this browser may not read it (CORS/PNA) — see THIS LAYER for the probe verdict."
                    : "The bridge is polling the address in THIS LAYER. The room fold runs either way."}
                </Text>
              )}
            </View>
          ) : null}

          <Pressable
            pointerEvents="auto"
            onPress={() => setBoardOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityLabel="Toggle the bounty board"
            style={{
              alignSelf: "flex-start",
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.accent,
              backgroundColor: colors.accentDim,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
              {boardOpen ? "Hide bounties" : "Bounties"}
            </Text>
          </Pressable>

          {/* Slice 40: open the molecular view — the active mission's
              bound structure, or hemoglobin (the room fold's target,
              RCSB 4HHB) as the standing sample. */}
          {missionStructureId || sampleMeta ? (
            <Pressable
              pointerEvents="auto"
              onPress={() =>
                void (missionStructureId && missionCard
                  ? openStructureById(missionStructureId, missionCard.def.id, missionCard.def.title)
                  : sampleMeta
                    ? openStructureById(
                        HEMOGLOBIN_STRUCTURE_ID,
                        null,
                        `${sampleMeta.name} — sample structure`
                      )
                    : Promise.resolve())
              }
              accessibilityRole="button"
              accessibilityLabel="View the structure in 3D"
              style={{
                alignSelf: "flex-start",
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: "rgba(2,8,23,0.82)",
              }}
            >
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                View structure
              </Text>
            </Pressable>
          ) : null}
          {structureBusy ? (
            <Text style={{ color: colors.textDim, fontSize: 11 }}>
              Loading the structure…
            </Text>
          ) : null}
          {resultBusy ? (
            <Text style={{ color: colors.textDim, fontSize: 11 }}>
              Fetching the node's result…
            </Text>
          ) : null}
          {resultNote ? (
            <Text style={{ color: colors.danger, fontSize: 11 }}>{resultNote}</Text>
          ) : null}
        </View>

        {/* The bounty board — the cluster's remaining space:
            below the field card on phones, beside it on wide
            screens. It scrolls inside its share, never over the
            card. */}
        {/* Slice 44: the board opens/closes through
            ChromeMount (fade + rise) instead of popping in
            and out of the cluster's remaining space. */}
        <ChromeMount
          visible={boardOpen}
          pointerEvents="box-none"
          style={{ flex: 1, minHeight: 0, minWidth: 0 }}
        >
            <ScrollView
              pointerEvents="auto"
              style={{
                flex: 1,
                backgroundColor: "rgba(2,8,23,0.66)",
                borderWidth: 1,
                borderColor: "rgba(242,247,249,0.14)",
                borderRadius: radius.card,
                padding: spacing.sm,
              }}
            >
              <BountyBoard
                cards={cards}
                selfId={props.userId}
                isHost={isHost}
                lendDevice={props.lendDevice}
                hasNodeUrl={props.nodeUrl.trim().length > 0}
                followed={snap.followed}
                spectating={snap.spectating}
                nodeJobBusy={room.nodeJobBusy}
                viewableStructureIds={viewableStructureIds}
                resultJobIds={resultJobIds}
                onJoin={(jobId) => room.joinJob(jobId)}
                onStart={(jobId) => room.startRoomFold(jobId)}
                onRunNodeJob={(jobId) => room.runNodeJob(jobId)}
                onFollow={(jobId, follow) => setGenxFollowed(jobId, follow)}
                onSpectate={(pid) => setGenxSpectating(pid)}
                onViewStructure={(jobId) => {
                  const card = cards.find((c) => c.def.id === jobId);
                  if (card?.structureId) {
                    void openStructureById(card.structureId, jobId, card.def.title);
                  }
                }}
                onViewResult={(jobId) => void openNodeResult(jobId)}
              />
            </ScrollView>
        </ChromeMount>
      </ChromeMount>

      {/* Slice 40: the molecular view, over the field while open.
          Slice 44: it too enters/leaves through ChromeMount
          (full-canvas wrapper; the view's own root fills it),
          rendering the last open viewer through its exit fade. */}
      <ChromeMount
        visible={!!viewer}
        pointerEvents="box-none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {shownViewer ? (
          <StructureView
            structure={shownViewer.structure}
            binding={shownViewer.binding}
            title={shownViewer.title}
            note={shownViewer.note}
            onClose={() => setViewer(null)}
          />
        ) : null}
      </ChromeMount>
    </View>
  );
}
