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

`resolveLLMConfig()` in `src/ai/PatternComposer.ts` is read by the
pattern/recipe composers, the ghost brain's cloud tier, and SAM:

1. **The user's own saved model** — AI Services
   (`fabric_ai_config_v1`), when enabled and carrying a key. A
   user's model always wins: it is their device and their choice.
2. **Fanalogy's built-in cloud** — locked in at build time (below).
3. **No cloud** — the in-browser default above. A request the
   built-in interpreter can't shape is captioned honestly
   ("That one's beyond the built-in interpreter"), never blamed on
   a missing key.

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
native), with cloud as an opt-in tier — the ghost's on-device brain
is already the default, and the distilled decision table is the
first step of that road.
