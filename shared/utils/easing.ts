export function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Smooth ease in-out
export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Fast start, soft finish
export function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Generic decay step: value approaches target with strength alpha
export function decayTowards(value: number, target: number, alpha: number) {
  return lerp(value, target, clamp(alpha, 0, 1));
}