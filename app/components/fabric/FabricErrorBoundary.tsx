/**
 * FabricErrorBoundary — Hotfix 2.3.
 *
 * Why this exists: the app shipped an ErrorBoundary component
 * (src/components/ErrorBoundary.tsx) but never mounted it on a live
 * path — its only use is the legacy PianoOverlay. The F menu, the
 * experience renderer, and the root had NO boundary at all, so a
 * single throw during any render pass unmounted the entire React
 * tree and left a full white screen (Terrell's field report,
 * Oct 28: tap F → blank page). Whatever the individual trigger is,
 * a chrome or canvas snag must never again take the whole app down.
 *
 * Two variants, matching where they stand guard:
 * - "menu": fallback is a small sheet-styled panel in the menu's
 *   own slot, with a Close affordance. Dismissing (or closing and
 *   reopening the menu — resetKey) clears the error and retries the
 *   real menu, so a transient bad state self-heals.
 * - "canvas": fallback fills the canvas region with a calm ink
 *   panel and a reload affordance (web). The chrome (HUD, anchor,
 *   menu) lives OUTSIDE this boundary and keeps working, so the
 *   user is never stranded on a dead screen.
 *
 * Every catch is logged with the component stack — the next field
 * report can name the actual culprit from the console alone.
 *
 * Powered by Nirvana
 */

import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import {
  colors,
  radius,
  spacing,
  type as typeScale,
} from "../../../src/theme/tokens";

interface FabricErrorBoundaryProps {
  /** Short name for the console log line ("menu", "canvas"). */
  label: string;
  variant: "menu" | "canvas";
  /** When this value changes, a caught error clears and children retry. */
  resetKey?: unknown;
  /** Menu variant: called by the fallback's Close button. */
  onDismiss?: () => void;
  children: React.ReactNode;
}

interface FabricErrorBoundaryState {
  error: Error | null;
}

export default class FabricErrorBoundary extends React.Component<
  FabricErrorBoundaryProps,
  FabricErrorBoundaryState
> {
  state: FabricErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): FabricErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(
      `[FabricErrorBoundary:${this.props.label}]`,
      error,
      info?.componentStack ?? ""
    );
  }

  componentDidUpdate(prev: FabricErrorBoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private dismiss = (): void => {
    this.setState({ error: null });
    this.props.onDismiss?.();
  };

  private reload = (): void => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    if (this.props.variant === "menu") {
      return (
        <View
          pointerEvents="auto"
          style={{
            position: "absolute",
            top: 76,
            left: 12,
            zIndex: 115,
            width: 348,
            maxWidth: "92%",
            backgroundColor: colors.sheet,
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: radius.sheet,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: typeScale.body,
              fontWeight: "700",
            }}
          >
            The menu hit a snag
          </Text>
          <Text
            style={{ color: colors.textDim, fontSize: typeScale.caption }}
          >
            This panel failed to open, so Fabric kept the canvas running
            instead of blanking the app. Closing and reopening the menu
            tries again.
          </Text>
          <Pressable
            pointerEvents="auto"
            onPress={this.dismiss}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.accentLine,
              backgroundColor: pressed ? colors.accentDim : "transparent",
            })}
          >
            <Text
              style={{
                color: colors.accent,
                fontSize: typeScale.body,
                fontWeight: "700",
              }}
            >
              Close
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View
        pointerEvents="auto"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          backgroundColor: colors.ink,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
          gap: spacing.sm,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: typeScale.body,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          The canvas hit a snag
        </Text>
        <Text
          style={{
            color: colors.textDim,
            fontSize: typeScale.caption,
            textAlign: "center",
          }}
        >
          Your room, identity, and saved work live on this device and are
          untouched. Reloading rejoins the canvas.
        </Text>
        {Platform.OS === "web" ? (
          <Pressable
            pointerEvents="auto"
            onPress={this.reload}
            accessibilityRole="button"
            accessibilityLabel="Reload Fabric"
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.accentLine,
              backgroundColor: pressed ? colors.accentDim : "transparent",
            })}
          >
            <Text
              style={{
                color: colors.accent,
                fontSize: typeScale.body,
                fontWeight: "700",
              }}
            >
              Reload Fabric
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
}
