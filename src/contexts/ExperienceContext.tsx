import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ExperienceCapabilities, ExperienceConfig, ExperienceLayer, ExperienceType } from "../types/experience";
import { getJSON, setJSON } from "../../app/utils/storage";

type ExperienceState = {
  availableExperiences: ExperienceLayer[];
  activeExperience: ExperienceLayer | null;
  experienceConfig: ExperienceConfig;
  isLoading: boolean;
  error: string | null;
};

type ExperienceAction =
  | { type: "SET_ACTIVE"; payload: ExperienceLayer }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "UPDATE_CONFIG"; payload: Partial<ExperienceConfig> }
  | { type: "ADD_EXPERIENCE"; payload: ExperienceLayer };

const defaultCapabilities: ExperienceCapabilities = {
  ar: false,
  camera: false,
  midi: true,
  multiUser: true,
  haptics: true,
  audio: true,
  customInputs: [],
};

const defaultConfig: ExperienceConfig = {
  common: {
    backgroundColor: "#000000",
    particleDensity: 0.6,
    audioVolume: 0.7,
    hapticIntensity: 0.8,
    renderMode: "default", // default = WebGPU (recommended)
  } as any,
  specific: { roomId: "main" },
};

const builtin: ExperienceLayer[] = [
  {
    id: "default-fluid",
    name: "Fluid Fabric",
    blurb: "The living liquid canvas — draw together, feel every touch.",
    description: "The default liquid fabric experience",
    type: "default-fluid" as ExperienceType,
    version: "1.0.0",
    author: "Fanalogy",
    capabilities: { ...defaultCapabilities, ar: false, camera: false },
    // Idle contract: the base fluid is ALIVE at idle — it breathes,
    // drifts, and blooms a little when the room goes quiet, and
    // yields instantly to anything real (Slice 7, useAmbientLife).
    idleBehavior: "ambient",
    configDefaults: {
      common: {
        backgroundColor: "#0b1020",
        particleDensity: 0.6,
        audioVolume: 0.7,
        hapticIntensity: 0.8,
        renderMode: "default", // Default (recommended): WebGPU
      } as any,
      specific: {
        fluidQuality: "high",
        turbulence: 0.5,
        colorScheme: "dynamic",
        roomId: "main",
        ambienceEnabled: false,
        ambienceFile: "ambience.mp3",
      },
    },
  },
  {
    id: "ar-piano",
    name: "AR Piano",
    blurb: "A piano layered on the fluid — notes the whole room hears and feels.",
    description: "Augmented reality piano with camera overlay and MIDI support",
    type: "ar-piano" as ExperienceType,
    version: "1.0.0",
    author: "Fanalogy",
    capabilities: { ...defaultCapabilities, ar: true, camera: true, midi: true },
    configDefaults: {
      common: {
        backgroundColor: "transparent",
        particleDensity: 0.8,
        audioVolume: 0.9,
        hapticIntensity: 0.7,
        renderMode: "compat", // camera path stays on WebGL pipeline for now
      } as any,
      specific: {
        handTracking: false,
        pianoLayout: "floating",
        cameraFeed: true,
        midiEnabled: true,
        midiIntensity: 1,
        roomId: "arpiano",
        enableARCamera: true,
        enableMIDIInput: true,
      },
    },
  },
  {
    id: "sam-see",
    name: "See",
    blurb: "Point the camera and name a thing — SAM makes it touchable.",
    description:
      "SAM 3.1 camera layer — name what the camera sees, get touchable regions on the fabric",
    type: "sam-see" as ExperienceType,
    version: "1.0.0",
    author: "Fanalogy",
    capabilities: { ...defaultCapabilities, ar: false, camera: true, midi: false, audio: false },
    // Idle contract: STILL, by decision. The camera pauses when the
    // layer isn't front or the tab hides, and nothing self-plays —
    // a seeing layer at rest should be a resting eye, not a show.
    idleBehavior: "still",
    configDefaults: {
      common: {
        backgroundColor: "transparent",
        particleDensity: 0.5,
        audioVolume: 0.7,
        hapticIntensity: 0.8,
        renderMode: "compat", // camera path stays on WebGL pipeline
      } as any,
      specific: {
        // The main room on purpose: a region fired from this layer
        // is a touch ON the shared fabric, so peers on the default
        // layer in the same room see and feel it land.
        roomId: "main",
        samEnabled: true,
      },
    },
  },
  {
    // Dancer Stage (realignment, Oct 28): the Frequency Dancer is
    // its own fabric — a full 3D stage canvas (canvas: "stage3d"),
    // NOT an overlay on the fluid. Its own room ("stage"), its own
    // rules: the rig dances to the note bus (local key strip +
    // remote room notes), verbs are choreographed, and the figure
    // is swappable for a UE5-boned glTF (docs/DANCER.md). Idle
    // contract: "breathe" — the figure sways, the camera drifts,
    // motes float; the stage is alive when alone.
    id: "dancer-stage",
    name: "Dancer Stage",
    blurb: "A lit 3D stage where a dancer moves to every note in the room.",
    description:
      "A lit 3D stage where a rigged dancer moves to every note in the room — play the key strip, send verbs, or load your own UE5 character.",
    type: "dancer-stage" as ExperienceType,
    version: "1.0.0",
    author: "Fanalogy",
    capabilities: { ...defaultCapabilities, ar: false, camera: false, midi: true },
    canvas: "stage3d",
    idleBehavior: "breathe",
    configDefaults: {
      common: {
        backgroundColor: "#070a12",
        particleDensity: 0.6,
        audioVolume: 0.8,
        hapticIntensity: 0.7,
        renderMode: "default",
      } as any,
      specific: {
        roomId: "stage",
        stageDancerEnabled: true,
        stageCameraDrift: true,
        stageTheme: "cyan",
      },
    },
  },
  {
    id: "camera-effects",
    name: "Camera Effects",
    blurb: "Real-time camera filters, worn over the fabric.",
    description: "Real-time camera effects and filters",
    type: "camera-effects" as ExperienceType,
    version: "1.0.0",
    author: "Fanalogy",
    capabilities: { ...defaultCapabilities, ar: true, camera: true, midi: false, audio: false, haptics: false },
    configDefaults: {
      common: {
        backgroundColor: "transparent",
        particleDensity: 0.3,
        audioVolume: 0,
        hapticIntensity: 0,
        renderMode: "compat",
      } as any,
      specific: {
        activeFilter: "glow",
        filterIntensity: 0.7,
        roomId: "camfx",
      },
    },
  },
  {
    // The Fold (Slice 36): Fabric's distributed-compute fabric,
    // built on GenX components. The fluid is its ground (the
    // sam-see precedent — its own experience, its own rules); a
    // bounty board posts jobs, the host allocates, opted-in
    // devices genuinely compute checksummed shards of the room's
    // LifePacket field, the allocator verifies by recompute, and
    // a bridged GenX node-controller reports into the same field.
    // Its own room ("genx"): a fold is a room of its own. Idle
    // contract: "breathe" — the field's entities drift and the
    // fold coheres slowly in the quiet; nothing self-starts work
    // a device did not opt into.
    id: "genx-fold",
    name: "The Fold",
    blurb: "One job, every screen in the room — folded together.",
    description:
      "Distributed compute across the room's devices using GenX components: bounty jobs sharded, computed, verified and settled as Juice on one shared field, with a real GenX node reporting in.",
    type: "genx-fold" as ExperienceType,
    version: "1.0.0",
    author: "Fanalogy",
    capabilities: { ...defaultCapabilities, ar: false, camera: false, midi: false },
    idleBehavior: "breathe",
    configDefaults: {
      common: {
        backgroundColor: "#0b1020",
        particleDensity: 0.6,
        audioVolume: 0.7,
        hapticIntensity: 0.8,
        renderMode: "default",
      } as any,
      specific: {
        roomId: "genx",
        // THIS LAYER: lending is opt-in, default OFF — a device
        // computes only when its owner turned lending on
        // (Slice 12's law), and the GenX node bridge polls only
        // an address the owner typed here.
        lendDevice: false,
        genxNodeUrl: "",
      },
    },
  },
  {
    // The Ghostie Playground (Slice 53): the ghostie's OWN
    // fabric — a room of its own ("playground") where its person
    // can exercise it directly. The fluid is its ground (the
    // sam-see / Fold precedent: its own experience, its own
    // rules), and its layer brings the ghost's whole tool table
    // out as real controls: every ask runs the same brain, gates
    // and budgets as a spoken one. Its manifest is the full
    // registry (GhostBrain's GHOST_FABRIC_TOOL_MANIFEST) — the
    // one fabric where everything the ghost has is on, including
    // the note tools: the layer mounts the note pipeline and its
    // own key strip, so notes here are real notes. Idle
    // contract: "ambient" — the ghost lives here; it idles,
    // thinks and plays in the quiet, and yields to anything real.
    id: "ghostie-playground",
    name: "Ghostie Playground",
    blurb: "Your ghostie's own room — every tool it has, out on the table.",
    description:
      "The ghostie's own fabric: a solo room where you can summon each of its tools, talk to it, pet it, play notes with it, and watch it idle and think.",
    type: "ghostie-playground" as ExperienceType,
    version: "1.0.0",
    author: "Fanalogy",
    capabilities: { ...defaultCapabilities, ar: false, camera: false, midi: true },
    idleBehavior: "ambient",
    configDefaults: {
      common: {
        backgroundColor: "#0b1020",
        particleDensity: 0.6,
        audioVolume: 0.7,
        hapticIntensity: 0.8,
        renderMode: "default", // Default (recommended): WebGPU
      } as any,
      specific: {
        roomId: "playground",
      },
    },
  },
];

function reducer(state: ExperienceState, action: ExperienceAction): ExperienceState {
  switch (action.type) {
    case "SET_ACTIVE":
      return {
        ...state,
        activeExperience: action.payload,
        experienceConfig: action.payload.configDefaults,
        error: null,
      };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "UPDATE_CONFIG":
      return {
        ...state,
        experienceConfig: {
          ...state.experienceConfig,
          ...action.payload,
          common: {
            ...(state.experienceConfig.common as any),
            ...(action.payload.common as any),
          },
          specific: {
            ...state.experienceConfig.specific,
            ...(action.payload.specific ?? {}),
          },
        },
      };
    case "ADD_EXPERIENCE":
      return { ...state, availableExperiences: [...state.availableExperiences, action.payload] };
    default:
      return state;
  }
}

const STORAGE_KEY = "fabric_experience_state_v1";

const ExperienceContext = createContext<{
  state: ExperienceState;
  switchExperience: (id: string) => Promise<void>;
  updateConfig: (cfg: Partial<ExperienceConfig>) => void;
} | null>(null);

export function ExperienceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    availableExperiences: builtin,
    activeExperience: null,
    experienceConfig: defaultConfig,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await getJSON<{ id?: string; config?: ExperienceConfig } | null>(STORAGE_KEY, null);
      const fallback = builtin[0];

      let roomParam: string | null = null;
      let expParam: string | null = null;
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#\?/, ""));
        roomParam = params.get("room");
        expParam = params.get("exp");
      }

      // Slice 38 (Terrell, Nov 2): "The initial fabric and
      // default is the fluid." The landing is the default fluid
      // unless THIS load explicitly deep-links a fabric via
      // ?exp=. The persisted record (fabric_experience_state_v1)
      // no longer chooses the landing: before this change, a
      // saved experience id restored that fabric on every fresh
      // load — a previous session's Dancer Stage visit reopened
      // as the stage (with a character standing on it) instead
      // of the fluid, uninvited. The saved fabric stays what it
      // always also was: a card in the gallery, one tap away,
      // chosen — never an ambush.
      const byParam = expParam
        ? state.availableExperiences.find((e) => e.id === expParam) ?? null
        : null;
      const next = byParam ?? fallback;

      // The saved config rides along ONLY when this load lands
      // on the very experience it belongs to (an explicit ?exp=
      // deep link to it). A bare load onto the fluid must not
      // inherit a foreign layer's settings — each layer's own
      // settings restore through LayerSettingsMirror when the
      // user actually activates that layer.
      const restoredConfig =
        byParam && saved?.id && byParam.id === saved.id
          ? (saved.config ?? null)
          : null;

      if (!mounted) return;
      dispatch({ type: "SET_ACTIVE", payload: next });

      if (restoredConfig) {
        dispatch({ type: "UPDATE_CONFIG", payload: restoredConfig });
      }

      if (roomParam && roomParam.trim().length >= 2) {
        dispatch({
          type: "UPDATE_CONFIG",
          payload: { specific: { ...(restoredConfig?.specific ?? {}), roomId: roomParam.trim().slice(0, 40) } },
        });
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.activeExperience) return;
    void setJSON(STORAGE_KEY, { id: state.activeExperience.id, config: state.experienceConfig });
  }, [state.activeExperience?.id, state.experienceConfig]);

  const switchExperience = async (id: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const next = state.availableExperiences.find((e) => e.id === id);
      if (!next) throw new Error(`Experience '${id}' not found`);
      dispatch({ type: "SET_ACTIVE", payload: next });

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("exp", id);
        const roomCurrent = (state.experienceConfig?.specific as any)?.roomId;
        if (roomCurrent && typeof roomCurrent === "string") {
          url.searchParams.set("room", roomCurrent);
        }
        window.history.replaceState({}, "", url.toString());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      dispatch({ type: "SET_ERROR", payload: msg });
      // eslint-disable-next-line no-console
      console.warn("Failed to switch experience:", e);
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const updateConfig = (cfg: Partial<ExperienceConfig>) => {
    dispatch({ type: "UPDATE_CONFIG", payload: cfg });
  };

  const value = useMemo(
    () => ({ state, switchExperience, updateConfig }),
    [state]
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const ctx = useContext(ExperienceContext);
  if (!ctx) throw new Error("useExperience must be used within ExperienceProvider");
  return ctx;
}