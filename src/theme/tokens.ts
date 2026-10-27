/**
 * Fabric design tokens — Slice 3 (modern UI pass).
 *
 * One source of truth for chrome: near-black surfaces, hairline borders,
 * a single accent (Fanalogy cyan, the brand color the shipping UI already
 * uses everywhere — #22D3EE), and the fluid / users' signature hues as the
 * only other color allowed on the canvas side of the glass.
 *
 * Rules these tokens enforce:
 * - No gradients in chrome. No second accent. Text is one family
 *   (system sans) on a 12/14/16/20/28 scale, regular + semibold only.
 * - Blur lives on sheets only, one level (callers apply it, sparingly).
 * - Touch targets are >= 44px (see `hit`).
 *
 * Powered by Nirvana
 */

export const colors = {
  /** App background ink. */
  ink: "#05080A",
  /** Floating chrome panels over the canvas. */
  panel: "rgba(10,16,20,0.82)",
  /** Drawer / sheet surfaces (near-opaque; sheets carry the one blur). */
  sheet: "rgba(8,12,15,0.96)",
  /** Hairline border on panels and rows. */
  line: "rgba(255,255,255,0.08)",
  /** Primary text. 15.6:1 on panel over ink. */
  text: "#F2F7F9",
  /** Secondary text. ~7.4:1 on panel over ink — above the 4.5:1 floor. */
  textDim: "rgba(242,247,249,0.62)",
  /** Fanalogy cyan — the one accent. */
  accent: "#22D3EE",
  /** Accent wash for pressed / selected states. */
  accentDim: "rgba(34,211,238,0.16)",
  /** Accent hairline for active edges. */
  accentLine: "rgba(34,211,238,0.45)",
  /** Reserved for destructive / failure states only. */
  danger: "#F87171",
  /**
   * The ghost's identity tint (its signature violet, established in
   * Slice 2). Not a chrome accent: it marks ghost-owned surfaces only,
   * the same way a user's signature hue marks their splats.
   */
  ghost: "#A78BFA",
  ghostDim: "rgba(167,139,250,0.14)",
  ghostLine: "rgba(167,139,250,0.5)",
  /** Sheet backdrop scrim. */
  backdrop: "rgba(0,0,0,0.45)",
} as const;

export const radius = {
  card: 14,
  sheet: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Type scale — one family (system sans), two weights. */
export const type = {
  caption: 12,
  body: 14,
  label: 16,
  title: 20,
  display: 28,
  regular: "400" as const,
  semibold: "600" as const,
} as const;

/** Motion: 240–320ms, physics-feel (callers pair with out/cubic easings). */
export const motion = {
  fast: 240,
  base: 280,
  slow: 320,
} as const;

/** Minimum touch target, px. */
export const hit = 44;

/** Resting shadow for floating chrome (soft black, never colored glow). */
export const shadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.35,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
} as const;
