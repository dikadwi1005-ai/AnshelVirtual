# Asset art pass — 15 November 2026

## Scope implemented

- **12 employee homes:** stable per-division facade colors, trim, threshold accents and small geometric marks, with matching living-room rug accents. Each variant is computed using the stable employee division ID, not the order of homes or the temporary position of a parcel. No new GLB download, license, material texture, collision or navigation state.
- **City vehicle presentation:** district GLB vehicles now use aspect-preserving `contain` fitting instead of stretching each axis independently. Authored house and district building geometry retains the original exact-size `stretch` behavior, because doorways and navigation depend on those footprints. Existing motor fallback remains procedural.
- **Asset integrity:** the automated suite now rejects assets shipped under `public/models` without an `ASSETS.json` entry and continues validating each file's CC0 license, source and SHA-256. Existing character clip checks remain in place.
- **Regression tests:** check 12 distinct home color identities, fascia dimensions and door clearance as well as car model ratio and ground anchoring.

## Explicitly not claimed

- A green test proves file integrity and deterministic geometry, **not** final visual quality. No fresh full 21-room/12-house camera audit or physical-phone screenshot was performed in this checkpoint.
- Original Kenney meshes and 3D animation clips are unchanged. Character facial expressions, more varied bespoke architecture, texture authoring, vehicle parking animation, collision refinement, and long-duration performance QA remain separate work.
- No new third-party asset was added. Use `docs/asset-licenses.md` and `ASSETS.json` as the provenance manifest. Do not alter published Telegram, n8n, tasks, or Nation City.

## Acceptance / manual visual follow-up

In the running application, compare the twelve home entrance frames and living room accents at daylight/night and in cutaway, especially the wider type-i house doorway. Check that cars keep believable proportions while staying within lane markings; their **collision envelopes remain unchanged**. Inspect any decorative clipping before calling this an accepted final art pass.
