/**
 * BountyBoard — The Fold's job board (Slice 36).
 *
 * Terrell's marketplace shape, at room scale: jobs are ALPHA
 * CARDS — a title, a meta summary, and the job's real numbers —
 * in a dedicated board, filterable by kind, sectioned into OPEN
 * bounties and IN-PROGRESS jobs. Researchers and institutions
 * post bounties with a job spec (today: Fanalogy posts the seed
 * jobs on their behalf); the board answers with the room's
 * computed estimate — total work from the spec, time at the
 * room's CURRENT measured power, and each joiner's estimated
 * share. Where a number belongs to a GenX node (its costs, its
 * ETAs), the card shows the node's own report or "—": the board
 * never estimates on someone else's behalf.
 *
 * Every figure renders from boardData's computed view model —
 * this component holds no arithmetic of its own.
 *
 * Powered by Nirvana
 */

import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  displayNameFor,
  getIdentitySnapshot,
} from "../../identity/identityStore";
import {
  fmtEta,
  fmtJuice,
  fmtRate,
  fmtWork,
  type GenxCardData,
} from "../../genx/boardData";
import type { GenxJobStatus } from "../../genx/genxTypes";
import { colors, radius, spacing } from "../../theme/tokens";

const STATUS_LABEL: Record<GenxJobStatus, string> = {
  open: "OPEN",
  running: "IN PROGRESS",
  complete: "COMPLETE",
  failed: "FAILED",
};

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      pointerEvents="auto"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 11,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
        backgroundColor: active ? colors.accentDim : "transparent",
      }}
    >
      <Text
        style={{
          color: active ? colors.accent : colors.textDim,
          fontSize: 11,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      pointerEvents="auto"
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: primary ? colors.accent : "rgba(242,247,249,0.25)",
        backgroundColor: primary ? colors.accentDim : "transparent",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: primary ? colors.accent : colors.text,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
      <Text style={{ color: colors.textDim, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600", textAlign: "right", flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

export interface BountyBoardProps {
  cards: GenxCardData[];
  selfId: string;
  isHost: boolean;
  lendDevice: boolean;
  hasNodeUrl: boolean;
  followed: string[];
  spectating: string | null;
  nodeJobBusy: string[];
  onJoin: (jobId: string) => void;
  onStart: (jobId: string) => void;
  onRunNodeJob: (jobId: string) => void;
  onFollow: (jobId: string, follow: boolean) => void;
  onSpectate: (participantId: string | null) => void;
  /** Slice 40 (optional): cards whose bound structure can be viewed. */
  viewableStructureIds?: Record<string, boolean>;
  onViewStructure?: (jobId: string) => void;
  /** Slice 40 (optional): node jobs whose results can be viewed. */
  resultJobIds?: Set<string>;
  onViewResult?: (jobId: string) => void;
}

function Card({
  card,
  props,
}: {
  card: GenxCardData;
  props: BountyBoardProps;
}) {
  const { def } = card;
  const snap = getIdentitySnapshot();
  const nameFor = (id: string): string =>
    id === props.selfId
      ? `${snap.self?.name ?? "You"} (you)`
      : displayNameFor(id, props.selfId);
  const joined = card.myCellsPerSec !== null;
  const isRoom = def.kind === "room-fold";
  const progress = isRoom ? card.progress : card.nodeProgress;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.35)",
        borderRadius: radius.card,
        backgroundColor: "rgba(2,8,23,0.82)",
        padding: spacing.sm + 2,
        gap: 5,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", flexShrink: 1 }}>
          {def.title}
        </Text>
        <Text
          style={{
            color: card.status === "running" ? colors.accent : colors.textDim,
            fontSize: 10,
            fontWeight: "700",
          }}
        >
          {STATUS_LABEL[card.status]}
        </Text>
      </View>
      <Text style={{ color: colors.textDim, fontSize: 11, lineHeight: 15 }}>
        {def.summary}
      </Text>
      <MetaRow
        label={isRoom ? "Runs on" : "Runs on"}
        value={isRoom ? "This room's devices, in shards" : `A GenX node · ${def.framework ?? ""}`}
      />
      <MetaRow
        label="Total work"
        value={def.totalWorkUnits !== null ? fmtWork(def.totalWorkUnits) : "Reported by the node"}
      />
      <MetaRow
        label="Juice pool"
        value={
          def.juicePool !== null
            ? `${fmtJuice(def.juicePool)} · 1 per 1M verified cell-steps`
            : "The node's own terms"
        }
      />
      <MetaRow
        label="Room power now"
        value={
          card.joinedCount > 0
            ? `${fmtRate(card.roomPower)} · ${card.joinedCount} device${card.joinedCount === 1 ? "" : "s"}`
            : "No devices joined yet"
        }
      />
      <MetaRow
        label={isRoom ? "Est. time at room power" : "Est. time"}
        value={isRoom ? fmtEta(card.etaSeconds) : "The node reports its own progress"}
      />
      {joined && isRoom ? (
        <MetaRow
          label="Your est. share"
          value={`${Math.round(card.myShareEstimate * 100)}% · ≈${fmtJuice(card.myJuiceEstimate ?? 0)} if room power holds`}
        />
      ) : null}
      {progress !== null && progress !== undefined ? (
        <View style={{ gap: 3, marginTop: 2 }}>
          <View
            style={{
              height: 5,
              borderRadius: 3,
              backgroundColor: "rgba(242,247,249,0.14)",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 5,
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: colors.accent,
              }}
            />
          </View>
          <Text style={{ color: colors.textDim, fontSize: 10 }}>
            {isRoom
              ? `${Math.round(progress * 100)}% verified · ${fmtJuice(card.juiceEarned)} earned so far`
              : `${Math.round(progress * 100)}% — as reported by the node`}
          </Text>
        </View>
      ) : null}
      {card.contributors.length > 0 ? (
        <View style={{ gap: 2, marginTop: 2 }}>
          {card.contributors.map((c) => (
            <View
              key={c.participantId}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
            >
              <Text style={{ color: colors.text, fontSize: 11 }}>
                {nameFor(c.participantId)} · {c.verifiedShards} verified
              </Text>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <Text style={{ color: colors.textDim, fontSize: 11 }}>
                  {Math.round(c.share * 100)}% · {fmtJuice(c.juice)}
                </Text>
                <ActionButton
                  label={props.spectating === c.participantId ? "Riding" : "Spectate"}
                  onPress={() =>
                    props.onSpectate(
                      props.spectating === c.participantId ? null : c.participantId
                    )
                  }
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
        {isRoom ? (
          <>
            {!joined ? (
              <ActionButton
                label={props.lendDevice ? "Join — lend this device" : "Join (turn on Lend first)"}
                primary
                disabled={!props.lendDevice}
                onPress={() => props.onJoin(def.id)}
              />
            ) : (
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700", alignSelf: "center" }}>
                Joined · {fmtRate(card.myCellsPerSec ?? 0)} measured
              </Text>
            )}
            {props.isHost && card.status !== "running" ? (
              <ActionButton
                label={card.status === "complete" ? "Run it again" : "Start the fold"}
                disabled={card.joinedCount === 0 && !props.lendDevice}
                onPress={() => props.onStart(def.id)}
              />
            ) : null}
          </>
        ) : (
          <ActionButton
            label={
              props.nodeJobBusy.includes(def.id)
                ? "Running on the node…"
                : "Run on the node"
            }
            primary
            disabled={!props.hasNodeUrl || props.nodeJobBusy.includes(def.id)}
            onPress={() => props.onRunNodeJob(def.id)}
          />
        )}
        <ActionButton
          label={props.followed.includes(def.id) ? "Following" : "Follow"}
          onPress={() => props.onFollow(def.id, !props.followed.includes(def.id))}
        />
        {props.onViewStructure && props.viewableStructureIds?.[def.id] ? (
          <ActionButton
            label="View structure"
            onPress={() => props.onViewStructure?.(def.id)}
          />
        ) : null}
        {props.onViewResult && props.resultJobIds?.has(def.id) ? (
          <ActionButton
            label="View result"
            onPress={() => props.onViewResult?.(def.id)}
          />
        ) : null}
      </View>
      {!isRoom && !props.hasNodeUrl ? (
        <Text style={{ color: colors.textDim, fontSize: 10 }}>
          Needs a GenX node: set the node address in THIS LAYER (the Fold) and
          this card submits through that node's own API.
        </Text>
      ) : null}
    </View>
  );
}

export default function BountyBoard(props: BountyBoardProps) {
  const [filter, setFilter] = useState<"all" | "room-fold" | "node-job">("all");
  const cards = props.cards.filter((c) => filter === "all" || c.def.kind === filter);
  const open = cards.filter((c) => c.status === "open");
  const inProgress = cards.filter((c) => c.status === "running");
  const done = cards.filter((c) => c.status === "complete" || c.status === "failed");
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip label="All jobs" active={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Room jobs" active={filter === "room-fold"} onPress={() => setFilter("room-fold")} />
        <Chip label="Node jobs" active={filter === "node-job"} onPress={() => setFilter("node-job")} />
      </View>
      {cards.length === 0 ? (
        <Text style={{ color: colors.textDim, fontSize: 11 }}>
          No bounties on the board yet — the room's host posts the seed jobs.
        </Text>
      ) : null}
      {inProgress.length > 0 ? (
        <>
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>IN PROGRESS</Text>
          {inProgress.map((c) => (
            <Card key={c.def.id} card={c} props={props} />
          ))}
        </>
      ) : null}
      {open.length > 0 ? (
        <>
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>OPEN BOUNTIES</Text>
          {open.map((c) => (
            <Card key={c.def.id} card={c} props={props} />
          ))}
        </>
      ) : null}
      {done.length > 0 ? (
        <>
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>SETTLED</Text>
          {done.map((c) => (
            <Card key={c.def.id} card={c} props={props} />
          ))}
        </>
      ) : null}
    </View>
  );
}
