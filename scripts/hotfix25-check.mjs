/**
 * hotfix25-check — headless proof for Hotfix 2.5 "Voice that
 * actually listens (universal mic capture)".
 *
 * Root cause being buried: every voice path rode the Web Speech
 * API; Firefox has no SpeechRecognition, so the mic button there
 * could never trigger a permission prompt — only a caption.
 *
 * Proves, against the REAL bundled modules (esbuild, platform
 * node) with mocked browser environments:
 * - CORE: transcribeBlob with no target and no on-device
 *   transcriber is honestly "unsupported" and touches no network;
 *   a registered on-device transcriber (Slice 27's seam) wins and
 *   can fall through; a cloud target is POSTed as multipart to
 *   {endpoint}/audio/transcriptions with the right model
 *   (Meta endpoints -> muse-voice-transcribe-1.0, else whisper-1).
 * - CORE: media capture auto-stops at its cap with a blob and
 *   stopped tracks.
 * - HOOK (i): no-SpeechRecognition env -> toggle reaches
 *   getUserMedia({ audio: true }) and the recorder starts;
 *   listening state is visible.
 * - HOOK (ii): getUserMedia denied -> the in-world denial
 *   caption, FABRIC_VOICE_UNHEARD_EVENT dispatched (the canvas
 *   answers with ghost puzzlement), no unhandled rejection.
 * - HOOK (iii): SpeechRecognition env -> fast path unchanged:
 *   interim is preview only, final transcript -> onFinal once.
 *   SR not-allowed -> same denial caption + unheard event.
 * - HOOK (iv): cloud configured (built-in env key) + no SR ->
 *   capture -> stop -> blob POSTed to the transcription seam ->
 *   transcript lands in onFinal like typed text.
 * - HOOK (v): unconfigured + no SR -> capture works, no network
 *   call is made, the honest "needs a transcription brain"
 *   caption is produced, onFinal is NOT called.
 * - SERVICE: the VoiceInputService adapter's whisper provider
 *   captures + transcribes through the core; its browser
 *   provider delegates to the core recognizer.
 * - STRUCTURAL: the duplication is gone (the hook no longer
 *   wires webkitSpeechRecognition itself; the service has no
 *   "not yet implemented" stubs), the unheard event exists in
 *   ghostStore + LegacyFluid, ComposeBar pulses + captions the
 *   busy state, useVoiceInput carries the legacy pointer.
 *
 * Build + run:
 *   npx esbuild src/services/voiceCapture.ts --bundle --format=esm --platform=node --outfile=/tmp/hf25-voiceCapture.mjs
 *   npx esbuild src/services/VoiceInputService.ts --bundle --format=esm --platform=node --outfile=/tmp/hf25-VoiceInputService.mjs
 *   npx esbuild hf25-check-entry.ts --bundle --format=esm --platform=node --outfile=/tmp/hf25-hook.mjs
 *   node scripts/hotfix25-check.mjs /tmp/hf25-voiceCapture.mjs /tmp/hf25-VoiceInputService.mjs /tmp/hf25-hook.mjs
 * (hf25-check-entry.ts + the node_modules stubs it resolves are
 * local check scaffolding; the shipped check defaults match.)
 */
import { readFileSync } from "node:fs";

const corePath = process.argv[2] ?? "/tmp/hf25-voiceCapture.mjs";
const svcPath = process.argv[3] ?? "/tmp/hf25-VoiceInputService.mjs";
const hookPath = process.argv[4] ?? "/tmp/hf25-hook.mjs";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ok ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

const unhandled = [];
process.on("unhandledRejection", (e) => unhandled.push(e));

const flush = async (n = 12) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

// ---------------------------------------------------------------------------
// Mock browser environment
// ---------------------------------------------------------------------------

class FakeMediaRecorder {
  static instances = [];
  static isTypeSupported(t) {
    return typeof t === "string" && t.includes("webm");
  }
  constructor(stream, opts) {
    this.stream = stream;
    this.mimeType = opts?.mimeType || "audio/webm";
    this.state = "inactive";
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({
        data: new Blob(["fake-audio"], { type: this.mimeType }),
      });
      this.onstop?.();
    });
  }
}

class FakeSR {
  static last = null;
  constructor() {
    FakeSR.last = this;
    this.started = false;
  }
  start() {
    this.started = true;
  }
  stop() {}
  abort() {}
  emitResult(results, resultIndex = 0) {
    this.onresult?.({ resultIndex, results });
  }
  emitError(error) {
    this.onerror?.({ error });
  }
}
function srResult(text, isFinal) {
  const r = [{ transcript: text, confidence: 0.9 }];
  r.isFinal = isFinal;
  return r;
}

function setGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  } catch {
    globalThis[name] = value;
  }
}

function installEnv({
  sr = undefined,
  gum = null,
  recorder = true,
  fetchImpl = null,
} = {}) {
  FakeMediaRecorder.instances = [];
  FakeSR.last = null;
  const dispatched = [];
  const gumCalls = [];
  const trackStops = { count: 0 };
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          trackStops.count++;
        },
      },
    ],
  };
  const defaultGum = async (constraints) => {
    gumCalls.push(constraints);
    return stream;
  };
  setGlobal("window", {
    SpeechRecognition: sr,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent(ev) {
      dispatched.push(ev);
      return true;
    },
  });
  setGlobal("navigator", {
    language: "en-US",
    mediaDevices: { getUserMedia: gum ?? defaultGum },
  });
  if (recorder) setGlobal("MediaRecorder", FakeMediaRecorder);
  else setGlobal("MediaRecorder", undefined);
  const fetchCalls = [];
  setGlobal(
    "fetch",
    fetchImpl ??
      (async (url, opts) => {
        fetchCalls.push({ url, opts });
        throw new Error("fetch not expected in this scenario");
      })
  );
  return { dispatched, gumCalls, trackStops, fetchCalls, stream };
}

const okJsonFetch = (text, sink) => async (url, opts) => {
  sink.push({ url, opts });
  return {
    ok: true,
    status: 200,
    json: async () => ({ text }),
  };
};

// Benign env before importing bundles (module top levels stay inert).
installEnv({});
const core = await import(corePath);
const svcMod = await import(svcPath);
const hookMod = await import(hookPath);
const { __driver, __clear } = hookMod;

// ---------------------------------------------------------------------------
// CORE: transcription seam
// ---------------------------------------------------------------------------
console.log("core: transcription seam");
{
  core.setOnDeviceTranscriber(null);
  let fetchTouched = 0;
  setGlobal("fetch", async () => {
    fetchTouched++;
    throw new Error("nope");
  });
  const blob = new Blob(["x"], { type: "audio/webm" });
  const noTarget = await core.transcribeBlob(blob, null);
  check("no target -> unsupported", noTarget.ok === false && noTarget.reason === "unsupported");
  check("no target -> no network touched", fetchTouched === 0);

  core.setOnDeviceTranscriber(async () => "  hello fabric  ");
  const onDev = await core.transcribeBlob(blob, null);
  check("on-device transcriber wins", onDev.ok === true && onDev.text === "hello fabric");
  core.setOnDeviceTranscriber(async () => null);
  const fall = await core.transcribeBlob(blob, null);
  check("on-device null falls through to unsupported", fall.ok === false && fall.reason === "unsupported");
  core.setOnDeviceTranscriber(null);
  check("seam resets clean", core.hasOnDeviceTranscriber() === false);

  const sink = [];
  setGlobal("fetch", okJsonFetch(" show me a heartbeat ", sink));
  const cloud = await core.transcribeBlob(blob, {
    endpoint: "https://api.meta.ai/v1",
    apiKey: "k",
    model: "muse-voice-transcribe-1.0",
  });
  check("cloud target -> transcript", cloud.ok === true && cloud.text === "show me a heartbeat");
  check("cloud URL is /audio/transcriptions", sink[0]?.url === "https://api.meta.ai/v1/audio/transcriptions", sink[0]?.url);
  check("cloud POST + bearer", sink[0]?.opts?.method === "POST" && sink[0]?.opts?.headers?.Authorization === "Bearer k");
  const form = sink[0]?.opts?.body;
  check("multipart carries model", form?.get?.("model") === "muse-voice-transcribe-1.0");
  check("multipart carries file", !!form?.get?.("file"));

  check("model mapping: Meta endpoint", core.transcriptionModelFor("https://api.meta.ai/v1") === "muse-voice-transcribe-1.0");
  check("model mapping: muse chat model", core.transcriptionModelFor("https://example.test/v1", "muse-spark-1.3") === "muse-voice-transcribe-1.0");
  check("model mapping: other endpoints", core.transcriptionModelFor("https://api.openai.com/v1") === "whisper-1");
  check("target from null LLM config", core.transcriptionTargetFromLLM(null) === null);
  check(
    "target from Meta LLM config",
    core.transcriptionTargetFromLLM({ endpoint: "https://api.meta.ai/v1", apiKey: "x", model: "muse-spark-1.3" })?.model === "muse-voice-transcribe-1.0"
  );
  const notFound = await (async () => {
    setGlobal("fetch", async () => ({ ok: false, status: 404, json: async () => ({}) }));
    return core.transcribeBlob(blob, { endpoint: "https://x.test/v1", model: "whisper-1" });
  })();
  check("404 from endpoint -> unsupported (honest skip)", notFound.ok === false && notFound.reason === "unsupported");
}

// ---------------------------------------------------------------------------
// CORE: capture cap + support matrix
// ---------------------------------------------------------------------------
console.log("core: capture");
{
  const env = installEnv({});
  const support = core.voiceCaptureSupport();
  check("support: no SR, media capture yes", support.speechRecognition === false && support.mediaCapture === true);
  let autoBlob = null;
  const session = await core.startMediaCapture({
    maxMs: 30,
    onAutoStop: (b) => {
      autoBlob = b;
    },
  });
  check("getUserMedia asked with { audio: true }", env.gumCalls.length === 1 && env.gumCalls[0]?.audio === true && Object.keys(env.gumCalls[0]).length === 1);
  await new Promise((r) => setTimeout(r, 70));
  check("cap auto-stops with a blob", autoBlob instanceof Blob && autoBlob.size > 0);
  check("tracks stopped after cap", env.trackStops.count >= 1);
  session.cancel();

  const deniedEnv = installEnv({
    gum: async () => {
      const e = new Error("nope");
      e.name = "NotAllowedError";
      throw e;
    },
  });
  let deniedErr = null;
  try {
    await core.startMediaCapture({});
  } catch (e) {
    deniedErr = e;
  }
  check("denied getUserMedia -> VoiceCaptureError(denied)", deniedErr instanceof core.VoiceCaptureError && deniedErr.code === "denied");
  void deniedEnv;
}

// ---------------------------------------------------------------------------
// HOOK harness
// ---------------------------------------------------------------------------
function mountHook() {
  __driver.reset();
  __clear();
  const finals = [];
  let api = null;
  const render = () => {
    api = __driver.render(() =>
      hookMod.useComposeVoice((t) => finals.push(t))
    );
    return api;
  };
  render();
  return { render, finals, get api() { return api; } };
}

console.log("hook (i): no SpeechRecognition -> universal capture");
{
  delete process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY;
  const env = installEnv({});
  const h = mountHook();
  await flush();
  h.api.toggle();
  await flush();
  h.render(); // fresh closures, as React's re-render would give
  check("toggle reached getUserMedia", env.gumCalls.length === 1);
  check("asked for audio only", env.gumCalls[0]?.audio === true);
  check("recorder started", FakeMediaRecorder.instances.length === 1 && FakeMediaRecorder.instances[0].state === "recording");
  h.render();
  check("listening state visible", h.api.listening === true);
  h.api.toggle(); // stop -> no-brain caption path covered in (v); drain quietly
  await flush();
}

console.log("hook (ii): permission denied");
{
  const env = installEnv({
    gum: async () => {
      const e = new Error("denied");
      e.name = "NotAllowedError";
      throw e;
    },
  });
  const h = mountHook();
  await flush();
  h.api.toggle();
  await flush();
  h.render();
  check(
    "denial caption, in-world",
    h.api.message === "The fabric can't hear you — the browser said no to the mic.",
    JSON.stringify(h.api.message)
  );
  check("listening reset", h.api.listening === false);
  check(
    "unheard event dispatched (ghost puzzlement)",
    env.dispatched.some((ev) => ev?.type === "fabric:voice-unheard")
  );
  check("no final fabricated", h.finals.length === 0);
}

console.log("hook (iii): SpeechRecognition fast path");
{
  const env = installEnv({ sr: FakeSR });
  void env;
  const h = mountHook();
  await flush();
  h.api.toggle();
  await flush();
  check("recognizer started", FakeSR.last?.started === true);
  h.render();
  check("listening visible", h.api.listening === true);
  FakeSR.last.emitResult([srResult("show me a", false)]);
  h.render();
  check("interim is preview only", h.api.interim === "show me a" && h.finals.length === 0);
  FakeSR.last.emitResult([srResult("show me a heartbeat", true)]);
  await flush();
  check("final -> onFinal exactly once, same submit path", h.finals.length === 1 && h.finals[0] === "show me a heartbeat", JSON.stringify(h.finals));
  h.render();
  check("listening cleared after final", h.api.listening === false);

  // SR not-allowed -> denial caption + unheard event.
  const env2 = installEnv({ sr: FakeSR });
  const h2 = mountHook();
  await flush();
  h2.api.toggle();
  await flush();
  FakeSR.last.emitError("not-allowed");
  await flush();
  h2.render();
  check("SR denial caption", h2.api.message === "The fabric can't hear you — the browser said no to the mic.");
  check("SR denial -> unheard event", env2.dispatched.some((ev) => ev?.type === "fabric:voice-unheard"));
}

console.log("hook (iv): cloud configured -> capture -> transcribe -> onFinal");
{
  process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY = "test-key";
  const sink = [];
  const env = installEnv({ fetchImpl: okJsonFetch("show me a heartbeat", sink) });
  void env;
  const h = mountHook();
  await flush();
  h.api.toggle();
  await flush();
  h.render();
  check("capturing (no SR in this browser)", h.api.listening === true && FakeMediaRecorder.instances.length === 1);
  h.api.toggle(); // stop -> transcribe
  await flush();
  check("blob POSTed to the seam", sink.length === 1 && sink[0].url === "https://api.meta.ai/v1/audio/transcriptions", JSON.stringify(sink.map((s) => s.url)));
  check("Meta transcription model used", sink[0]?.opts?.body?.get?.("model") === "muse-voice-transcribe-1.0");
  check("transcript landed like typed text", h.finals.length === 1 && h.finals[0] === "show me a heartbeat", JSON.stringify(h.finals));
  h.render();
  check("busy cleared", h.api.busy === false && h.api.listening === false);
  delete process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY;
}

console.log("hook (v): unconfigured + no SR -> capture works, honest state");
{
  delete process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY;
  const env = installEnv({});
  const h = mountHook();
  await flush();
  h.api.toggle();
  await flush();
  h.render(); // fresh closures, as React's re-render would give
  h.api.toggle(); // stop -> transcribe attempt with no target
  await flush();
  h.render();
  check("capture happened", env.gumCalls.length === 1 && FakeMediaRecorder.instances.length === 1);
  check("no network call without a target", env.fetchCalls.length === 0);
  check(
    "honest no-brain caption",
    typeof h.api.message === "string" && h.api.message.includes("needs a transcription brain") && h.api.message.includes("AI Services"),
    JSON.stringify(h.api.message)
  );
  check("no transcript fabricated", h.finals.length === 0);
  check("busy cleared", h.api.busy === false);
}

// ---------------------------------------------------------------------------
// SERVICE: adapter over the core
// ---------------------------------------------------------------------------
console.log("service: VoiceInputService adapter");
{
  const sink = [];
  installEnv({ fetchImpl: okJsonFetch("hello fabric", sink) });
  const service = new svcMod.VoiceInputService({
    provider: "whisper",
    apiKey: "k",
    endpoint: "https://api.openai.com/v1",
    language: "en-US",
  });
  const heard = [];
  service.onTranscription((t) => heard.push(t));
  await service.startListening();
  check("whisper provider captures", service.getIsListening() === true && FakeMediaRecorder.instances.length === 1);
  await service.stopListening();
  check("whisper provider transcribes via the seam", heard.length === 1 && heard[0].isFinal === true && heard[0].text === "hello fabric", JSON.stringify(heard));
  check("whisper POST hit its endpoint", sink[0]?.url === "https://api.openai.com/v1/audio/transcriptions");

  installEnv({ sr: FakeSR });
  const browserSvc = new svcMod.VoiceInputService({
    provider: "browser",
    language: "en-US",
  });
  const heard2 = [];
  browserSvc.onTranscription((t) => heard2.push(t));
  await browserSvc.startListening();
  check("browser provider delegates to core recognizer", FakeSR.last?.started === true);
  FakeSR.last.emitResult([srResult("hi there", true)]);
  check("browser provider relays final", heard2.some((t) => t.isFinal && t.text === "hi there"));
}

// ---------------------------------------------------------------------------
// STRUCTURAL
// ---------------------------------------------------------------------------
console.log("structural");
{
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const captureSrc = read("../src/services/voiceCapture.ts");
  const serviceSrc = read("../src/services/VoiceInputService.ts");
  const hookSrc = read("../src/components/sensory/useComposeVoice.ts");
  const barSrc = read("../src/components/sensory/ComposeBar.tsx");
  const fluidSrc = read("../src/components/fluid/LegacyFluid.tsx");
  const storeSrc = read("../src/ghost/ghostStore.ts");
  const legacyHookSrc = read("../src/hooks/useVoiceInput.ts");

  check("core asks via getUserMedia({ audio: true })", captureSrc.includes("getUserMedia") && captureSrc.includes("{ audio: true }"));
  check("core posts to /audio/transcriptions", captureSrc.includes("/audio/transcriptions"));
  check("core names the Meta transcription model", captureSrc.includes("muse-voice-transcribe-1.0"));
  check("core leaves the on-device seam", captureSrc.includes("setOnDeviceTranscriber"));
  check("hook routes through the capture core", hookSrc.includes("startMediaCapture") && hookSrc.includes("transcribeBlob"));
  check(
    "hook no longer wires the recognizer itself",
    !/w\.SpeechRecognition|w\.webkitSpeechRecognition|window as unknown as Record/.test(hookSrc)
  );
  check("hook announces unheard", hookSrc.includes("FABRIC_VOICE_UNHEARD_EVENT"));
  check("hook denial caption is the product line", hookSrc.includes("The fabric can't hear you — the browser said no to the mic."));
  check(
    "service delegates, no stubs left",
    serviceSrc.includes("voiceCapture") &&
      !serviceSrc.includes("Whisper API mode is not yet implemented") &&
      !serviceSrc.includes("Custom endpoint mode is not yet implemented") &&
      !serviceSrc.includes("Only browser speech is currently supported")
  );
  check("ghostStore carries the unheard event", storeSrc.includes('FABRIC_VOICE_UNHEARD_EVENT = "fabric:voice-unheard"'));
  check("canvas answers unheard with puzzlement", fluidSrc.includes("FABRIC_VOICE_UNHEARD_EVENT") && fluidSrc.includes("expressPuzzlement()"));
  check("bar pulses the mic while listening", barSrc.includes("micPulse") && barSrc.includes("Animated"));
  check("bar captions transcription in flight", barSrc.includes("voice.busy") && barSrc.includes("Heard you — turning it into words…"));
  check("legacy hook carries the pointer", legacyHookSrc.includes("LEGACY SURFACE"));
  check("16px input floor untouched in the bar", barSrc.includes("fontSize: 16"));
}

await flush();
check("no unhandled rejections anywhere", unhandled.length === 0, unhandled.map(String).join("; "));

console.log(`\nhotfix25-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
