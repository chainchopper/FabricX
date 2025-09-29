import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, setJSON } from "../utils/storage";

export type Layer = {
  id: string;
  name: string;
  createdAt: number;
};

type LayersContextValue = {
  layers: Layer[];
  addLayer: (layer: { id: string; name: string }) => void;
  removeLayer: (id: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "fabric_layers_v1";
const LayersContext = createContext<LayersContextValue | null>(null);

export function LayersProvider({ children }: { children: React.ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    getJSON<Layer[]>(STORAGE_KEY, []).then(setLayers);
  }, []);

  useEffect(() => {
    setJSON(STORAGE_KEY, layers);
  }, [layers]);

  const addLayer = (layer: { id: string; name: string }) => {
    setLayers((prev) => {
      const exists = prev.some((l) => l.id === layer.id);
      const next = exists
        ? prev.map((l) =>
            l.id === layer.id ? { ...l, name: layer.name, createdAt: Date.now() } : l
          )
        : [{ id: layer.id, name: layer.name, createdAt: Date.now() }, ...prev];
      return next.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    });
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  };

  const clear = () => setLayers([]);

  const value = useMemo(
    () => ({
      layers,
      addLayer,
      removeLayer,
      clear,
    }),
    [layers]
  );

  return <LayersContext.Provider value={value}>{children}</LayersContext.Provider>;
}

export function useLayers() {
  const ctx = useContext(LayersContext);
  if (!ctx) throw new Error("useLayers must be used within LayersProvider");
  return ctx;
}