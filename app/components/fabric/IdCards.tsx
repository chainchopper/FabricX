/**
 * IdCards — the ID-card overlays (Slice 22).
 *
 * Terrell's model (Oct 29): "the card is an id card. Users,
 * fabrics, layers and ghostins have them." Slice 21 built the
 * USER card (ProfileCard). This file carries the other three
 * kinds, in the same card grammar, each a summary that opens an
 * overlay with the element's full public information:
 *
 * - GHOSTIE — the centerpiece: a composed PORTRAIT in the
 *   ghostie's own visual language (its hue form, an expression
 *   from its live temperament, its equipped trail worn as
 *   echoes), its features, the permissions its primary published
 *   (Shareable / Tradeable — a flag, honestly labeled: trading
 *   opens with the marketplace), its Personality when — and only
 *   when — its primary made it public, and its VITALS: Health /
 *   Stamina / Vigor as labeled bars, each with the one-line WHY
 *   the sender's own derivation produced (ghostVitals.ts). A
 *   remote ghostie whose readings haven't arrived shows NO
 *   numbers — the card says they arrive with its next announce.
 *   Nothing on any card is invented.
 * - FABRIC — the registry's public face plus the session truth:
 *   host, who's here (doors to their user cards), the guest
 *   rules in force, and the host's editor door when you're it.
 * - LAYER — the active layer's public face: what it is, its
 *   tools, its caps (the doctrine's entitlements, read from the
 *   constants the code actually enforces — a layer with no cap
 *   says "No cap set"), its per-layer settings summary, and the
 *   lint attached to the room.
 *
 * The portrait is a composition, not a fake live sim: it renders
 * the ghostie's current temperament and presence as an expression
 * and never pretends to be a window into its device.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  colors,
  radius,
  spacing,
  type as typeScale,
} from "../../../src/theme/tokens";
import { hueCss, normalizeHue } from "../../../src/identity/identityStore";
import { trailLabel } from "../../../src/identity/profile";
import type { ExperienceLayer } from "../../../src/types/experience";
import { MAX_GHOSTS_PER_ROOM } from "../../../src/ghost/GhostPeer";
import { MAX_STAGE_RIGS } from "../../../src/dancer/stageRoster";
import { MAX_PATTERN_STEPS } from "../../../src/ai/PatternComposer";
import { MAX_RECIPE_STEPS } from "../../../src/ai/RecipeCore";
import {
  getLintSnapshot,
  subscribeLintStore,
  type LintSnapshot,
} from "../../../src/lint/lintStore";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export function OverlayHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: spacing.sm,
        marginBottom: spacing.sm,
      }}
    >
      <Pressable
        pointerEvents="auto"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => ({
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: pressed ? colors.accentDim : "transparent",
          marginRight: spacing.sm,
        })}
      >
        <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
          ← Back
        </Text>
      </Pressable>
      <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
        {title}
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: spacing.md,
      }}
    >
      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        {label}
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: typeScale.body,
          fontWeight: "600",
          flex: 1,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function idleLineFor(exp: ExperienceLayer): string {
  switch (exp.idleBehavior) {
    case "ambient":
      return "Alive at idle — breathes, drifts, and plays a little on its own";
    case "breathe":
      return "Breathes at idle — a slow pulse, present rather than dead";
    case "still":
      return "Rests at idle — stillness here is a decision, not a default";
    default:
      return "Idle behavior undeclared — treated as still";
  }
}

/* ------------------------------------------------------------------ */
/* The ghostie portrait                                                */
/* ------------------------------------------------------------------ */

/**
 * The ghostie, drawn in its own visual language: a soft hue form
 * wearing an expression composed from its CURRENT temperament,
 * its presence dimming it when it sleeps, its equipped trail
 * trailing as echoes behind the body. A portrait — composed from
 * published state, honestly still.
 */
export function GhostiePortrait({
  hue,
  temperament,
  presence,
  trail,
  compact,
}: {
  /** The ghostie's OWN hue; null falls back to the ghost violet. */
  hue: number | null;
  temperament: string | null;
  /** Live presence for the local ghost; null for remote (unknown). */
  presence: string | null;
  /** Equipped trail style id, if announced. */
  trail: string | null;
  /** Two-thirds scale for embedding inside another card. */
  compact?: boolean;
}) {
  const s = compact ? 2 / 3 : 1;
  const h = hue !== null ? normalizeHue(hue) : null;
  const body = h !== null ? `hsl(${h}, 80%, 62%)` : colors.ghost;
  const glow = h !== null ? `hsla(${h}, 85%, 55%, 0.28)` : colors.ghostDim;
  const sleeping = presence === "sleeping";
  const face = "#241536";

  const eyes =
    temperament === "sleepy" || sleeping ? (
      <>
        <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: face }} />
        <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: face }} />
      </>
    ) : (
      <>
        <View style={{ width: 9, height: 12, borderRadius: 5, backgroundColor: face }} />
        <View style={{ width: 9, height: 12, borderRadius: 5, backgroundColor: face }} />
      </>
    );

  const mouth =
    temperament === "playful" ? (
      <View
        style={{
          width: 30,
          height: 16,
          borderRadius: 15,
          borderBottomWidth: 4,
          borderColor: face,
          marginTop: 2,
        }}
      />
    ) : temperament === "affectionate" ? (
      <View
        style={{
          width: 24,
          height: 13,
          borderRadius: 12,
          borderBottomWidth: 4,
          borderColor: face,
          marginTop: 2,
        }}
      />
    ) : temperament === "sassy" ? (
      <View
        style={{
          width: 18,
          height: 3,
          borderRadius: 2,
          backgroundColor: face,
          marginTop: 8,
          marginLeft: 10,
        }}
      />
    ) : temperament === "curious" ? (
      <View
        style={{
          width: 11,
          height: 11,
          borderRadius: 6,
          borderWidth: 3,
          borderColor: face,
          marginTop: 4,
        }}
      />
    ) : (
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: face,
          marginTop: 6,
        }}
      />
    );

  return (
    <View
      style={{
        height: 168 * s,
        borderRadius: radius.card,
        backgroundColor: "rgba(20,14,36,1)",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        opacity: sleeping ? 0.82 : 1,
      }}
    >
      {/* Back glow in the ghost's hue. */}
      <View
        style={{
          position: "absolute",
          width: 210 * s,
          height: 210 * s,
          borderRadius: 105 * s,
          backgroundColor: glow,
          right: -50 * s,
          top: -70 * s,
        }}
      />
      {/* Trail echoes — the equipped style, worn. */}
      {trail ? (
        <>
          <View
            style={{
              position: "absolute",
              width: 92 * s,
              height: 92 * s,
              borderRadius: 46 * s,
              backgroundColor: body,
              opacity: 0.16,
              transform: [{ translateX: -52 * s }, { translateY: 12 * s }],
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 92 * s,
              height: 92 * s,
              borderRadius: 46 * s,
              backgroundColor: body,
              opacity: 0.3,
              transform: [{ translateX: -27 * s }, { translateY: 6 * s }],
            }}
          />
        </>
      ) : null}
      {/* The body. */}
      <View
        style={{
          width: 96 * s,
          height: 96 * s,
          borderRadius: 48 * s,
          backgroundColor: body,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: sleeping ? colors.textDim : "rgba(255,255,255,0.55)",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 18,
            marginTop: temperament === "sassy" ? 0 : 2,
          }}
        >
          {eyes}
        </View>
        {mouth}
        {temperament === "affectionate" ? (
          <>
            <View
              style={{
                position: "absolute",
                width: 13,
                height: 8,
                borderRadius: 5,
                backgroundColor: "rgba(244,114,182,0.55)",
                left: 12,
                top: 52,
              }}
            />
            <View
              style={{
                position: "absolute",
                width: 13,
                height: 8,
                borderRadius: 5,
                backgroundColor: "rgba(244,114,182,0.55)",
                right: 12,
                top: 52,
              }}
            />
          </>
        ) : null}
      </View>
      {sleeping ? (
        <Text
          style={{
            position: "absolute",
            right: 18,
            top: 12,
            color: colors.ghost,
            fontSize: typeScale.label,
            fontWeight: "700",
            letterSpacing: 2,
          }}
        >
          z z
        </Text>
      ) : null}
      {trail ? (
        <Text
          style={{
            position: "absolute",
            left: 12,
            bottom: 10,
            color: colors.textDim,
            fontSize: typeScale.caption,
          }}
        >
          {trailLabel(trail)}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Vitals bars                                                         */
/* ------------------------------------------------------------------ */

export function VitalsBars({
  readings,
  why,
}: {
  readings: { health: number; stamina: number; vigor: number };
  why: { health: string; stamina: string; vigor: string } | null;
}) {
  const bars: {
    label: string;
    value: number;
    color: string;
    why: string | null;
  }[] = [
    { label: "Health", value: readings.health, color: hueCss(150), why: why?.health ?? null },
    { label: "Stamina", value: readings.stamina, color: hueCss(38), why: why?.stamina ?? null },
    { label: "Vigor", value: readings.vigor, color: colors.ghost, why: why?.vigor ?? null },
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      {bars.map((bar) => (
        <View key={bar.label}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              {bar.label}
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {bar.value}/100
            </Text>
          </View>
          <View
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.line,
              marginTop: 3,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 8,
                borderRadius: 4,
                width: `${Math.max(0, Math.min(100, bar.value))}%`,
                backgroundColor: bar.color,
              }}
            />
          </View>
          {bar.why ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
              {bar.why}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Ghostie card overlay                                                */
/* ------------------------------------------------------------------ */

export interface GhostieCardOverlayData {
  name: string;
  hue: number | null;
  temperament: string | null;
  /** Raw live presence (own ghost) — drives the portrait's dimming. */
  presence: string | null;
  /** Live presence line — own ghost only; null when not knowable. */
  presenceLine: string | null;
  /** Live brain tier line — own ghost only. */
  brainLine: string | null;
  tag: string | null;
  trail: string | null;
  shareable: boolean;
  tradeable: boolean;
  personalityPublic: boolean;
  /** Published Personality text; null when private or unwritten. */
  personality: string | null;
  /** False for a remote ghostie whose card facts haven't arrived. */
  cardFactsKnown: boolean;
  vitals: { health: number; stamina: number; vigor: number } | null;
  vitalsWhy: { health: string; stamina: string; vigor: string } | null;
  isSelf: boolean;
}

export function GhostieCardOverlay({
  data,
  onBack,
}: {
  data: GhostieCardOverlayData;
  onBack: () => void;
}) {
  const name = data.name || "Ghostie";
  return (
    <View>
      <OverlayHeader title={`${name} — ID card`} onBack={onBack} />
      <GhostiePortrait
        hue={data.hue}
        temperament={data.temperament}
        presence={data.presence}
        trail={data.trail}
      />
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.ghostLine,
          borderRadius: radius.card,
          padding: spacing.md,
          marginTop: spacing.sm,
          gap: spacing.sm,
        }}
      >
        <View>
          <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
            {name}
            {data.temperament ? (
              <Text style={{ color: colors.ghost, fontSize: typeScale.body }}>
                {"  ·  "}
                {data.temperament}
              </Text>
            ) : null}
          </Text>
          {data.presenceLine ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
              {data.presenceLine}
            </Text>
          ) : null}
        </View>

        {data.tag ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              fDNA tag
            </Text>
            <Text
              style={{
                color: colors.ghost,
                fontSize: typeScale.body,
                fontWeight: "700",
                letterSpacing: 1,
              }}
            >
              {data.tag}
            </Text>
          </View>
        ) : null}

        {/* Features */}
        <View style={{ gap: 4 }}>
          <Row label="Temperament" value={data.temperament ?? "not announced yet"} />
          {data.brainLine ? <Row label="Brain" value={data.brainLine} /> : null}
          <Row
            label="Wearing"
            value={data.trail ? trailLabel(data.trail) : "No trail equipped"}
          />
        </View>

        {/* Personality — published text or the private line, never both. */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
            Personality
          </Text>
          {data.personality ? (
            <Text style={{ color: colors.text, fontSize: typeScale.body, marginTop: 2 }}>
              “{data.personality}”
            </Text>
          ) : data.personalityPublic ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
              Public — its primary hasn't written one yet.
            </Text>
          ) : (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
              Personality: private — its primary keeps it home.
            </Text>
          )}
        </View>

        {/* Permissions — as its primary set them. */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
            gap: 4,
          }}
        >
          <Row
            label="Shareable"
            value={data.shareable ? "On — full card may be featured" : "Off — name-tag card only"}
          />
          <Row
            label="Tradeable"
            value={data.tradeable ? "Flagged tradeable" : "Not tradeable"}
          />
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Trading opens with the marketplace — the flag above is
            real today; moving a ghostie between primaries is not
            built yet, and this card won't pretend otherwise.
          </Text>
          {!data.cardFactsKnown ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              The rest of {name}'s card facts arrive with their
              ghostie's next announce.
            </Text>
          ) : null}
        </View>

        {/* Vitals — real readings or an honest absence. */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: typeScale.body,
              fontWeight: "600",
              marginBottom: spacing.sm,
            }}
          >
            Vitals
          </Text>
          {data.vitals ? (
            <VitalsBars readings={data.vitals} why={data.vitalsWhy} />
          ) : (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {data.isSelf
                ? `Readings appear once ${name} is awake on the canvas.`
                : `Vitals arrive with ${name}'s next announce — never guessed, never filled in.`}
            </Text>
          )}
        </View>

        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          {data.isSelf
            ? "This is your ghostie's public card — built from the same published facts its announce carries."
            : "Everything on this card was published by its primary or computed on their device — nothing here is inferred."}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Fabric card overlay                                                 */
/* ------------------------------------------------------------------ */

export interface FabricCardOverlayData {
  exp: ExperienceLayer;
  canvasBadge: string;
  stateLine: string;
  hostLine: string | null;
  rulesCaption: string;
  rules: { label: string; allowed: boolean }[];
  people: { id: string; label: string; isSelf: boolean }[];
  canEdit: boolean;
}

export function FabricCardOverlay({
  data,
  onBack,
  onOpenPerson,
  onEditFabric,
}: {
  data: FabricCardOverlayData;
  onBack: () => void;
  onOpenPerson: (peerId: string) => void;
  onEditFabric: () => void;
}) {
  const { exp } = data;
  return (
    <View>
      <OverlayHeader title="Fabric ID card" onBack={onBack} />
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.accentLine,
          borderRadius: radius.card,
          padding: spacing.md,
          gap: spacing.sm,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
            {exp.name}
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.pill,
              paddingVertical: 2,
              paddingHorizontal: 8,
            }}
          >
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1 }}>
              {data.canvasBadge}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
          {exp.description}
        </Text>
        <Text style={{ color: colors.accent, fontSize: typeScale.caption, fontWeight: "700" }}>
          {data.stateLine}
        </Text>
        <View style={{ gap: 4 }}>
          <Row label="Canvas" value={data.canvasBadge} />
          <Row label="At idle" value={idleLineFor(exp)} />
          {data.hostLine ? <Row label="Host" value={data.hostLine} /> : null}
          <Row label="Made by" value={exp.author} />
          <Row label="Version" value={exp.version} />
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600", marginBottom: spacing.xs }}>
            Who's here — {data.people.length}
          </Text>
          {data.people.map((p) => (
            <Pressable
              key={p.id}
              pointerEvents="auto"
              onPress={() => onOpenPerson(p.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${p.label}'s card`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
                backgroundColor: pressed ? colors.accentDim : "transparent",
                borderRadius: radius.card,
                paddingHorizontal: 6,
              })}
            >
              <Text style={{ color: colors.text, fontSize: typeScale.body }}>
                {p.label}
                {p.isSelf ? " (you)" : ""}
              </Text>
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                card ›
              </Text>
            </Pressable>
          ))}
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
            gap: 4,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
            Guest rules
          </Text>
          {data.rules.map((r) => (
            <Row key={r.label} label={r.label} value={r.allowed ? "Allowed" : "Off for guests"} />
          ))}
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            {data.rulesCaption}
          </Text>
        </View>

        {data.canEdit ? (
          <Pressable
            pointerEvents="auto"
            onPress={onEditFabric}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${exp.name} from its drawer card`}
            style={({ pressed }) => ({
              alignItems: "center",
              paddingVertical: 10,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.accentLine,
              backgroundColor: pressed ? colors.accentDim : "transparent",
            })}
          >
            <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
              Edit this fabric ›
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Layer card overlay                                                  */
/* ------------------------------------------------------------------ */

const LAYER_TOOLS: Record<string, string[]> = {
  "default-fluid": [
    "Freehand drawing",
    "Verbs — heart, cheer, tickle",
    "Agent composer + recipes",
    "Ghostie",
    "Lint objects",
  ],
  "ar-piano": [
    "On-screen piano, C3–C5",
    "Soundfont grand + synth voices",
    "Note bus — notes heard on every end",
    "Agent composer",
    "Ghostie",
  ],
  "dancer-stage": [
    "Dancer rigs — one ghostie per participant",
    "Note bus",
    "Character slot (glTF, UE5 skeleton)",
    "Key strip",
    "Ghosties on stage",
  ],
  "sam-see": ["Camera", "SAM 3.1 segmentation", "Tap-to-fire patterns", "See acts — touch / circle what it sees", "On-device eyes (GroundingDINO)", "Hands — gesture input", "Ghostie"],
  "camera-effects": ["Camera", "Live effects", "Ghostie"],
};

export function layerToolsFor(exp: ExperienceLayer): string[] {
  const known = LAYER_TOOLS[exp.id];
  if (known) return known;
  const caps = exp.capabilities;
  const tools: string[] = [];
  if (caps.ar) tools.push("AR surface");
  if (caps.camera) tools.push("Camera");
  if (caps.midi) tools.push("MIDI");
  if (caps.multiUser) tools.push("Multi-user");
  if (caps.haptics) tools.push("Haptics");
  if (caps.audio) tools.push("Audio");
  tools.push(...(caps.customInputs ?? []));
  return tools.length > 0 ? tools : ["No tools declared"];
}

/** Caps the code actually enforces for this layer — imported constants, not copy. */
export function layerCapsFor(exp: ExperienceLayer): string[] {
  const caps: string[] = [];
  if (exp.id === "dancer-stage") {
    caps.push(`Dancers on stage: ${MAX_STAGE_RIGS} — beyond that, ghosties wait in the wings`);
  }
  caps.push(`Ghosties per room: ${MAX_GHOSTS_PER_ROOM}`);
  if (exp.canvas !== "stage3d") {
    caps.push(
      `Composer patterns: up to ${MAX_PATTERN_STEPS} steps`,
      `Recipes: up to ${MAX_RECIPE_STEPS} steps`
    );
  }
  return caps;
}

export interface LayerCardOverlayData {
  exp: ExperienceLayer;
  canvasBadge: string;
  toggles: { label: string; value: string }[];
}

export function LayerCardOverlay({
  data,
  onBack,
}: {
  data: LayerCardOverlayData;
  onBack: () => void;
}) {
  const { exp } = data;
  const [lint, setLint] = useState<LintSnapshot>(() => getLintSnapshot());
  useEffect(() => subscribeLintStore(setLint), []);
  const caps = layerCapsFor(exp);
  return (
    <View>
      <OverlayHeader title="Layer ID card" onBack={onBack} />
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.card,
          padding: spacing.md,
          gap: spacing.sm,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
            {exp.name}
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.pill,
              paddingVertical: 2,
              paddingHorizontal: 8,
            }}
          >
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1 }}>
              {data.canvasBadge}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
          {exp.description}
        </Text>
        <Row label="At idle" value={idleLineFor(exp)} />

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600", marginBottom: spacing.xs }}>
            Its tools
          </Text>
          {layerToolsFor(exp).map((t) => (
            <Text key={t} style={{ color: colors.text, fontSize: typeScale.body, paddingVertical: 1 }}>
              · {t}
            </Text>
          ))}
        </View>

        {exp.id === "sam-see" ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.line,
              paddingTop: spacing.sm,
              gap: 4,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              How See works
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              SAM 3.1 names what the camera sees, through the model
              resolved for this device. The camera is this layer's
              background; the fluid draws over it.
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              A frame is sent only when you tap Segment — one frame,
              dropped right after. Regions keep only their box
              coordinates.
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              See can act on what it finds — “touch the apple”,
              “draw a circle around the chair”. With the on-device
              eyes (GroundingDINO), frames are analyzed on this
              device only: never sent, never stored.
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              Hands: your camera is read on this device only;
              nothing is sent or stored.
            </Text>
          </View>
        ) : null}

        {exp.id === "default-fluid" ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.line,
              paddingTop: spacing.sm,
              gap: 4,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              How Hands works
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              With Hands on (THIS LAYER), the camera opens as this
              layer's background and your hand becomes a way to
              touch: point to draw, pinch to press, sign to speak.
              Hands: your camera is read on this device only;
              nothing is sent or stored.
            </Text>
          </View>
        ) : null}

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600", marginBottom: spacing.xs }}>
            Caps
          </Text>
          {caps.length > 0 ? (
            caps.map((c) => (
              <Text key={c} style={{ color: colors.text, fontSize: typeScale.body, paddingVertical: 1 }}>
                · {c}
              </Text>
            ))
          ) : (
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              No cap set
            </Text>
          )}
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
            Caps are the doctrine's entitlements — quality guards,
            with headroom by tier as roles arrive.
          </Text>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
            gap: 4,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
            Settings on this layer
          </Text>
          {data.toggles.length > 0 ? (
            data.toggles.map((t) => (
              <Row key={t.label} label={t.label} value={t.value} />
            ))
          ) : (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Nothing set — this layer runs on its defaults. Its
              switches live in THIS LAYER, under this card's door.
            </Text>
          )}
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600", marginBottom: spacing.xs }}>
            Attached lint — {lint.devices.length}
          </Text>
          {lint.devices.length > 0 ? (
            lint.devices.map((d) => (
              <Row key={d.peerId} label={d.name} value={d.deviceKind} />
            ))
          ) : (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              No objects attached right now. When a lamp, a wearable,
              or another device says hello to this room, it lists here.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
