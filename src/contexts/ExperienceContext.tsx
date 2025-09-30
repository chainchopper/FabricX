import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ExperienceCapabilities, ExperienceConfig, ExperienceLayer, ExperienceType } from "../types/experience";

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
  },
  specific: {},
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
    configDefaults: {
      ...defaultConfig,
      specific: { fluidQuality: "high", turbulence: 0.5, colorScheme: "dynamic" },
    },
  },
  {
    id: "ar-piano",
    name: "AR Piano",
    description: "Augmented reality piano with camera overlay",
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
      },
      specific: {
        handTracking: true,
        pianoLayout: "floating",
        cameraFeed: true,
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
      },
      specific: {
        activeFilter: "glow",
        filterIntensity: 0.7,
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
    if (!state.activeExperience) {
      dispatch({ type: "SET_ACTIVE", payload: builtin[0] });
    }
  }, [state.activeExperience]);

  const switchExperience = async (id: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const next = state.availableExperiences.find((e) => e.id === id);
      if (!next) throw new Error(`Experience '${id}' not found`);
      dispatch({ type: "SET_ACTIVE", payload: next });
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