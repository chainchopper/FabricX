# Built-in character assets — drop the GLBs here

The Dancer Stage's built-in character, **Trauma**, loads its GLBs
from this folder at runtime (same-origin static files, lazy-loaded
by URL — never bundled; see `src/dancer/traumaCharacter.ts` and
`docs/DANCER.md`). Expected files:

| File | Contents |
| ---- | -------- |
| `trauma-mma-idle.glb` | Trauma (Mixamo) + MMA idle clip, ~5.0 s loop |
| `trauma-bouncing-fight-idles.glb` | Trauma (Mixamo) + Bouncing Fight idle clip, ~2.97 s loop |

Each file is the full skinned character AND its idle animation in
one. Until a file is here, binding that idle in the stage's THIS
LAYER settings reports "failed" and the mannequin keeps the
stage — nothing breaks, the character simply isn't home yet.
