import { Platform } from "react-native";

/**
 * Build an invite link for a room. Slice 5: the link also carries
 * the session `mode` the host chose — display-only for the landing
 * guest (it names what they were invited into while the host's first
 * announcement is in flight). The room's live mode is always the
 * host's announced session state, never the URL.
 */
export function buildInviteUrl(roomId: string, expId?: string, mode?: string): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const loc = new URL(window.location.href);
    loc.searchParams.set("room", roomId);
    if (expId) loc.searchParams.set("exp", expId);
    if (mode) loc.searchParams.set("mode", mode);
    return loc.toString();
  }
  const expParam = expId ? `&exp=${expId}` : "";
  const modeParam = mode ? `&mode=${mode}` : "";
  return `fabric:///?room=${roomId}${expParam}${modeParam}`;
}
