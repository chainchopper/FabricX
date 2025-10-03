import { Asset } from "expo-asset";

export type AudioTrack = { name: string; uri: string };

const modules = [
  { name: "ambience", mod: require("../../../app/assets/audio/ambience.mp3") },
  { name: "A4", mod: require("../../../app/assets/audio/A4.mp3") },
  { name: "C5", mod: require("../../../app/assets/audio/C5.mp3") },
] as const;

/**
 * Resolves bundled audio files to URIs that <audio> can play on web.
 * On native, this helps pre-cache too.
 */
export async function loadTracks(): Promise<AudioTrack[]> {
  const results: AudioTrack[] = [];
  for (const m of modules) {
    const asset = Asset.fromModule(m.mod);
    if (!asset.downloaded) {
      try {
        await asset.downloadAsync();
      } catch {
        // ignore; Expo will still provide a local URI for web
      }
    }
    results.push({ name: m.name, uri: asset.uri ?? "" });
  }
  return results;
}

/**
 * Convenience: resolve a single track by name; returns undefined if not found.
 */
export async function resolveTrack(name: string): Promise<AudioTrack | undefined> {
  const tracks = await loadTracks();
  return tracks.find((t) => t.name === name);
}