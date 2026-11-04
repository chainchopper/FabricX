/**
 * FindFabrics — Slice 59's Find view (a sub-view of the F menu's
 * PEOPLE section, in the same sheet, like the profile cards and
 * the Ghostie Home — it opens from PEOPLE and closes back to it,
 * and it never renders over the canvas).
 *
 * Terrell's shape for it (Nov 3): "When I'm looking for other
 * people they show up in a gallery I can scroll through that's
 * filterable." So: a GALLERY of profile-card thumbnails — hue
 * avatar, ghostie, name, status, badges, the fabric they're
 * running — not a settings list. Tap a card and you get the
 * person: the app's own profile card (Slice 21, reused whole),
 * with the three things you can do about a person here —
 * Follow, Friend, and Ask to join their listed fabric.
 *
 * Follow and Friend are local marks on this device, keyed by
 * the person's secure tag (socialStore.ts says the plain truth:
 * there is no server social graph). Follow = their listings
 * surface first + your ghostie notices their arrivals. Friend =
 * they join the set the Friends filter reads (deliberate marks
 * here, union the people this device remembers from fabrics
 * actually shared — knownPeople.ts).
 *
 * Ask to join rides lobbyService's request path: the host
 * approves or not, and a yes hands this client the room through
 * the same transition an invite link performs (FabricMenu owns
 * that application — it has the Experience context). Denial and
 * silence both land in product language on the person's card.
 *
 * Nearby is answered honestly in the footer: Fabric collects no
 * location, so there is no Nearby filter — nothing honest to
 * sort by.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import { hueCss } from "../../../src/identity/identityStore";
import {
  badgeInfo,
  buildProfileCardData,
  resolveFdnaTag,
} from "../../../src/identity/profile";
import { useLocalProfileExtras } from "../../../src/identity/profileStore";
import { useIdentitySnapshot } from "../../../src/identity/useIdentity";
import { SESSION_MODE_LABEL } from "../../../src/session/sessionStore";
import {
  activityLabel,
  filterListings,
  isActiveNow,
  sortGalleryRows,
  type ListingEntry,
} from "../../../src/discovery/lobbyProtocol";
import {
  lobbyService,
  type LobbySnapshot,
} from "../../../src/discovery/lobbyService";
import { useKnownTags } from "../../../src/discovery/knownPeople";
import {
  setFollow,
  setFriend,
  useSocial,
} from "../../../src/discovery/socialStore";
import ProfileCard, { BadgeGlyphMark } from "./ProfileCard";

/** The lobby seat's live snapshot (shared with FabricMenu). */
export function useLobbySnapshot(): LobbySnapshot {
  const [snap, setSnap] = useState<LobbySnapshot>(() => lobbyService.getSnapshot());
  useEffect(() => lobbyService.subscribe(setSnap), []);
  return snap;
}

type Chip = "all" | "friends" | "active";

const backBtnStyle = ({ pressed }: { pressed: boolean }) => ({
  paddingVertical: 8,
  paddingHorizontal: 10,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: colors.line,
  backgroundColor: pressed ? colors.accentDim : "transparent",
  marginRight: spacing.sm,
});

export default function FindFabricsView({ onBack }: { onBack: () => void }) {
  const snap = useLobbySnapshot();
  const knownTags = useKnownTags();
  const { followTags, friendTags } = useSocial();
  const identity = useIdentitySnapshot();
  const localExtras = useLocalProfileExtras();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Browsing is a need: the lobby seat is held while this view
  // is open and given up when it closes (unless listing or
  // watching holds it for other reasons).
  useEffect(() => {
    lobbyService.startBrowsing();
    return () => lobbyService.stopBrowsing();
  }, []);

  // Status words age in place ("live now" → "quiet 6m") even
  // when no beacon changes anything the snapshot tracks.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const ownTag = useMemo(
    () =>
      identity.self
        ? resolveFdnaTag(localExtras.ghostSeed, identity.self.seed)
        : null,
    [identity.self, localExtras.ghostSeed]
  );

  const friendSet = useMemo(() => {
    const out = new Set<string>(knownTags);
    friendTags.forEach((t) => out.add(t));
    return out;
  }, [knownTags, friendTags]);

  const now = Date.now();
  const rows = useMemo(
    () =>
      sortGalleryRows(
        filterListings(snap.rows, {
          query,
          friendsOnly: chip === "friends",
          activeOnly: chip === "active",
          knownTags: friendSet,
          ownTag,
          now,
        }),
        followTags
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.rows, query, chip, friendSet, followTags, ownTag]
  );

  const selected = selectedTag
    ? snap.rows.find((r) => r.listing.hostTag === selectedTag) ?? null
    : null;

  // A listing that closes while its card is open steps back to
  // the gallery — the person isn't listed anymore, and the card
  // must not pretend otherwise.
  useEffect(() => {
    if (selectedTag && !selected) setSelectedTag(null);
  }, [selectedTag, selected]);

  if (selected) {
    return (
      <PersonView
        entry={selected}
        outgoing={snap.outgoing}
        following={followTags.has(selected.listing.hostTag)}
        friendExplicit={friendTags.has(selected.listing.hostTag)}
        friendKnown={knownTags.has(selected.listing.hostTag)}
        onBack={() => setSelectedTag(null)}
      />
    );
  }

  const emptyLine =
    snap.rows.length === 0
      ? "Nobody's listed right now. When a host flips on “List my fabric”, they appear here."
      : chip === "friends"
        ? "No friends are listed right now. Friends are people you mark on their card, and people whose fabrics you've shared."
        : chip === "active"
          ? "No one's room is stirring right now. Listed rooms that have gone quiet still show under All."
          : "No one matches that search.";

  return (
    <View>
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
          accessibilityLabel="Back to menu"
          style={backBtnStyle}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
            ← Menu
          </Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
          Find fabrics
        </Text>
      </View>

      <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
        Hosts who list their fabric show up here. Tap a person for
        their card — follow them, friend them, or ask to join.
      </Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search fabrics or people"
        placeholderTextColor={colors.textDim}
        accessibilityLabel="Search fabrics or people"
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.card,
          paddingVertical: 9,
          paddingHorizontal: 12,
          color: colors.text,
          fontSize: 16,
          marginBottom: spacing.sm,
        }}
      />

      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
        {(
          [
            ["all", "All"],
            ["friends", "Friends"],
            ["active", "Active now"],
          ] as [Chip, string][]
        ).map(([key, label]) => {
          const on = chip === key;
          return (
            <Pressable
              key={key}
              pointerEvents="auto"
              onPress={() => setChip(key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 13,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.line,
                backgroundColor: on ? colors.accentDim : "transparent",
              }}
            >
              <Text
                style={{
                  color: on ? colors.accent : colors.text,
                  fontSize: typeScale.body,
                  fontWeight: "700",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.body, paddingVertical: spacing.md }}>
          {emptyLine}
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {rows.map((entry) => (
            <GalleryCard
              key={entry.listing.hostTag}
              entry={entry}
              now={now}
              following={followTags.has(entry.listing.hostTag)}
              friend={friendSet.has(entry.listing.hostTag)}
              onOpen={() => setSelectedTag(entry.listing.hostTag)}
            />
          ))}
        </View>
      )}

      <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: spacing.md }}>
        Nearby isn't a filter — Fabric doesn't collect location,
        so there's nothing honest to sort by. Friends and follows
        live on this device only; nobody is told.
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* One gallery thumbnail                                               */
/* ------------------------------------------------------------------ */

function GalleryCard({
  entry,
  now,
  following,
  friend,
  onOpen,
}: {
  entry: ListingEntry;
  now: number;
  following: boolean;
  friend: boolean;
  onOpen: () => void;
}) {
  const l = entry.listing;
  const active = isActiveNow(l.beat, now);
  const badges = (l.badges ?? []).slice(0, 4);
  return (
    <Pressable
      pointerEvents="auto"
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${l.hostName}, hosting ${l.fabricName}, ${activityLabel(l.beat, now)}`}
      style={({ pressed }) => ({
        width: "48%",
        flexGrow: 1,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.card,
        padding: spacing.sm + 2,
        backgroundColor: pressed ? colors.accentDim : "transparent",
        gap: 5,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: hueCss(l.hostHue),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {l.ghostName ? (
            <Text style={{ fontSize: 17 }}>👻</Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}
          >
            {l.hostName}
          </Text>
          {l.ghostName ? (
            <Text numberOfLines={1} style={{ color: colors.ghost, fontSize: typeScale.caption }}>
              👻 {l.ghostName}
            </Text>
          ) : null}
        </View>
      </View>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: typeScale.body }}>
        {l.fabricName}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: active ? "#7ee787" : colors.textDim,
          }}
        />
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          {activityLabel(l.beat, now)} · {l.participants} here
        </Text>
      </View>
      {badges.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {badges.map((id) => {
            const info = badgeInfo(id);
            return info ? (
              <BadgeGlyphMark key={id} glyph={info.glyph} color={hueCss(info.hue)} />
            ) : null;
          })}
          {(l.badges ?? []).length > badges.length ? (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              +{(l.badges ?? []).length - badges.length}
            </Text>
          ) : null}
        </View>
      ) : null}
      {following || friend ? (
        <Text style={{ color: colors.accent, fontSize: typeScale.caption, fontWeight: "700" }}>
          {following ? "Following" : ""}
          {following && friend ? " · " : ""}
          {friend ? "Friend" : ""}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* One person: their profile card + Follow / Friend / Ask              */
/* ------------------------------------------------------------------ */

function PersonView({
  entry,
  outgoing,
  following,
  friendExplicit,
  friendKnown,
  onBack,
}: {
  entry: ListingEntry;
  outgoing: LobbySnapshot["outgoing"];
  following: boolean;
  friendExplicit: boolean;
  friendKnown: boolean;
  onBack: () => void;
}) {
  const l = entry.listing;
  const now = Date.now();
  const who = { name: l.hostName, hue: l.hostHue, tag: l.hostTag };
  const cardData = buildProfileCardData({
    peerId: l.hostTag,
    isSelf: false,
    name: l.hostName,
    hue: l.hostHue,
    extras: {
      tag: l.hostTag,
      ghost: l.ghostName ? { name: l.ghostName } : undefined,
      badges: l.badges,
    },
    fabricLine: `Hosting ${l.fabricName} · ${SESSION_MODE_LABEL[l.mode]}`,
    roleLine: `${l.participants} ${l.participants === 1 ? "person" : "people"} there · ${activityLabel(l.beat, now)}`,
  });

  const askState =
    outgoing.phase === "pending" && outgoing.hostTag === l.hostTag
      ? "pending"
      : outgoing.phase === "granted" && outgoing.hostTag === l.hostTag
        ? "granted"
        : outgoing.phase === "denied" && outgoing.hostTag === l.hostTag
          ? "denied"
          : outgoing.phase === "timeout" && outgoing.hostTag === l.hostTag
            ? "timeout"
            : "idle";

  return (
    <View>
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
          accessibilityLabel="Back to the gallery"
          style={backBtnStyle}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
            ← Find
          </Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
          {l.hostName}
        </Text>
      </View>

      <ProfileCard data={cardData} actions={null} />

      {/* Follow — a one-way local subscription. */}
      <Pressable
        pointerEvents="auto"
        onPress={() => setFollow(who, !following)}
        accessibilityRole="switch"
        accessibilityState={{ checked: following }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: pressed ? colors.accentDim : "transparent",
          marginBottom: spacing.xs,
        })}
      >
        <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
          Follow
        </Text>
        <Text
          style={{
            color: following ? colors.accent : colors.textDim,
            fontSize: typeScale.body,
            fontWeight: "700",
          }}
        >
          {following ? "Following" : "Off"}
        </Text>
      </Pressable>
      <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
        Their listings rise to the top of your gallery, and your
        ghostie notices when they arrive. Following lives on this
        device only — they aren't told.
      </Text>

      {/* Friend — the deliberate half of the Friends set. */}
      <Pressable
        pointerEvents="auto"
        onPress={() => setFriend(who, !friendExplicit)}
        accessibilityRole="switch"
        accessibilityState={{ checked: friendExplicit || friendKnown }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: pressed ? colors.accentDim : "transparent",
          marginBottom: spacing.xs,
        })}
      >
        <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
          Friend
        </Text>
        <Text
          style={{
            color: friendExplicit || friendKnown ? colors.accent : colors.textDim,
            fontSize: typeScale.body,
            fontWeight: "700",
          }}
        >
          {friendExplicit
            ? "Added by you"
            : friendKnown
              ? "From a shared fabric"
              : "Off"}
        </Text>
      </Pressable>
      <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
        Friends is this device's memory: people you add here, plus
        people whose fabrics you've shared.
        {friendKnown && !friendExplicit
          ? " You met this person in a fabric, so they're a friend by memory even before the button."
          : ""}
      </Text>

      {/* Ask to join — the host decides. */}
      {askState === "granted" ? (
        <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700", paddingVertical: 8 }}>
          You're in — taking you there…
        </Text>
      ) : askState === "pending" ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: 11,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.accentLine,
            marginBottom: spacing.xs,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            Asked — waiting for {l.hostName}…
          </Text>
        </View>
      ) : (
        <Pressable
          pointerEvents="auto"
          onPress={() => lobbyService.askToJoin(entry)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            alignItems: "center",
            paddingVertical: 11,
            borderRadius: radius.card,
            backgroundColor: pressed ? colors.accentDim : colors.accent,
            marginBottom: spacing.xs,
          })}
        >
          <Text style={{ color: "#06202a", fontSize: typeScale.body, fontWeight: "800" }}>
            Ask to join {l.fabricName}
          </Text>
        </Pressable>
      )}
      {askState === "denied" ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          {l.hostName} couldn't take you in right now. The door
          stays listed — you can ask again later.
        </Text>
      ) : askState === "timeout" ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          No answer — {l.hostName} may have stepped away. Ask
          again whenever.
        </Text>
      ) : askState === "idle" ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          {l.hostName} approves every guest themselves. Nothing
          joins until they say yes.
        </Text>
      ) : null}
    </View>
  );
}
