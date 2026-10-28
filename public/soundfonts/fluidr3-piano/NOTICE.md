# NOTICE — FluidR3 grand piano samples

The audio files packed in this folder (`pack-c2.json` … `pack-c5.json`)
are per-note MP3 renders of the **acoustic grand piano** from the
**FluidR3_GM** soundfont, covering MIDI 36–84 (C2–C6): the piano
layer's playable C3–C5 range plus one octave of headroom on each side.

- **Soundfont:** FluidR3_GM, by **Frank Wen** — released under the
  **MIT License** (the license under which FluidR3 has been
  distributed since its release; it permits use, copying, and
  redistribution with attribution).
- **Per-note renders:** from the `gleitz/midi-js-soundfonts` project
  (`FluidR3_GM/acoustic_grand_piano-mp3`, gh-pages), which renders the
  FluidR3_GM bank into one MP3 per note. The samples are vendored
  here **untranscoded** (44.1 kHz stereo MP3, ~3.1 s natural decay),
  re-packed only into base64 data URIs inside per-octave JSON files —
  the distribution format popularized by soundfont-player — so the
  voice ships inside this repository and is served from Fabric's own
  domain. Nothing is fetched from a CDN at runtime.

FluidR3_GM license (MIT):

> Copyright (c) Frank Wen and contributors
>
> Permission is hereby granted, free of charge, to any person
> obtaining a copy of this software and associated documentation
> files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy,
> modify, merge, publish, distribute, sublicense, and/or sell copies
> of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be
> included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
> EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
> MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
> HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
> WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
> FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
> OTHER DEALINGS IN THE SOFTWARE.

Playback engine: `src/audio/soundfontPiano.ts` (Fabric's own tiny
loader/player — no runtime dependency). See `manifest.json` in this
folder for pack layout and byte counts.

Powered by Nirvana
