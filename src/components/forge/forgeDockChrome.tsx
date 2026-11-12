/**
 * forgeDockChrome — Slice H (the Forge dock: motion + hierarchy).
 *
 * The dock's whole visual language lives here, in one place, so
 * ForgeLayer.tsx carries structure and the tokens carry the look:
 * every color, size, radius, spacing step and duration in the
 * stylesheet below is interpolated from `src/theme/tokens.ts` —
 * there is not one hardcoded hex, rgba, px size or ms duration
 * in the CSS. (The one deliberate exception is `max-width: 300px`
 * on the note and `translateY(±1px)` on hover/press, which are
 * layout constants, not colors or type sizes.)
 *
 * Hierarchy (the audit's finding 4):
 * - primary — "Checkers — play your ghostie", the headline act:
 *   the one accent, ink text, semibold. Exactly one per dock.
 * - secondary — every other action: panel, hairline, text.
 * - danger — "Clear photos": the destructive act, danger text
 *   (the tokens reserve danger for destructive states).
 * The primary is also separated from the group by one xs step
 * (ForgeLayer passes the margin), so the order reads, not just
 * the color.
 *
 * Pressed state: the pointer's `:active` — a pill sinks 1px and
 * darkens to the sheet while held, lifts 1px on hover. These are
 * momentary actions, so no pill fakes a persistent toggled
 * state: the active MODE is the branch itself (menu vs game),
 * and the branches crossfade through ChromeMount (the house
 * mount pattern: enter motion.base, exit motion.fast) instead
 * of swapping instantly. Exactly one pill can ever be pressed
 * at a time, because only one pointer exists.
 *
 * Width: labels never wrap (`white-space: nowrap` on the pill)
 * and each branch wrapper is `width: max-content`, so the
 * absolutely-positioned ChromeMount columns size to their
 * widest label instead of collapsing to min-content (an
 * 82px-wide wrapped pill — caught by the after-drive, fixed
 * in the same slice).
 *
 * Deliberately NOT decided here: the lime question. No lime
 * (`#a3e635`) appears anywhere in this module or the dock —
 * the second-accent decision is its own slice, awaiting
 * Terrell's call, and this slice does not silently settle it.
 *
 * Powered by Nirvana
 */

import React from "react";
import {
  colors,
  hit,
  motion,
  radius,
  spacing,
  type,
} from "../../theme/tokens";

/**
 * The dock's stylesheet, built from the tokens at module load.
 * ForgeLayer renders it once via <ForgeDockStyles />; it lives
 * and dies with the fabric, like the dock itself.
 */
export const FORGE_DOCK_STYLE_CSS = `
.forge-dock-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: ${hit}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  border-radius: ${radius.card}px;
  border: 1px solid ${colors.line};
  background: ${colors.panel};
  color: ${colors.text};
  font-size: ${type.body}px;
  font-weight: ${type.regular};
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color ${motion.base}ms ease, border-color ${motion.base}ms ease, color ${motion.base}ms ease, transform ${motion.fast}ms ease;
}
.forge-dock-pill:hover {
  background: ${colors.panelGlass};
  transform: translateY(-1px);
}
.forge-dock-pill:active {
  background: ${colors.sheet};
  transform: translateY(1px);
}
.forge-dock-pill:focus-visible {
  outline: 2px solid ${colors.accent};
  outline-offset: 2px;
}
.forge-dock-pill--primary {
  background: ${colors.accent};
  border-color: ${colors.accent};
  color: ${colors.ink};
  font-weight: ${type.semibold};
}
.forge-dock-pill--primary:hover {
  background: ${colors.accent};
  transform: translateY(-1px);
}
.forge-dock-pill--primary:active {
  background: ${colors.accent};
  transform: translateY(1px);
}
.forge-dock-pill--danger {
  color: ${colors.danger};
}
.forge-dock-note {
  color: ${colors.textDim};
  background: ${colors.panel};
  border: 1px solid ${colors.line};
  border-radius: ${radius.card}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  font-size: ${type.caption}px;
  line-height: 1.5;
  max-width: 300px;
}
.forge-dock-banner {
  color: ${colors.text};
  background: ${colors.panel};
  border: 1px solid ${colors.line};
  border-radius: ${radius.card}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  font-size: ${type.body}px;
  font-weight: ${type.semibold};
}
`;

/** Renders the dock's stylesheet. Web-only, like the Forge itself. */
export function ForgeDockStyles() {
  return <style>{FORGE_DOCK_STYLE_CSS}</style>;
}

export type ForgeDockPillVariant = "primary" | "secondary" | "danger";

type ForgeDockPillProps = {
  variant?: ForgeDockPillVariant;
  onClick?: () => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * One dock pill. The base class carries the token look and the
 * pointer states; the variant only re-colors. Secondary is the
 * default — a pill that forgets its variant reads as supporting,
 * never as the headline.
 */
export function ForgeDockPill({
  variant = "secondary",
  onClick,
  style,
  children,
}: ForgeDockPillProps) {
  const className =
    variant === "primary"
      ? "forge-dock-pill forge-dock-pill--primary"
      : variant === "danger"
        ? "forge-dock-pill forge-dock-pill--danger"
        : "forge-dock-pill";
  return (
    <button type="button" className={className} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
