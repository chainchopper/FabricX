/**
 * Icon — Fabric's drawn icon set (Slice 3).
 *
 * One inline SVG line-icon family: 24px grid, 1.5px stroke, rounded
 * caps/joins, no fill except tiny solid details (eyes, burst center).
 * This replaces emoji-as-furniture across the chrome. Emoji survives
 * only as user content (e.g. the verb a person sends), never as UI.
 *
 * Rendering: on web the icons are real DOM <svg> elements (created via
 * React.createElement — this codebase has no react-native-svg and the
 * chrome that uses icons is web-first). On native, Icon renders an
 * empty box of the same size so layouts never shift and nothing breaks;
 * native layout parity beyond that is explicitly out of Slice 3 scope.
 *
 * Powered by Nirvana
 */

import React from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";

export type IconName =
  | "menu"
  | "close"
  | "back"
  | "chevronRight"
  | "heart"
  | "cheer"
  | "tickle"
  | "ghost"
  | "droplet"
  | "people"
  | "call"
  | "swarm"
  | "sliders"
  | "spark"
  | "gear"
  | "user"
  | "layers"
  | "grid"
  | "message"
  | "bag"
  | "wallet"
  | "eye";

type El = {
  el: "path" | "circle" | "line" | "rect";
  props: Record<string, string | number>;
};

const p = (d: string, extra?: Record<string, string | number>): El => ({
  el: "path",
  props: { d, ...extra },
});
const c = (cx: number, cy: number, r: number, extra?: Record<string, string | number>): El => ({
  el: "circle",
  props: { cx, cy, r, ...extra },
});
const l = (x1: number, y1: number, x2: number, y2: number): El => ({
  el: "line",
  props: { x1, y1, x2, y2 },
});
const r = (x: number, y: number, width: number, height: number, rx: number): El => ({
  el: "rect",
  props: { x, y, width, height, rx },
});
const dot = (cx: number, cy: number, r: number): El =>
  c(cx, cy, r, { fill: "currentColor", stroke: "none" });

const PATHS: Record<IconName, El[]> = {
  menu: [l(4, 7, 20, 7), l(4, 12, 20, 12), l(4, 17, 20, 17)],
  close: [l(6, 6, 18, 18), l(18, 6, 6, 18)],
  back: [p("M15 5l-7 7 7 7")],
  chevronRight: [p("M9 5l7 7-7 7")],
  heart: [
    p(
      "M12 20.3C6.9 16.4 3.5 13.2 3.5 9.7 3.5 6.9 5.5 5 8 5c1.7 0 3.2.9 4 2.3C12.8 5.9 14.3 5 16 5c2.5 0 4.5 1.9 4.5 4.7 0 3.5-3.4 6.7-8.5 10.6z"
    ),
  ],
  cheer: [
    l(12, 3.8, 12, 6.8),
    l(12, 17.2, 12, 20.2),
    l(3.8, 12, 6.8, 12),
    l(17.2, 12, 20.2, 12),
    l(6.2, 6.2, 8.3, 8.3),
    l(15.7, 15.7, 17.8, 17.8),
    l(17.8, 6.2, 15.7, 8.3),
    l(8.3, 15.7, 6.2, 17.8),
    dot(12, 12, 1.5),
  ],
  tickle: [
    p("M7 3.5c-1.6 2.8 1.6 5.7 0 8.5s1.6 5.7 0 8.5"),
    p("M12 3.5c-1.6 2.8 1.6 5.7 0 8.5s1.6 5.7 0 8.5"),
    p("M17 3.5c-1.6 2.8 1.6 5.7 0 8.5s1.6 5.7 0 8.5"),
  ],
  ghost: [
    p(
      "M18 20v-9.3a6 6 0 1 0-12 0V20l2.1-1.5 2 1.5 1.9-1.4 1.9 1.4 2-1.5L18 20z"
    ),
    dot(9.7, 10.6, 1.15),
    dot(14.3, 10.6, 1.15),
  ],
  droplet: [p("M12 3.8c2.9 3.9 6 7 6 10.2a6 6 0 1 1-12 0c0-3.2 3.1-6.3 6-10.2z")],
  people: [
    c(9, 8.5, 3.2),
    p("M3.5 19.5c.6-3.1 2.8-4.6 5.5-4.6s4.9 1.5 5.5 4.6"),
    p("M15.9 5.5a3.2 3.2 0 0 1 0 5.9"),
    p("M17.6 15.3c1.6.7 2.6 2 2.9 4.2"),
  ],
  call: [
    p(
      "M21.5 16.9v2.6a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.5 4.7 2 2 0 0 1 4.5 2.5h2.6a2 2 0 0 1 2 1.7c.13.95.36 1.87.68 2.74a2 2 0 0 1-.45 2.1L8.2 10.2a16 16 0 0 0 5.6 5.6l1.16-1.13a2 2 0 0 1 2.1-.45c.87.32 1.79.55 2.74.68a2 2 0 0 1 1.7 2z"
    ),
  ],
  swarm: [
    c(6, 6, 2.2),
    c(18, 7, 2.2),
    c(10, 18, 2.2),
    l(8.1, 6.4, 15.8, 6.9),
    l(6.9, 8.1, 9.2, 15.9),
    l(16.5, 9, 11.7, 16.1),
  ],
  sliders: [
    l(7, 4, 7, 20),
    l(12, 4, 12, 20),
    l(17, 4, 17, 20),
    c(7, 9, 2.1),
    c(12, 15, 2.1),
    c(17, 7, 2.1),
  ],
  spark: [
    p("M12 3.5l1.8 5.7 5.7 1.8-5.7 1.8L12 18.5l-1.8-5.7L4.5 11l5.7-1.8L12 3.5z"),
    l(19, 15.5, 19, 18.5),
    l(17.5, 17, 20.5, 17),
  ],
  gear: [
    c(12, 12, 3.2),
    l(12, 7.4, 12, 5.2),
    l(12, 16.6, 12, 18.8),
    l(7.4, 12, 5.2, 12),
    l(16.6, 12, 18.8, 12),
    l(8.75, 8.75, 7.2, 7.2),
    l(15.25, 15.25, 16.8, 16.8),
    l(15.25, 8.75, 16.8, 7.2),
    l(8.75, 15.25, 7.2, 16.8),
  ],
  user: [c(12, 8.5, 3.5), p("M5 20c.8-3.4 3.6-5.1 7-5.1s6.2 1.7 7 5.1")],
  layers: [
    p("M12 3.5l9 4.8-9 4.8-9-4.8 9-4.8z"),
    p("M4.5 12.7L12 16.7l7.5-4"),
    p("M4.5 16.7L12 20.7l7.5-4"),
  ],
  grid: [r(4, 4, 7, 7, 1.6), r(13, 4, 7, 7, 1.6), r(4, 13, 7, 7, 1.6), r(13, 13, 7, 7, 1.6)],
  message: [
    p(
      "M21 11.5a8.5 8.5 0 0 1-12.3 7.4L3 20l1.1-5.7A8.5 8.5 0 1 1 21 11.5z"
    ),
  ],
  bag: [p("M5.3 7.8h13.4l-1.1 12.7H6.4L5.3 7.8z"), p("M9 10.5V6.3a3 3 0 0 1 6 0v4.2")],
  wallet: [r(3, 6, 18, 13, 2), dot(16.8, 12.5, 1.15), l(3, 10, 21, 10)],
  eye: [
    p("M2.5 12S6 5.6 12 5.6 21.5 12 21.5 12 18 18.4 12 18.4 2.5 12 2.5 12z"),
    c(12, 12, 3),
  ],
};

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Icon({
  name,
  size = 24,
  color = "#F2F7F9",
  strokeWidth = 1.5,
  style,
}: IconProps) {
  if (Platform.OS !== "web") {
    // Native: keep the layout box, draw nothing (see header note).
    return <View style={[{ width: size, height: size }, style]} />;
  }

  const Svg = "svg" as unknown as React.ElementType;
  const children = PATHS[name].map((d, i) =>
    React.createElement(d.el as unknown as React.ElementType, {
      key: i,
      ...d.props,
    })
  );

  return React.createElement(
    Svg,
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style,
      "aria-hidden": true,
    },
    children
  );
}
