import { Platform } from "react-native";

/**
 * webShell — the web app's global shell behaviors, injected at
 * RUNTIME (Hotfix 1.8).
 *
 * Why this module exists: PR #21 put the long-press fixes into the
 * repo-root index.html — callout suppression + user-select rules —
 * and they never reached a single user. Production does not serve
 * that file: fabric.fanalogy.com serves Expo's generated shell
 * (a minimal page with an expo-reset style and a #root div) because
 * the project has no app/+html.tsx, so the repo-root index.html is
 * not part of the served output at all. Terrell's field report
 * proved it: hold a piano key on the merged build and the iOS
 * selection menu still came up.
 *
 * The bulletproof delivery channel is the JS bundle itself — it is
 * the artifact that provably reaches every device (this fix was
 * verified by grepping a built bundle for the rule strings). So
 * initWebShell(), called once from the app root on web:
 *
 *  1. Injects a <style id="fabric-web-shell"> element carrying the
 *     global rules (below). Appended to <head> at startup, with
 *     !important so it wins over utility styles; the text-field
 *     opt-back-in from PR #21 is preserved verbatim in spirit:
 *     inputs, textareas and contenteditable keep text selection.
 *  2. Installs a capture-phase contextmenu preventer at the window:
 *     a long-press/right-click anywhere in the app must never open
 *     the browser menu over the canvas or the keys — EXCEPT inside
 *     text fields, where the menu is the user's own tool.
 *
 * The repo-root index.html rules stay (harmless, and correct if the
 * shell ever does serve that file); this module is the guarantee.
 * Native never runs it: no document, no callout, no context menu.
 *
 * Powered by Nirvana
 */

const SHELL_STYLE_ID = "fabric-web-shell";

const SHELL_CSS = [
  "html, body, #root, #root * {",
  "  -webkit-touch-callout: none !important;",
  "  -webkit-user-select: none !important;",
  "  user-select: none !important;",
  "}",
  "input, textarea, [contenteditable], [contenteditable='true'], [contenteditable] * {",
  "  -webkit-touch-callout: default !important;",
  "  -webkit-user-select: text !important;",
  "  user-select: text !important;",
  "}",
].join("\n");

let initialized = false;

function isTextFieldTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") {
    return false;
  }
  const el = target as HTMLElement;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.("[contenteditable]"));
}

/** Web-only, idempotent. Call once from the app root. */
export function initWebShell(): void {
  if (initialized) return;
  if (Platform.OS !== "web") return;
  if (typeof document === "undefined") return;
  initialized = true;

  if (!document.getElementById(SHELL_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SHELL_STYLE_ID;
    style.textContent = SHELL_CSS;
    document.head.appendChild(style);
  }

  window.addEventListener(
    "contextmenu",
    (e: MouseEvent) => {
      if (isTextFieldTarget(e.target)) return;
      e.preventDefault();
    },
    true
  );
}
