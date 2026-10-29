# Built-in character assets — how Trauma's bytes live here

The Dancer Stage's built-in character, **Trauma**, loads from this
folder at runtime (same-origin static files, lazy-loaded only when
the stage binds him — never bundled; see
`src/dancer/traumaCharacter.ts` and `docs/DANCER.md`). Each asset
is the full skinned character AND its idle animation in one GLB:

| Character | Contents |
| --------- | -------- |
| Trauma — MMA idle | Mixamo character + MMA idle clip, ~5.0 s loop |
| Trauma — Bouncing fight idles | Mixamo character + Bouncing Fight idle clip, ~2.97 s loop |

## The two forms

**Raw form (wins when present):**

| File | 
| ---- |
| `trauma-mma-idle.glb` |
| `trauma-bouncing-fight-idles.glb` |

A real binary at either path is loaded directly and the encoded
form is never touched. This is the form to use if the files are
ever placed here by a binary-capable route (web upload, a local
clone push).

**Encoded transport (what is actually committed):** the repo's
automated write path is text-only — it cannot commit binaries —
so each GLB also ships as base64 TEXT, split into sequential
≤900 KB parts:

```
trauma-mma-idle.glb.b64.00 … trauma-mma-idle.glb.b64.07            (8 parts)
trauma-bouncing-fight-idles.glb.b64.00 … .b64.07                   (8 parts)
```

(A single unsplit `….glb.b64` file is accepted too; the loader
tries it before the parts.)

On a built-in bind the app resolves bytes in order: raw `.glb`
first, then the transport — parts fetched in order until one is
absent, concatenated, base64-decoded in the browser (chunked),
and parsed in memory. SHA-256 of the decoded bytes, verified
against the originals at commit time:

- MMA idle: `4bc7c8e8a578cc2601564499c7c2667910d2f2b97ca29a43628aa069c0c16160`
- Bouncing fight: `c1d27e5a26ea25497bdd20a7b4cf82c7d142a141e4b569e15a888cd9e71ee6bf`

## Regenerating the parts

From a binary-capable machine, for each GLB (76-column wrap,
900,000-byte parts, two-digit suffixes):

```sh
base64 -w 76 trauma-mma-idle.glb > trauma-mma-idle.glb.b64
split -b 900000 -d -a 2 trauma-mma-idle.glb.b64 trauma-mma-idle.glb.b64.
```

Until decodable bytes are in place, binding that idle in the
stage's THIS LAYER settings reports "failed" and the mannequin
keeps the stage — nothing breaks, the character simply isn't
home yet.
