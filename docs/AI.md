# Fabric AI — model defaults (Cleanup 2)

Fabric's intelligence never asks the user for an API key. This page
documents where models come from, in the order they resolve.

## The default: in-browser

With nothing configured anywhere, Fabric thinks in the browser:
the composer's built-in interpreter and generative performance
templates answer requests on-device, and the ghost's brain is its
on-device decision table. No account, no key, works offline. This
is the product default and is presented that way — not as a
fallback for a missing key.

## Resolution order (one loader for every intelligence path)

`resolveLLMConfig()` in `src/ai/PatternComposer.ts` is the CLOUD
resolution, read by the pattern/recipe composers, the ghost
brain's cloud tier, and SAM:

1. **The user's own saved model** — AI Services
   (`fabric_ai_config_v1`), when enabled and carrying a key. A
   user's model always wins: it is their device and their choice.
2. **Fanalogy's built-in cloud** — locked in at build time (below).
3. **No cloud** — resolution falls through to the on-device tiers
   below. A request no path can shape is never captioned as an
   error or blamed on a missing key: the ghost answers in-world
   with puzzlement (a curious drift and a question-ripple), or the
   fabric ripples on its own when no ghost can act — Hotfix 2.4's
   living fallback.

## The on-device model tier (Slice 27)

Below the cloud sits a real language model that runs **on the
device itself**, in the browser over WebGPU — WebLLM (MLC), the
same library and pattern as Fanalogy's Conduit app ships in
production (`conduit/app/js/adapters.js`, its "On-device (WebLLM
over WebGPU)" adapter). `resolveBrainTier()` layers it over the
cloud resolution:

1. the user's saved cloud model → 2. Fanalogy's built-in cloud →
3. **the device's own model, when ready** → 4. the in-browser
interpreter / the ghost's decision table (the instant floor).

The contract that keeps it honest:

- **Never bundled, never silent.** The library loads by dynamic
  import from `https://esm.sh/@mlc-ai/web-llm@0.2.79` at first
  use; the weights (Llama 3.2 1B ≈ 700 MB by default; Qwen 2.5
  1.5B ≈ 1 GB and Llama 3.2 3B ≈ 1.8 GB are selectable in AI
  Services / Your Ghostie) download **once, only after an
  explicit yes** — the one-time consent ask, or the Download
  button on the brain card. The browser caches the weights
  afterwards; the model then works fully offline.
- **Nothing waits.** Consumers check readiness synchronously.
  Absent, downloading, or warming, every path falls through to
  the floor tiers exactly as before; a download is never started
  by a resolution, only by the user's yes.
- **Probed, not assumed.** The tier exists only where
  `navigator.gpu` answers. No WebGPU (older Safari/Firefox) →
  one honest line in AI Services and the floor tiers answer.
  (Firefox ships WebGPU from v141 on Windows; other builds
  vary — the probe decides.)
- **Private by construction.** Inference is local, so the seed,
  the Personality text, and every prompt stay on the device —
  there is no endpoint to send them to.
- **Same law, smaller brain.** The ghost's on-device deliberation
  consults the model with the same scenario schema, the same
  strict validator, and the same hard invariants (emit budgets,
  petting rules, the tool gate) as the Spark consult — prompts
  tightened, tokens capped, temperature low. Composers validate
  its JSON through the same gates as cloud output, and answers
  it authors are credited "Interpreted on this device" — the
  rule floor keeps its own distinct credit ("Interpreted
  on-device").

## The built-in cloud: build-time env vars

Three variables, set on the Vercel project (**fabx** → Settings →
Environment Variables, Production scope), then redeploy:

| Variable | Required | Default when unset |
|---|---|---|
| `EXPO_PUBLIC_FANALOGY_LLM_API_KEY` | yes — its presence turns the built-in cloud on | — (no built-in cloud) |
| `EXPO_PUBLIC_FANALOGY_LLM_BASE_URL` | no | `https://api.meta.ai/v1` |
| `EXPO_PUBLIC_FANALOGY_LLM_MODEL` | no | `muse-spark-1.3` |

When the key is present, the cloud tier is active out of the box:
AI Services shows "Fanalogy cloud — built in" (the key itself is
never displayed or editable in the app), the ghost's Spark tier
deliberates, the composer invents open-ended performances, and SAM
can segment. A user-saved model overrides it everywhere.

**Honest note:** `EXPO_PUBLIC_` values are inlined into the shipped
JavaScript bundle, so the key is *visible* to anyone who inspects
the bundle. That is acceptable for this demo key only because it
sits behind a hard spend cap on Fanalogy's Meta Model API account.
It is Fanalogy's deliberate call for the demo — not a pattern to
copy for uncapped keys.

## Local models and Tailscale endpoints

The AI Services endpoint field accepts `http://` and `https://`
URLs and any host — a LAN address, a `.local` name, or a tailnet
hostname. Example for a local OpenAI-compatible server (Ollama,
LM Studio, vLLM…):

```
http://your-pc.tailnet:11434/v1
```

One catch, and it is the server's setting, not Fabric's: the
browser will block the call unless your model server sends CORS
headers allowing the `https://fabric.fanalogy.com` origin (for
Ollama, that's its `OLLAMA_ORIGINS` setting). Fabric cannot set
that for you; the AI Services drawer repeats this hint under the
endpoint field.

## Release direction

The built-in cloud is the demo's bridge. The release direction is
models Fanalogy trained itself, running on device (WebGPU /
native), with cloud as an opt-in tier — the road now runs:
distilled decision table (the floor) → the downloaded on-device
model tier (Slice 27) → Fanalogy-trained MLC models dropped into
the same tier's model list when they ship.
