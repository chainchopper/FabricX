/**
 * OnDeviceBrainCard — Slice 27: the on-device brain's settings
 * surface, shared by AI Services (LLM section) and Your Ghostie
 * (under the brain tier switch).
 *
 * What it shows is the store's truth, in product language: this
 * device either can't host the model (no WebGPU — one honest
 * line), hasn't downloaded it (a button with the real size on
 * it), is downloading it (a real progress %), or is thinking
 * with it (ready). The model picker presents the three MLC models
 * Conduit's production adapter offers under their ghostie names
 * (Slice 29 — Ghostie 1B / 1.5B / 3B), each with its base named
 * honestly in the subline beneath; picking one persists, and the
 * download is always a separate explicit press — choosing is
 * never downloading.
 *
 * Pressing Download IS the consent: it records the grant and
 * starts the one-time download (onDeviceBrain.startOnDeviceDownload
 * does both). The proactive one-time ask lives in BrainChrome;
 * this card is the permanent, un-nagging home of the same choice.
 *
 * Privacy line, stated because it is structural: the model runs
 * on this device, so the seed, the Personality text and every
 * prompt stay here. There is no endpoint to send them to.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  BRAIN_MODELS,
  brainModelFullName,
  getBrainSnapshot,
  selectBrainModel,
  startOnDeviceDownload,
  subscribeOnDeviceBrain,
  type BrainSnapshot,
} from "../../../src/ai/onDeviceBrain";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";

export default function OnDeviceBrainCard() {
  const [snap, setSnap] = useState<BrainSnapshot>(() => getBrainSnapshot());

  useEffect(() => subscribeOnDeviceBrain(setSnap), []);

  // Slice 50: the card's headline is the ghostie's own name —
  // it is {name}'s brain; the exact model riding under that
  // name stays on the card (the provenance line below carries
  // the exact MLC model id and the size), so nothing about
  // Slice 46's honesty is lost by the friendlier headline.
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  useEffect(() => subscribeGhostState(setGhost), []);
  const ghostName =
    typeof ghost.ghostName === "string" && ghost.ghostName.trim()
      ? ghost.ghostName.trim()
      : null;

  const pct = Math.round(snap.progress * 100);

  const stateLine = (() => {
    switch (snap.state) {
      case "unavailable":
        return "This browser has no WebGPU, so the on-device model can't run here. The decision table, the in-browser interpreter and any cloud you connect still answer — nothing is lost.";
      case "probing":
        return "Checking this device…";
      case "downloading":
        return `${brainModelFullName(snap.model)} arriving… ${pct}% — downloading once (${snap.model.sizeNote}). You can keep playing; nothing waits on it.`;
      case "warming":
        return `Weights are in — ${brainModelFullName(snap.model)} is warming up…`;
      case "ready":
        return `Ready — ${brainModelFullName(snap.model)} is thinking on this device. Composing and your ghost's deliberation can use it, offline.`;
      case "error":
        return `The download hit a snag${snap.error ? ` — ${snap.error}` : ""}. Try again on a good connection.`;
      default:
        return snap.loadedModelId === snap.model.id
          ? `${brainModelFullName(snap.model)} is downloaded. It loads when a feature next asks for it.`
          : `Not downloaded yet. ${brainModelFullName(snap.model)} — ${snap.model.sizeNote}, once; after that it thinks here, offline, with no account.`;
    }
  })();

  const showDownload =
    snap.webgpu &&
    (snap.state === "idle" || snap.state === "error") &&
    snap.loadedModelId !== snap.model.id;
  const busy = snap.state === "downloading" || snap.state === "warming";

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.ghostLine,
        borderRadius: radius.card,
        padding: spacing.md,
        gap: spacing.sm,
        backgroundColor: colors.ghostDim,
      }}
    >
      <Text
        style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}
      >
        {ghostName
          ? `${ghostName}'s brain — a real model, on this device`
          : "On-device brain — a real model, on this device"}
      </Text>
      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        {stateLine}
      </Text>

      {/* Model picker: choosing persists; it never downloads. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {BRAIN_MODELS.map((m) => {
          const selected = snap.model.id === m.id;
          return (
            <Pressable
              key={m.id}
              pointerEvents="auto"
              disabled={busy}
              onPress={() => void selectBrainModel(m.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? colors.ghostLine : colors.line,
                backgroundColor: selected ? colors.ghostDim : "transparent",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: selected ? colors.text : colors.textDim,
                  fontSize: typeScale.caption,
                  fontWeight: "700",
                }}
              >
                {m.displayName} · {m.sizeNote}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Slice 29: honest provenance for the picked model, and the
          standing word on tuning — the bases run as picked tonight.
          Slice 50: the provenance line also carries the EXACT model
          id (the MLC id the engine fetches) — under the ghostie's
          headline, the card still names precisely what runs. */}
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          {snap.model.displayName} · {snap.model.baseNote} · {snap.model.id}
        </Text>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          Fanalogy's own tuning comes later — tonight these run as picked.
        </Text>
      </View>

      {snap.state === "downloading" ? (
        <View
          style={{
            height: 6,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 6,
              width: `${pct}%`,
              backgroundColor: colors.ghost,
              borderRadius: 999,
            }}
          />
        </View>
      ) : null}

      {showDownload ? (
        <Pressable
          pointerEvents="auto"
          onPress={() => void startOnDeviceDownload()}
          accessibilityRole="button"
          accessibilityLabel={`Download ${snap.model.displayName}, ${snap.model.sizeNote}, to this device`}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.ghostLine,
            backgroundColor: pressed ? colors.ghostDim : "transparent",
          })}
        >
          <Text
            style={{ color: colors.text, fontSize: typeScale.caption, fontWeight: "700" }}
          >
            {snap.state === "error"
              ? "Try the download again"
              : `Download ${snap.model.displayName} — ${snap.model.sizeNote}, once`}
          </Text>
        </Pressable>
      ) : null}

      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        The model runs here, in your browser over WebGPU — your seed,
        your Personality and your words never leave this device.
      </Text>
    </View>
  );
}
