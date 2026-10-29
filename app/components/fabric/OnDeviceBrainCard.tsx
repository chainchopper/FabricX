/**
 * OnDeviceBrainCard — Slice 27: the on-device brain's settings
 * surface, shared by AI Services (LLM section) and Your Ghostie
 * (under the brain tier switch).
 *
 * What it shows is the store's truth, in product language: this
 * device either can't host the model (no WebGPU — one honest
 * line), hasn't downloaded it (a button with the real size on
 * it), is downloading it (a real progress %), or is thinking
 * with it (ready). The model picker names the three MLC models
 * Conduit's production adapter offers, with their sizes; picking
 * one persists, and the download is always a separate explicit
 * press — choosing is never downloading.
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
  getBrainSnapshot,
  selectBrainModel,
  startOnDeviceDownload,
  subscribeOnDeviceBrain,
  type BrainSnapshot,
} from "../../../src/ai/onDeviceBrain";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";

export default function OnDeviceBrainCard() {
  const [snap, setSnap] = useState<BrainSnapshot>(() => getBrainSnapshot());

  useEffect(() => subscribeOnDeviceBrain(setSnap), []);

  const pct = Math.round(snap.progress * 100);

  const stateLine = (() => {
    switch (snap.state) {
      case "unavailable":
        return "This browser has no WebGPU, so the on-device model can't run here. The decision table, the in-browser interpreter and any cloud you connect still answer — nothing is lost.";
      case "probing":
        return "Checking this device…";
      case "downloading":
        return `Brain arriving… ${pct}% — ${snap.model.label}, downloading once. You can keep playing; nothing waits on it.`;
      case "warming":
        return "Weights are in — the brain is warming up…";
      case "ready":
        return `Ready — ${snap.model.label} is thinking on this device. Composing and your ghost's deliberation can use it, offline.`;
      case "error":
        return `The download hit a snag${snap.error ? ` — ${snap.error}` : ""}. Try again on a good connection.`;
      default:
        return snap.loadedModelId === snap.model.id
          ? `${snap.model.label} is downloaded. It loads when a feature next asks for it.`
          : `Not downloaded yet. ${snap.model.label} — ${snap.model.sizeNote}, once; after that it thinks here, offline, with no account.`;
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
        On-device brain — a real model, on this device
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
                {m.label} · {m.sizeNote}
              </Text>
            </Pressable>
          );
        })}
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
          accessibilityLabel={`Download ${snap.model.label}, ${snap.model.sizeNote}, to this device`}
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
              : `Download ${snap.model.label} — ${snap.model.sizeNote}, once`}
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
