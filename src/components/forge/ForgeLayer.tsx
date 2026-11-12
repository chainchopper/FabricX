/**
 * ForgeLayer — the Forge fabric's canvas (Slice A).
 *
 * The Forge is a fabric of its own, in the realignment's terms:
 * it declares its own canvas kind ("forge67") and
 * ExperienceRenderer routes that declaration here, the way
 * Slice 64 routed See's "camera" declaration to its surfaces —
 * never by id. The fluid is NOT this fabric's ground and does
 * not mount beneath it; the canvas is a 67js WebGL2 scene —
 * plain data (an agent-scene recipe) the renderer draws — the
 * first Fabric canvas an agent can author as data.
 *
 * Slice A's layer is deliberately the smallest honest version:
 * the starter scene from forgeScene.ts (a floor and five
 * primitives in studio light), a slow camera orbit as the
 * fabric's idle life (its registry entry declares the idle
 * contract: "breathe"), correct resize, dispose on unmount,
 * and a render loop that runs only while this fabric is front
 * (the component exists only then — the renderer's branch
 * mounts it — and it pauses while the tab is hidden, the
 * discipline the camera layers set).
 *
 * Slice B: the ghost's scene tools drive this scene from
 * outside — through the seam, never into the component. On
 * mount the layer publishes a small handle (the live scene,
 * the renderer, and a camera re-sync hook) to forgeSceneStore
 * and clears it on unmount; the forge performer applies its
 * ops through that handle. The layer still owns the engine
 * outright — construction, the frame loop, disposal — and the
 * one courtesy it owes the tools is refreshCamera: a
 * forge-camera act moves the scene's AUTHORED camera, so the
 * breathe orbit re-derives its frame from scene.camera and
 * continues from where the ghost put the view.
 *
 * The engine loads through a WEB-ONLY dynamic import inside
 * the effect, never a static import: module evaluation of
 * this file then touches no 67js code at all, so the layer is
 * safe to sit in the shared renderer tree on native, where
 * Slice A does not run the Forge (it shows the labeled panel
 * below). Metro still follows the dynamic import statically —
 * the bundling proof exercises exactly this graph.
 *
 * WebGL2 is the engine's floor: where it is unavailable (an
 * old WebView, a disabled GPU path) the layer renders a
 * LABELED fallback panel in product language instead of a
 * silent blank canvas — the Trauma rule's shape (a failure
 * says so) applied to a renderer.
 *
 * Slice C (Forge presence): the ghostie is HOSTED here. While
 * the Forge is front, this layer runs the app's one ghost host
 * (useGhostPeer — the same hook, peer lifecycle, deliberation
 * cadence and brain-tier routing the fluid host uses; the
 * renderer's branches are exclusive, so exactly one host is
 * ever mounted) with a fabric context that names the Forge
 * (canvas "forge67"), and wires the sinks that are REAL on
 * this fabric: forge decisions go to the performer through
 * the seam (the same performForgeDecision Slice B wired on
 * the fluid host), and the ghost's generated sounds play
 * through the shared ghost voice (useGhostSfx). The sinks
 * with no Forge surface stay unwired — there is no splat
 * canvas here, so inject/broadcast are documented drops, and
 * draw/note/music/chorale have no consumer on this fabric;
 * the manifest already keeps the brain from choosing them.
 * The scene is also a SENSE: the layer feeds the peer a
 * bounded summary of the live scene (forgeSceneSummary) on
 * the seam's changes and a slow interval, so deliberation on
 * the Forge is about the actual scene — and canvas touches
 * feed the peer as user activity, the fluid host's wake
 * discipline. The peer lives and dies with this layer's
 * mount, exactly like the fluid host's peer lives with
 * LegacyFluid. On native (and on WebGL2 failure) the layer
 * is the labeled panel and the peer stays resting — no
 * presence is claimed for a canvas that isn't open.
 *
 * Slice D (Checkers on the Forge): a playable checkers game
 * is seated on this canvas from the layer's own edge-docked
 * chrome. The referee (checkersGame) owns the game: the board
 * is scene content, human moves arrive as taps picked through
 * the engine's own scene-query (forgePicking — the ray is
 * unprojected through the eye the frame loop actually
 * rendered), and the hosted peer plays the far side through
 * its real decision path — the layer's forge sink forwards
 * every performed decision to the referee, which completes
 * legal moves and refuses illegal ones. While a game is
 * live, the breathe orbit settles onto the authored view
 * (a board being played on does not drift) and resumes,
 * rebased, when the game ends.
 *
 * Slice E (Photo into the scene): the dock also offers the
 * user's own photo, two ways — as a PRINT (the photo as a
 * material map on a standing slab, through the engine's
 * sequence-map route with this layer as the decoding host:
 * the scene is created with forgePhoto's registry as its
 * host sequenceFrames map, and a picked photo is decoded
 * in-page, registered under the SHA-256 of its pixels, and
 * summoned by ops through the performer) and as a MOSAIC
 * (the photo downsampled in-page and rebuilt from colored
 * blocks in one ops batch). Both are ordinary scene content
 * with photo-* ids: the ghost's tools can move them, the
 * scene sense sees them (as shapes — the ghost knows a print
 * stands there, not what the photo shows), and Clear photos
 * removes exactly them. The photo controls hide while a
 * checkers game owns the scene. Web-only, like the Forge
 * itself: the picker is the platform file input, and on the
 * labeled fallback panel no photo is claimed.
 *
 * Slice H (the dock: motion + hierarchy — the visuals audit's
 * finding 4): the dock no longer pops. Its two branches (menu vs
 * game) crossfade through ChromeMount, the house mount pattern
 * (enter motion.base, exit motion.fast, 8px rise), the
 * conditional Clear-photos pill and the photo note fade the same
 * way, and every pill is a ForgeDockPill in the token visual
 * language (forgeDockChrome): one primary (play your ghostie —
 * the accent, semibold, separated by an xs step), the rest
 * secondary, Clear photos in danger. Pressed is the pointer's
 * :active — these are momentary actions, so no pill fakes a
 * toggled state; the active mode is the branch. All dock type
 * is on the token scale and every dock color is a token color.
 * The lime question is NOT settled here: no lime appears in
 * the dock, and the decision stays its own slice.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { Renderer67 } from "67js";
import { buildForgeStarterScene } from "./forgeScene";
import {
  getForgeSceneHandle,
  registerForgeScene,
  subscribeForgeScene,
} from "./forgeSceneStore";
import {
  performForgeDecision,
  performForgeOps,
} from "./forgePerformer";
import { buildForgeSceneSummary } from "./forgeSceneSummary";
import {
  buildForgeClearPhotoOps,
  buildForgeMosaicOps,
  buildForgePrintOps,
  forgePhotoCreations,
  getForgePhotoSequenceFrames,
  registerForgePhotoImage,
  FORGE_PHOTO_SHEET_GEOMETRY_ID,
  FORGE_PHOTO_TEXTURE_MAX_EDGE,
  type ForgePhotoImage,
} from "./forgePhoto";
import {
  CheckersGame,
  type CheckersGameSnapshot,
} from "./checkersGame";
import { CHECKERS_COLORS, ghostHueToHex } from "./checkersScene";
import {
  createForgePicker,
  rayFromCamera,
  type ForgePicker,
} from "./forgePicking";
import { useExperience } from "../../contexts/ExperienceContext";
import { useGhostPeer } from "../../ghost/useGhostPeer";
import { useGhostSfx } from "../../ghost/useGhostSfx";
import { resolveGhostLayerEnabled } from "../../ghost/ghostShared";
import { useGhostSharedSettings } from "../../ghost/ghostSharedPref";
import {
  getSessionFabricState,
  getHostArrivedFabric,
} from "../../session/fabricStore";
import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../../session/sessionStore";
import { ChromeMount } from "../ui/ChromeMount";
import { spacing } from "../../theme/tokens";
import {
  ForgeDockPill,
  ForgeDockStyles,
} from "./forgeDockChrome";

/** Idle life: the camera's slow orbit, radians per second. */
const ORBIT_SPEED = 0.05;

function webgl2Available(): boolean {
  try {
    const probe = document.createElement("canvas");
    return !!probe.getContext("webgl2");
  } catch {
    return false;
  }
}

function ForgeFallback() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1020",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          style={{
            color: "#e8ecf4",
            fontSize: 17,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          The Forge needs WebGL2
        </div>
        <div style={{ color: "#9aa5b8", fontSize: 14, lineHeight: 1.5 }}>
          This fabric is a 3D canvas, and this screen doesn't have WebGL2
          available, so the canvas can't open here. A current Chrome, Edge,
          Firefox or Safari will show it — every other fabric still works as
          it always did.
        </div>
      </div>
    </div>
  );
}

export default function ForgeLayer({
  onReady,
}: {
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);

  // ---- Checkers (Slice D) --------------------------------------
  // A game of checkers can be seated on this canvas: the board
  // is scene content, moves are scene ops, and in vs-ghost mode
  // the hosted peer is the opponent. The referee (CheckersGame)
  // is created on first use and lives in a ref; its snapshots
  // drive the edge-docked game chrome below, and a ref mirror
  // of "a game is live" lets the frame loop settle the breathe
  // orbit onto the authored view — a board being played on
  // does not drift.
  const [gameSnap, setGameSnap] = useState<CheckersGameSnapshot | null>(
    null
  );
  const gameRef = useRef<CheckersGame | null>(null);
  const gameActiveRef = useRef(false);
  const pickerRef = useRef<ForgePicker | null>(null);
  const pickerLoadingRef = useRef(false);
  /** The eye the frame loop last rendered from (picking's truth). */
  const lastEyeRef = useRef<number[] | null>(null);

  // ---- Photo into the scene (Slice E) ---------------------------
  // The dock's photo controls: counts of the photo creations
  // standing in the scene (read from the scene itself, on the
  // sense heartbeat below — the scene is the truth, so a print
  // the ghost banished stops counting), a busy flag while a
  // picked file decodes, and the last flow's outcome in
  // product language.
  const [photoSnap, setPhotoSnap] = useState<{
    prints: number;
    mosaics: number;
    note: string | null;
  }>({ prints: 0, mosaics: 0, note: null });
  const photoBusyRef = useRef(false);

  const refreshPhotoCounts = useCallback(() => {
    const handle = getForgeSceneHandle();
    if (!handle) return;
    try {
      const creations = forgePhotoCreations(handle.scene.exportRecipe());
      setPhotoSnap((prev) =>
        prev.prints === creations.prints.length &&
        prev.mosaics === creations.mosaics.length
          ? prev
          : {
              ...prev,
              prints: creations.prints.length,
              mosaics: creations.mosaics.length,
            }
      );
    } catch {
      // An unreadable scene keeps the last honest counts.
    }
  }, []);

  /**
   * Decode a picked photo file in-page: bitmap decode, draw
   * at the texture cap, read the pixels back as the
   * ImageData-shaped record the engine's texture upload
   * consumes. Nothing leaves the device.
   */
  const decodePickedPhoto = useCallback(
    async (file: File): Promise<ForgePhotoImage> => {
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(
          1,
          FORGE_PHOTO_TEXTURE_MAX_EDGE /
            Math.max(bitmap.width, bitmap.height)
        );
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("this browser gave no 2d canvas");
        ctx.drawImage(bitmap, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        return { width: img.width, height: img.height, data: img.data };
      } finally {
        bitmap.close();
      }
    },
    []
  );

  /** The catalog id of a decoded photo: the SHA-256 of its pixels. */
  const photoAssetId = useCallback(
    async (image: ForgePhotoImage): Promise<string> => {
      const bytes = new Uint8Array(image.data);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },
    []
  );

  /**
   * One photo flow, from picked file to standing scene
   * content. Print: register the decode under its content id,
   * load the engine's assets module for THIS act (the Slice A
   * discipline — on-demand code loads lazily, for the act
   * that needs it), then perform the print ops. Mosaic: pure
   * core ops, no module. Either way the ops travel the
   * performer's revision-checked path, and the outcome is
   * reported in the dock, never silently swallowed.
   */
  const runPhotoFlow = useCallback(
    async (kind: "print" | "mosaic", file: File) => {
      const handle = getForgeSceneHandle();
      if (!handle || photoBusyRef.current) return;
      photoBusyRef.current = true;
      try {
        const image = await decodePickedPhoto(file);
        let outcome;
        if (kind === "print") {
          const assetId = await photoAssetId(image);
          registerForgePhotoImage(assetId, image);
          const build = buildForgePrintOps(handle.scene, {
            assetId,
            width: image.width,
            height: image.height,
          });
          const agentScene = await import("67js/addons/agent-scene");
          const mapped = build.ops.find(
            (op) =>
              typeof op === "object" &&
              op !== null &&
              (op as { type?: string }).type === "add-material" &&
              (op as { material?: { map?: unknown } }).material?.map
          ) as { material: unknown } | undefined;
          const sheet = build.ops.find(
            (op) =>
              typeof op === "object" &&
              op !== null &&
              (op as { type?: string }).type === "add-geometry" &&
              (op as { geometry?: { id?: string } }).geometry?.id ===
                FORGE_PHOTO_SHEET_GEOMETRY_ID
          ) as { geometry: unknown } | undefined;
          if (mapped) {
            await agentScene.loadAgentSceneModules({
              materials: [mapped.material],
              ...(sheet ? { geometries: [sheet.geometry] } : {}),
            });
          }
          // The renderer's part sync refuses textured parts
          // until its replace-textured-parts addon is in: the
          // engine's own error names the import. Loading it
          // here — for the act that first stands a textured
          // part in the scene — extends every later sync too
          // (a ghost move or banish re-hands the print through
          // the same rule).
          await import("67js/addons/replace-textured-parts");
          outcome = performForgeOps(build.ops, handle, "photo print");
        } else {
          const build = buildForgeMosaicOps(handle.scene, { image });
          outcome = performForgeOps(build.ops, handle, "photo mosaic");
        }
        setPhotoSnap((prev) => ({
          ...prev,
          note:
            outcome.kind === "performed"
              ? kind === "print"
                ? "Your photo is standing in the scene."
                : "Your photo, rebuilt in blocks."
              : `That photo didn't land — ${
                  "reason" in outcome ? outcome.reason : outcome.kind
                }`,
        }));
      } catch (err) {
        setPhotoSnap((prev) => ({
          ...prev,
          note: `That photo didn't land — ${
            err instanceof Error ? err.message : String(err)
          }`,
        }));
      } finally {
        photoBusyRef.current = false;
        refreshPhotoCounts();
      }
    },
    [decodePickedPhoto, photoAssetId, refreshPhotoCounts]
  );

  /** The platform file picker, opened from the dock. */
  const pickPhoto = useCallback(
    (kind: "print" | "mosaic") => {
      if (photoBusyRef.current) return;
      if (!getForgeSceneHandle()) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) void runPhotoFlow(kind, file);
      };
      input.click();
    },
    [runPhotoFlow]
  );

  /** Clear photos: remove exactly the photo creations, one batch. */
  const clearPhotos = useCallback(() => {
    const handle = getForgeSceneHandle();
    if (!handle || photoBusyRef.current) return;
    const ops = buildForgeClearPhotoOps(handle.scene);
    if (!ops) return;
    const outcome = performForgeOps(ops, handle, "clear photos");
    setPhotoSnap((prev) => ({
      ...prev,
      note:
        outcome.kind === "performed"
          ? "Photos cleared."
          : `Clearing didn't land — ${
              "reason" in outcome ? outcome.reason : outcome.kind
            }`,
    }));
    refreshPhotoCounts();
  }, [refreshPhotoCounts]);

  // ---- Ghost host (Slice C — Forge presence) ------------------
  // The same host the fluid runs (useGhostPeer), mounted with
  // this layer: the peer is created when the Forge becomes the
  // loaded fabric and destroyed when it stops being front —
  // the fluid host's instantiation discipline, one host ever
  // live (the renderer's canvas branches are exclusive).
  const { state } = useExperience();
  const sessionRef = useRef<SessionPublicState>(getSessionPublicState());
  useEffect(() => {
    return subscribeSessionState((s) => {
      sessionRef.current = s;
    });
  }, []);
  // This client's id for the ghost's session bookkeeping,
  // minted per mount in useFluidMultiUser's shape — the Forge
  // mounts no transport, so nothing here is a wire identity.
  const ownerIdRef = useRef<string | null>(null);
  if (ownerIdRef.current === null) {
    ownerIdRef.current = `user-${Math.random().toString(36).slice(2, 10)}`;
  }
  const ghostShared = useGhostSharedSettings();
  const ghostLayerEnabled =
    Platform.OS === "web" &&
    !failed &&
    resolveGhostLayerEnabled({
      storedEnabled:
        ((state.experienceConfig?.specific as
          | Record<string, unknown>
          | undefined)?.ghostEnabled as boolean | undefined) !== false,
      followHostFabric: ghostShared.followHostFabric,
      arrivedViaHost:
        state.activeExperience?.id != null &&
        getHostArrivedFabric() === state.activeExperience.id,
    });
  const ghostSfx = useGhostSfx();
  const sfxRef = useRef(ghostSfx);
  sfxRef.current = ghostSfx;
  const ghostSelfHueRef = useRef(210);
  const getForgeFabricContext = useCallback(() => {
    const s = sessionRef.current;
    const rules =
      s.role === "guest"
        ? getSessionFabricState().rules
        : { draw: true, verbs: true, notes: true };
    return {
      layer_id: state.activeExperience?.id ?? "forge",
      canvas: "forge67" as const,
      role: s.role,
      in_session: s.role !== "open",
      rules,
    };
  }, [state.activeExperience?.id]);
  const ghost = useGhostPeer({
    ownerId: ownerIdRef.current,
    // The Forge has no splat surface: the ghost's body on this
    // fabric is the scene itself, shaped through the forge
    // tools. inject drops honestly (nothing renders a splat
    // here) and broadcast is a no-op (no session transport is
    // mounted while the Forge is front — scene ops do not ride
    // the relay in this slice; see the PR body's out-of-scope).
    inject: () => {},
    broadcast: () => {},
    // No peer transport is mounted on the Forge: the honest
    // count of remote humans this client can see here is zero.
    humanPeers: 0,
    layerEnabled: ghostLayerEnabled,
    getFabricContext: getForgeFabricContext,
    onForgeDecision: (decision) => {
      // Slice B's sink, hosted where it can finally fire: a
      // validated forge decision, performed against the live
      // scene through the seam (the performer reads the
      // handle this layer published, at the moment of use).
      // Slice D: while a checkers game is live, the referee
      // also hears every performed decision — a forge-move on
      // its turn is its move to complete, and anything else
      // that changed the board is the census's business.
      const outcome = performForgeDecision(decision);
      gameRef.current?.noteGhostDecision(decision, outcome);
    },
    onSfx: (kind, sfxCtx) => {
      // The ghost's generated sounds are real on every fabric
      // (the shared ghost voice, pitched from its hue) — the
      // fluid host's exact wiring.
      sfxRef.current.play(kind, ghostSelfHueRef.current, {
        articulation: sfxCtx,
      });
    },
    // Unwired, deliberately: onDrawRecipe / onNote /
    // onMusicPhrase / onChoraleFrame have no surface or
    // consumer on this fabric, and the manifest keeps the
    // brain from choosing those tools here.
  });
  useEffect(() => {
    if (ghost.identity) ghostSelfHueRef.current = ghost.identity.hue;
  }, [ghost.identity]);
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;

  // The scene as a sense: feed the peer the live scene's
  // summary — once on mount, whenever the seam's handle
  // changes, and on a slow interval while front (the scene
  // changes under the ghost's own acts; the peer's signature
  // gate, not this cadence, decides what re-arms deliberation,
  // so an unchanged scene never spams it).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const feed = () => {
      const handle = getForgeSceneHandle();
      if (!handle) return;
      const summary = buildForgeSceneSummary(handle.scene);
      if (summary) ghostRef.current.noteForgeScene(summary);
      // Slice D: while a checkers game runs, the same heartbeat
      // re-feeds the game sense. The sense carries a freshness
      // window (the peer deliberates at its own pace, and a slow
      // device must not let the ghost's turn go stale before its
      // first deliberation reaches it) — the game's signature
      // gate still decides what re-arms deliberation, so an
      // unchanged position never spams it.
      gameRef.current?.feedNow();
      // Slice E: the photo counts ride the same heartbeat —
      // the scene is their only truth.
      refreshPhotoCounts();
    };
    feed();
    const unsub = subscribeForgeScene(feed);
    const id = setInterval(feed, 3000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  // Canvas touches are the human's presence on this fabric:
  // they wake the peer and hold its activity clock, the fluid
  // host's discipline (throttled — a drag is one presence,
  // not a hundred).
  const lastActivityRef = useRef(0);
  const noteCanvasActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current < 1000) return;
    lastActivityRef.current = now;
    ghostRef.current.noteUserActivity();
  }, []);

  // The checkers referee, created on first use. Its deps read
  // through refs (the seam's live handle, the ghost hook's
  // sense feed, the shared voice), so the one instance serves
  // the layer's whole life.
  const ensureGame = useCallback((): CheckersGame => {
    if (!gameRef.current) {
      gameRef.current = new CheckersGame({
        getHandle: () => getForgeSceneHandle(),
        onSnapshot: (snap) => {
          gameActiveRef.current = snap.active;
          setGameSnap(snap);
        },
        onEvent: (event) => {
          // The game's record, on the console the layer already
          // uses for its own failures — moves, captures, and
          // (loudly) any divergence the referee reports.
          // eslint-disable-next-line no-console
          console.info("[Forge checkers]", event.type, event);
        },
        playSfx: (kind, hue) => {
          // The markers' feelings sound through the shared
          // ghost voice, pitched from the reacting seat's hue.
          sfxRef.current.play(kind, hue, {
            articulation: { intensity: 0.6 },
          });
        },
        feedGameSense: (ctx) => {
          ghostRef.current.noteForgeGame(ctx);
        },
        markerHexesFor: (mode) => {
          // Each seat's marker wears its ghostie's hue. On this
          // device the hosted peer IS the local player's
          // ghostie: in vs-ghost mode it seats both ends — your
          // companion cheering at your end, your sparring
          // partner across the board — so both markers wear
          // its hue. Pass-and-play's far seat has no ghostie on
          // this device, so its marker wears the side color.
          const hex = ghostHueToHex(ghostSelfHueRef.current);
          return {
            near: hex,
            far: mode === "vs-ghost" ? hex : CHECKERS_COLORS.teal,
          };
        },
        sfxHuesFor: (mode) => ({
          coral: ghostSelfHueRef.current,
          teal:
            mode === "vs-ghost" ? ghostSelfHueRef.current : 186,
        }),
      });
    }
    return gameRef.current;
  }, []);

  // Picking warms up at game start: the engine's scene-query
  // addon loads lazily, long after the scene exists (the
  // Slice A load-order discipline), and the picker is useless
  // before there is a board to pick from.
  const ensurePicker = useCallback(async (): Promise<void> => {
    if (pickerRef.current || pickerLoadingRef.current) return;
    pickerLoadingRef.current = true;
    try {
      const mod = await import("67js/addons/scene-query");
      pickerRef.current = createForgePicker(mod);
    } catch {
      // Picking unavailable on this load: taps fall silent
      // rather than pretending (the game still runs — the
      // ghost's turns and the chrome are unaffected).
    }
    pickerLoadingRef.current = false;
  }, []);

  // A tap on the canvas while a game is live: unproject the
  // tap through the view the frame loop actually rendered
  // (its last eye), raycast the scene's parts with the
  // engine's query, and hand the referee the node id (or null
  // — a tap that hit nothing still means "deselect").
  const handleCanvasTap = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const game = gameRef.current;
      const handle = getForgeSceneHandle();
      if (!game || !handle || !game.isActive) return;
      const picker = pickerRef.current;
      if (!picker) {
        void ensurePicker();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      const eye = lastEyeRef.current ?? handle.scene.camera.eye;
      const ray = rayFromCamera(
        eye,
        handle.scene.camera.target,
        handle.scene.camera.fov ?? 42,
        rect.width / rect.height,
        ndcX,
        ndcY
      );
      const id = picker.pick(
        handle.scene.parts,
        ray.origin,
        ray.direction,
        handle.scene.revision
      );
      game.tapNode(id);
    },
    [ensurePicker]
  );

  const startGame = useCallback(
    (mode: "vs-ghost" | "pass-and-play") => {
      void ensurePicker();
      ensureGame().start(mode);
    },
    [ensureGame, ensurePicker]
  );

  // The referee and picker die with the layer.
  useEffect(() => {
    return () => {
      gameRef.current?.dispose();
      pickerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!webgl2Available()) {
      setFailed(true);
      return;
    }

    let renderer: Renderer67 | null = null;
    let raf = 0;
    let disposed = false;
    let fit: (() => void) | null = null;

    (async () => {
      try {
        const [{ Renderer67 }, agentScene] = await Promise.all([
          import("67js"),
          import("67js/addons/agent-scene"),
        ]);
        if (disposed) return;

        // Slice E: the scene is created with the photo
        // registry as its host context (sequenceFrames) — the
        // starter names no catalog image, so the map rides
        // along empty until a print registers one.
        const scene = buildForgeStarterScene(agentScene.createAgentScene, {
          sequenceFrames: getForgePhotoSequenceFrames(),
        });
        renderer = new Renderer67(canvas, scene.parts, {
          ground: false,
          hdr: true,
          depth: true,
          samples: 4,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          world: scene.environment.world,
          environment: scene.environment,
          shadowBounds: agentScene.resolveAgentShadow(
            scene.shadow,
            scene.environment.lightDirection
          ),
        });

        fit = () => {
          if (!renderer || disposed) return;
          const w = canvas.clientWidth || window.innerWidth;
          const h = canvas.clientHeight || window.innerHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.max(1, Math.round(w * dpr));
          canvas.height = Math.max(1, Math.round(h * dpr));
          renderer.resize();
        };
        fit();
        window.addEventListener("resize", fit);

        // The breathe orbit: the authored eye's spherical position
        // around the target, advanced slowly. Radius and height
        // are the scene author's; only the angle moves. The frame
        // lives in a mutable object (Slice B) because a
        // forge-camera act can move the authored camera mid-life:
        // refreshCamera re-derives the frame from scene.camera,
        // phase-matched so the orbit continues from the new eye
        // without a jump.
        const eye0 = scene.camera.eye;
        const orbit = {
          target: [...scene.camera.target],
          radius: Math.hypot(
            eye0[0] - scene.camera.target[0],
            eye0[2] - scene.camera.target[2]
          ),
          baseAngle: Math.atan2(
            eye0[2] - scene.camera.target[2],
            eye0[0] - scene.camera.target[0]
          ),
          eyeY: eye0[1],
          started: performance.now(),
        };
        const refreshCamera = () => {
          const eye = scene.camera.eye;
          const target = scene.camera.target;
          const dx = eye[0] - target[0];
          const dz = eye[2] - target[2];
          const tNow = (performance.now() - orbit.started) / 1000;
          orbit.target = [...target];
          orbit.radius = Math.hypot(dx, dz);
          orbit.eyeY = eye[1];
          orbit.baseAngle = Math.atan2(dz, dx) - tNow * ORBIT_SPEED;
        };

        // The scene seam (Slice B): publish the live handle for
        // the ghost's scene tools; the cleanup clears it before
        // the renderer is disposed, so no act can ever land on a
        // tearing-down scene.
        registerForgeScene({ scene, renderer, refreshCamera });

        // Slice D: while a checkers game is live, the orbit
        // SETTLES onto the authored view and holds — a board
        // being played on does not drift under the players'
        // fingers (and picking reads the eye that was actually
        // rendered, kept in lastEyeRef). Leaving the game
        // rebases the orbit from the settled angle, so the
        // breathe resumes without a snap.
        let displayAngle: number | null = null;
        let wasGameActive = false;
        let lastFrameAt = performance.now();
        const frame = () => {
          if (disposed || !renderer) return;
          raf = requestAnimationFrame(frame);
          if (document.hidden) return;
          const nowMs = performance.now();
          const dt = Math.min(0.1, (nowMs - lastFrameAt) / 1000);
          lastFrameAt = nowMs;
          const t = (nowMs - orbit.started) / 1000;
          if (displayAngle === null) {
            displayAngle = orbit.baseAngle + t * ORBIT_SPEED;
          }
          if (gameActiveRef.current) {
            let desired = orbit.baseAngle;
            while (desired - displayAngle > Math.PI) desired -= 2 * Math.PI;
            while (displayAngle - desired > Math.PI) desired += 2 * Math.PI;
            displayAngle +=
              (desired - displayAngle) * Math.min(1, dt * 3);
            if (Math.abs(desired - displayAngle) < 0.0005) {
              displayAngle = desired;
            }
          } else {
            if (wasGameActive) {
              orbit.baseAngle = displayAngle - t * ORBIT_SPEED;
            }
            displayAngle = orbit.baseAngle + t * ORBIT_SPEED;
          }
          wasGameActive = gameActiveRef.current;
          const a = displayAngle;
          const eye: [number, number, number] = [
            orbit.target[0] + orbit.radius * Math.cos(a),
            orbit.eyeY,
            orbit.target[2] + orbit.radius * Math.sin(a),
          ];
          lastEyeRef.current = eye;
          renderer.render({
            ...scene.camera,
            eye,
            environment: scene.environment,
            effects: scene.effects,
            exposure: scene.effects.exposure,
            time: t,
          });
          if (!readyRef.current) {
            readyRef.current = true;
            onReady?.();
          }
        };
        raf = requestAnimationFrame(frame);
      } catch (err) {
        // Engine load, construction or first-frame failure (a
        // WebGL2 context the probe passed but the engine cannot
        // use, an OOM on a small device): the labeled fallback,
        // never a blank.
        // eslint-disable-next-line no-console
        console.error("[ForgeLayer] 67js renderer failed to start:", err);
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      // The seam clears FIRST: from here the scene is being torn
      // down, and the ghost's tools must find no handle.
      registerForgeScene(null);
      cancelAnimationFrame(raf);
      if (fit) window.removeEventListener("resize", fit);
      renderer?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (Platform.OS !== "web" || failed) return <ForgeFallback />;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: "#0b1020",
      }}
      onPointerDown={noteCanvasActivity}
      onPointerMove={noteCanvasActivity}
      onWheel={noteCanvasActivity}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasTap}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
      />
      {/* Slice D: the game's own chrome — edge-docked at the
          bottom-left, belonging to this fabric alone: start
          controls when no game is seated, the turn banner and
          End while one is live. The canvas center stays clear,
          per the chrome doctrine.
          Slice H: the dock's motion + hierarchy. The two
          branches are both mounted and crossfade through
          ChromeMount (the house mount pattern) instead of
          swapping instantly — each branch is absolutely
          anchored to the same corner, so the fade overlaps
          instead of pushing the layout. The conditional
          Clear-photos pill and the photo note fade the same
          way. Every pill is a ForgeDockPill (forgeDockChrome):
          one primary (play your ghostie), the rest secondary,
          Clear photos in danger. */}
      <div
        style={{
          position: "absolute",
          left: spacing.lg,
          bottom: spacing.lg,
          zIndex: 2,
        }}
      >
        <ChromeMount
          visible={gameSnap?.active === true}
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "max-content",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <div className="forge-dock-banner">{gameSnap?.banner ?? ""}</div>
          <ForgeDockPill
            variant="secondary"
            onClick={() => gameRef.current?.end()}
          >
            End game
          </ForgeDockPill>
        </ChromeMount>
        <ChromeMount
          visible={gameSnap?.active !== true}
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "max-content",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <ForgeDockPill
            variant="primary"
            onClick={() => startGame("vs-ghost")}
            style={{ marginBottom: spacing.xs }}
          >
            Checkers — play your ghostie
          </ForgeDockPill>
          <ForgeDockPill
            variant="secondary"
            onClick={() => startGame("pass-and-play")}
          >
            Checkers — two players, one screen
          </ForgeDockPill>
          {/* Slice E: the photo controls — same dock, this
              fabric's own chrome. They live only in the
              no-game branch: while a game is seated it owns
              the scene, and no photo lands on its board. */}
          <ForgeDockPill
            variant="secondary"
            onClick={() => pickPhoto("print")}
          >
            Add a photo — as a print
          </ForgeDockPill>
          <ForgeDockPill
            variant="secondary"
            onClick={() => pickPhoto("mosaic")}
          >
            Add a photo — as blocks
          </ForgeDockPill>
          <ChromeMount
            visible={photoSnap.prints + photoSnap.mosaics > 0}
          >
            <ForgeDockPill variant="danger" onClick={clearPhotos}>
              Clear photos ({photoSnap.prints + photoSnap.mosaics})
            </ForgeDockPill>
          </ChromeMount>
          <ChromeMount visible={Boolean(photoSnap.note)}>
            <div className="forge-dock-note">{photoSnap.note}</div>
          </ChromeMount>
        </ChromeMount>
        <ForgeDockStyles />
      </div>
    </div>
  );
}
