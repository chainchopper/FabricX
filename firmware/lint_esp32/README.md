# Fabric Lint — ESP32-S3 reference device

The smallest real lint: an ESP32-S3 that joins a Fabric room as an
object, glows with the room's life, and touches the canvas back.
Protocol: [`docs/LINT.md`](../../docs/LINT.md). Sketch:
[`lint_esp32.ino`](lint_esp32.ino).

## Hardware

- Any ESP32-S3 dev board (the sketch targets the common DevKitC
  layout).
- Light: the onboard WS2812 (GPIO48 on most S3 devkits) works with
  zero wiring. For a strip or NeoPixel matrix, change
  `NEOPIXEL_PIN` / `NUM_PIXELS` at the top of the sketch — every
  pixel renders the same envelope in v0.
- Touch: any exposed touch-capable pin (GPIO1–14). Default GPIO4 —
  a bare pin works; a coin, foil pad, or capacitive sensor soldered
  to it works better.

## Setup

1. Arduino IDE with the Espressif ESP32 core (3.x); select your
   S3 board.
2. Install libraries: **WebSockets** (Markus Sattler),
   **Adafruit NeoPixel**, **ArduinoJson** (v7).
3. Edit the CONFIG block at the top of the sketch: Wi-Fi
   credentials, `LINT_ROOM` (`"main"` for the default canvas, or a
   shared room id like `"live-k7d2qx"`), the device's name, and its
   signature hue.
4. Flash, open Serial at 115200. You should see Wi-Fi come up, the
   socket join, and frame logs as the room moves.

## What you'll see

- Verbs (Heart/Cheer/Tickle from any phone in the room) pulse the
  light in the sender's color.
- Piano notes flash in their pitch color.
- Drawing makes it glow with the room's dominant hue for as long as
  strokes keep coming; it settles when the room goes quiet.
- Session changes (someone hosts, a mode flips) breathe slowly.
- Touch the pad: a splat lands on every canvas in the room at the
  device's declared position, in its hue — unless the room's mode
  forbids guest sends (see the gating table in docs/LINT.md).

## The one dependency

Lint frames ride the signaling relay from **Hotfix 2.0**. The
Worker at the endpoint must be the 2.0 build (its source and deploy
steps live in `server/signaling/`) for frames to flow; against the
older Worker the device joins and waits, hearing nothing. The
in-app simulator (F menu → STUDIO — CREATE → LINT — OBJECTS)
demonstrates the whole loop in the meantime.
