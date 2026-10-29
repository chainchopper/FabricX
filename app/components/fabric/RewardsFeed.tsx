/**
 * RewardsFeed — Slice 24's headless chrome.
 *
 * Mounted once in app/_layout's ChromeLayer, beside the
 * FabricSessionFollower, for the same reason: this is room-level
 * machinery that must run whichever experience is on screen.
 *
 * Two jobs, both invisible:
 * - start the rewards feed (src/rewards/rewardsFeed): session and
 *   lint facts become badge counters at their seams.
 * - the earning moment: when a badge lands, one small toast —
 *   "Badge earned — Heartfelt" — through the app's own toast
 *   (which fades like all chrome, per the UI doctrine). No modal,
 *   no sound hijack, nothing that stops the music. The glyph
 *   itself lives where glyphs live: the profile card and the
 *   Ghostie Home shelf.
 */

import { useEffect } from "react";
import { useToast } from "../Toast";
import { startRewardsFeed } from "../../../src/rewards/rewardsFeed";
import { subscribeBadgeEarned } from "../../../src/rewards/rewardsStore";
import { badgeInfo } from "../../../src/identity/profile";

export default function RewardsFeed() {
  const toast = useToast();

  useEffect(() => startRewardsFeed(), []);

  useEffect(
    () =>
      subscribeBadgeEarned((id) => {
        const info = badgeInfo(id);
        toast.show(`Badge earned — ${info ? info.label : id}`);
      }),
    [toast]
  );

  return null;
}
