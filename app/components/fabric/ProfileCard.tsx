/**
 * ProfileCard — what a participant looks like (Slice 21).
 *
 * Terrell asked what he looks like to another user; before this
 * slice the honest answer was "a name, a color, and a name tag".
 * The card is the identity surface that answers properly:
 *
 * - the name, large, with the signature hue;
 * - the secure tag — the one-way fDNA fingerprint of their
 *   ghostie's seed (Slice 20's tag, carried on the announce since
 *   Slice 21). It names the ghostie; it is not, and cannot be
 *   turned back into, the seed. The seed never leaves its device.
 * - their ghostie: name, temperament, and (for your own ghost)
 *   whether it's out in the room;
 * - the fabric they're on, as the VIEWER's session state knows
 *   it — never a claim the peer's device makes about itself;
 * - their badges: drawn glyphs from the rewards registry.
 *   Unearned badges are simply absent — no greyed-out teasers —
 *   and an id the registry doesn't know renders as a plain dot
 *   with the id beside it, never a crash or a fake label.
 *
 * Quick actions (other people's cards only) invent no new send
 * paths: "Send a heart" dispatches the same FABRIC_VERB_EVENT
 * the VerbBar fires, so the heart flows through the canvas's
 * funnel (mode gate, fabric rules) exactly as if tapped there;
 * "Pet their ghostie" dispatches FABRIC_PET_GHOST_EVENT, which
 * the fluid canvas answers with ordinary strokes at the ghost's
 * sensed position — the owner's own accept-pets setting decides
 * whether they land. The callers (FabricMenu) own those
 * dispatches; this component only renders and asks.
 *
 * Your own card is built from the exact announce payload your
 * device broadcasts (profile.ts's one builder), so what you see
 * here is provably what the room sees.
 *
 * Powered by Nirvana
 */

import React from "react";
import { Pressable, Text, View } from "react-native";
import {
  colors,
  radius,
  spacing,
  type as typeScale,
} from "../../../src/theme/tokens";
import { hueCss } from "../../../src/identity/identityStore";
import { shortPeerId } from "../../../src/session/sessionStore";
import {
  badgeInfo,
  trailLabel,
  type BadgeGlyph,
  type ProfileCardData,
} from "../../../src/identity/profile";
import { GhostiePortrait } from "./IdCards";

/** Drawn badge marks — plain Views, no emoji (UI doctrine). */
export function BadgeGlyphMark({
  glyph,
  color,
}: {
  glyph: BadgeGlyph;
  color: string;
}) {
  if (glyph === "dot") {
    return (
      <View
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }}
      />
    );
  }
  if (glyph === "ring") {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: color,
        }}
      />
    );
  }
  if (glyph === "ringDot") {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }}
        />
      </View>
    );
  }
  if (glyph === "diamond") {
    return (
      <View
        style={{
          width: 11,
          height: 11,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
    );
  }
  // bars: three rising strokes, like a tiny signal of presence.
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 2,
        height: 14,
      }}
    >
      {[6, 12, 9].map((h, i) => (
        <View
          key={i}
          style={{ width: 3, height: h, backgroundColor: color, borderRadius: 1 }}
        />
      ))}
    </View>
  );
}

export interface ProfileCardActions {
  onSendHeart: () => void;
  /** Null hides the pet button (their ghostie isn't announced). */
  onPetGhost: (() => void) | null;
  /** Line under the actions explaining the gates that apply. */
  note: string;
}

export default function ProfileCard({
  data,
  ghostPresenceLine,
  actions,
  onOpenGhostie,
}: {
  data: ProfileCardData;
  /** Own ghost only: its live presence, from the ghost store. */
  ghostPresenceLine?: string | null;
  /** Other people's cards only: quick actions + their gate note. */
  actions?: ProfileCardActions | null;
  /**
   * Slice 22: the ghostie block is itself a door — it opens the
   * ghostie's own ID card (portrait, permissions, published
   * vitals). Optional; without it the block renders as before.
   */
  onOpenGhostie?: () => void;
}) {
  const displayName = data.name || shortPeerId(data.peerId);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.accentLine,
        borderRadius: radius.card,
        padding: spacing.md,
        marginBottom: spacing.sm,
        gap: spacing.sm,
      }}
    >
      {/* Name + hue */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor:
              typeof data.hue === "number" ? hueCss(data.hue) : colors.textDim,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}
          >
            {displayName}
          </Text>
          {data.roleLine ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {data.roleLine}
            </Text>
          ) : null}
        </View>
      </View>

      {typeof data.hue === "number" ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          Signature color · hue {data.hue}° — their strokes, sounds, and
          dancer wear it.
        </Text>
      ) : (
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          Their identity card hasn't landed yet — the color arrives with
          their next announce.
        </Text>
      )}

      {/* The fabric they're on (viewer-side knowledge). */}
      <Text style={{ color: colors.text, fontSize: typeScale.body }}>
        {data.fabricLine}
      </Text>

      {/* Their ghostie — Slice 22: the block is a door to the
          ghostie's own ID card (its portrait, permissions, and
          published vitals live there). */}
      {data.ghost ? (
        <Pressable
          pointerEvents="auto"
          onPress={onOpenGhostie}
          disabled={!onOpenGhostie}
          accessibilityRole={onOpenGhostie ? "button" : undefined}
          accessibilityLabel={
            onOpenGhostie ? `Open ${data.ghost.name}'s ID card` : undefined
          }
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: colors.ghostLine,
            borderRadius: radius.card,
            padding: spacing.sm,
            gap: 2,
            backgroundColor: pressed ? colors.ghostDim : "transparent",
          })}
        >
          <GhostiePortrait
            compact
            hue={data.ghost.hue}
            temperament={data.ghost.temperament}
            presence={null}
            trail={data.trail}
          />
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600", marginTop: spacing.xs }}>
            Ghostie — {data.ghost.name}
            {data.ghost.temperament ? (
              <Text style={{ color: colors.ghost }}>
                {"  ·  "}
                {data.ghost.temperament}
              </Text>
            ) : null}
          </Text>
          {ghostPresenceLine ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {ghostPresenceLine}
            </Text>
          ) : null}
          {data.trail ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Wearing: {trailLabel(data.trail)}
            </Text>
          ) : null}
          {data.ghostCard?.vitals ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Health {data.ghostCard.vitals.h} · Stamina {data.ghostCard.vitals.s} · Vigor {data.ghostCard.vitals.v}
            </Text>
          ) : null}
          {data.ghostCard ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Shareable {data.ghostCard.shareable ? "on" : "off"} · Tradeable{" "}
              {data.ghostCard.tradeable ? "on" : "off"} · Personality{" "}
              {data.ghostCard.personalityPublic ? "public" : "private"}
            </Text>
          ) : null}
          {data.tag ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 2,
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
          {onOpenGhostie ? (
            <Text
              style={{
                color: colors.ghost,
                fontSize: typeScale.caption,
                fontWeight: "700",
                textAlign: "right",
              }}
            >
              ID card ›
            </Text>
          ) : null}
        </Pressable>
      ) : data.tag ? (
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
      {data.tag ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          The tag is a one-way fingerprint of the ghostie's seed — it
          names the ghostie without ever showing the seed.
        </Text>
      ) : null}

      {/* Badges — earned only; unknown ids render plainly. */}
      {data.badges.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {data.badges.map((id) => {
            const info = badgeInfo(id);
            return (
              <View
                key={id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.card,
                  paddingVertical: 5,
                  paddingHorizontal: 8,
                }}
              >
                {info ? (
                  <BadgeGlyphMark glyph={info.glyph} color={hueCss(info.hue)} />
                ) : (
                  <BadgeGlyphMark glyph="dot" color={colors.textDim} />
                )}
                <Text style={{ color: colors.text, fontSize: typeScale.caption }}>
                  {info ? info.label : id}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Quick actions — other people's cards, through the gates. */}
      {actions ? (
        <View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable
              pointerEvents="auto"
              onPress={actions.onSendHeart}
              accessibilityRole="button"
              accessibilityLabel={`Send a heart to ${displayName}`}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                paddingVertical: 10,
                borderRadius: radius.card,
                backgroundColor: pressed ? colors.accentDim : colors.accent,
              })}
            >
              <Text style={{ color: "#06202a", fontSize: typeScale.body, fontWeight: "800" }}>
                Send a heart
              </Text>
            </Pressable>
            {actions.onPetGhost ? (
              <Pressable
                pointerEvents="auto"
                onPress={actions.onPetGhost}
                accessibilityRole="button"
                accessibilityLabel={`Pet ${data.ghost?.name ?? "their ghostie"}`}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.ghostLine,
                  backgroundColor: pressed ? colors.ghostDim : "transparent",
                })}
              >
                <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                  Pet {data.ghost?.name ?? "ghostie"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text
            style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: spacing.xs }}
          >
            {actions.note}
          </Text>
        </View>
      ) : null}

      {data.isSelf ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          This card is built from the exact announce your device
          broadcasts — what you see is what the room sees.
        </Text>
      ) : null}
    </View>
  );
}
