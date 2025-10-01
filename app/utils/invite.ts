import { Platform } from "react-native";

export function buildInviteUrl(roomId: string, expId?: string): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const loc = new URL(window.location.href);
    loc.searchParams.set("room", roomId);
    if (expId) loc.searchParams.set("exp", expId);
    return loc.toString();
  }
  const expParam = expId ? `&exp=${expId}` : "";
  return `fabric:///?room=${roomId}${expParam}`;
}