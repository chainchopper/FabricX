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
      const savedExp = saved?.id ? state.availableExperiences.find((e) => e.id === saved.id) : null;
      let next = savedExp ?? fallback;

      let roomParam: string | null = null;
      let expParam: string | null = null;
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#\?/, ""));
        roomParam = params.get("room");
        expParam = params.get("exp");
      }

      if (expParam) {
        const byParam = state.availableExperiences.find((e) => e.id === expParam);
        if (byParam) next = byParam;
      }

      if (!mounted) return;
      dispatch({ type: "SET_ACTIVE", payload: next });

      if (saved?.config) {
        dispatch({ type: "UPDATE_CONFIG", payload: saved.config });
      }

      if (roomParam && roomParam.trim().length >= 2) {
        dispatch({
          type: "UPDATE_CONFIG",
          payload: { specific: { ...(saved?.config?.specific ?? {}), roomId: roomParam.trim().slice(0, 40) } },
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