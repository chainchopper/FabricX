/**
 * dancer-check — node unit check for the Frequency Dancer driver.
 *
 * Feeds DancerDriver a scale and a chord on a deterministic clock
 * and prints the band impulses, proving: the pitch->band map walks
 * DOWN the body as notes descend, velocity scales amplitude,
 * direction follows melodic contour (and alternates on repeats),
 * chords fire several bands at once, and every band settles back
 * to rest (offset ~0) — the return-to-rest contract.
 *
 * Run: esbuild src/dancer/DancerDriver.ts --bundle --format=esm \
 *        --outfile=/tmp/DancerDriver.mjs
 *      node scripts/dancer-check.mjs /tmp/DancerDriver.mjs
 */
const { DancerDriver, bandForNote, noteNameToMidi } = await import(
  process.argv[2] ?? "/tmp/DancerDriver.mjs"
);

let now = 0;
const step = (d, ms) => {
  let pose;
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    pose = d.tick(now);
  }
  return pose;
};
const fmt = (n) => (n >= 0 ? "+" : "") + n.toFixed(2);
const bandLine = (pose) =>
  pose.bands.map((b) => `${b.id}:${fmt(b.offset)}/${b.energy.toFixed(2)}`).join("  ");

console.log("== band map (C3..C5) ==");
for (const n of ["C3", "E3", "G3", "B3", "C4", "E4", "G4", "B4", "C5"]) {
  const midi = noteNameToMidi(n);
  console.log(`${n} (midi ${midi}) -> ${bandForNote(midi).id}`);
}

console.log("\n== ascending scale, velocity 0.8, 150 ms apart ==");
{
  const d = new DancerDriver();
  for (const n of ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
    d.handleNoteEvent({ type: "on", note: n, velocity: 0.8 }, now);
    const pose = step(d, 150);
    const hit = pose.bands.reduce((a, b) => (Math.abs(b.offset) > Math.abs(a.offset) ? b : a));
    console.log(`${n} -> peak band ${hit.id} offset ${fmt(hit.offset)}`);
    d.handleNoteEvent({ type: "off", note: n }, now);
  }
  console.log("-- settle 2.5 s after the scale --");
  const pose = step(d, 2500);
  console.log(bandLine(pose));
  console.log("all |offset| < 0.05:", pose.bands.every((b) => Math.abs(b.offset) < 0.05));
}

console.log("\n== velocity = amplitude (same note, soft vs hard) ==");
for (const vel of [0.25, 1.0]) {
  const d = new DancerDriver();
  now = 0;
  d.noteOn(60, vel, now);
  const pose = step(d, 160);
  const arms = pose.bands.find((b) => b.id === "arms");
  console.log(`velocity ${vel}: arms offset ${fmt(arms.offset)} energy ${arms.energy.toFixed(2)}`);
}

console.log("\n== repeated note alternates direction ==");
{
  const d = new DancerDriver();
  now = 0;
  const dirs = [];
  for (let i = 0; i < 4; i++) {
    d.noteOn(72, 0.8, now);
    const pose = step(d, 140);
    dirs.push(Math.sign(pose.bands.find((b) => b.id === "head").offset));
    d.noteOff(72);
    step(d, 900);
  }
  console.log("head offset signs across 4 hits of C5:", dirs.join(", "));
}

console.log("\n== chord: C3 + C4 + E4 + G#4 at once (velocity 0.9) ==");
{
  const d = new DancerDriver();
  now = 0;
  for (const n of ["C3", "C4", "E4", "G#4"]) d.handleNoteEvent({ type: "on", note: n, velocity: 0.9 }, now);
  const pose = step(d, 160);
  console.log(bandLine(pose));
  const firing = pose.bands.filter((b) => Math.abs(b.offset) > 0.1).map((b) => b.id);
  console.log("bands firing simultaneously:", firing.join(", "));
  for (const n of ["C3", "C4", "E4", "G#4"]) d.handleNoteEvent({ type: "off", note: n }, now);
  const rest = step(d, 2500);
  console.log("settled to rest:", rest.bands.every((b) => Math.abs(b.offset) < 0.05), "| breath phase alive:", rest.breath !== 0);
}
