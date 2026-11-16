# Stage 3 — Avatar 3D motion and interaction art pass

Checkpoint: 16 November 2026.

## Shipped changes

- **12 existing staff rigs are preserved.** The same approved Kenney character GLBs, skeletons, stable profile IDs, outfit dyes and body sizes remain; no avatar replacements or third-party model downloads.
- **Contextual gesture variety:** the 12 employee indices select stable variants of standing speech (3 variants), seated speech (2 variants), and desk attention (2 variants), with an occasional idle head glance. Variants are generated from each rig's already-approved animation tracks. Replay frame animations use clip names already stored in the existing capture fields; no database migration required.
- **Smoother hand-held items:** phone, book, cup, snack, delivery parcel and gamepad positions are anchored to measured bone hand points. The first visible frame snaps to the correct grip; subsequent frames ease tiny changes to avoid visible snapping when an animation crossfades. Invisible props reset their attachment state. Replay seeks remain exact by using a zero-step snap.
- **Motion update cadence:** walking and seating transitions target 30 Hz; active hand/voice gestures target 24 Hz when not focused; idle distance samples target 15 Hz; near-camera actors update on each simulation step. This is a compromise between visible animation smoothness and the existing 12-character GPU budget, not a measured frame-rate guarantee.
- **Mouth morph smoothing:** the existing shape timeline now eases viseme changes per frame with bounds, without modifying TTS or pretending to provide real phoneme detection. Voice stop and speaker changes still close the mouth.
- **Regression tests:** ensure stable per-employee gesture selection, animation rate, prop snap/ease/release and safe bounded visemes.

## Remaining acceptance gates

- Fresh browser recordings comparing sitting/standing, speaking, desk, phone, coffee, book, courier parcel and gamepad on all 12 employees; verify feet, hand contacts and furniture clipping at near zoom and both camera modes.
- Model quality and face geometry remain based on existing Kenney GLBs. This is **not** a replacement rig nor true audio phoneme lip-sync, and facial animation is still limited by the mesh's supported morph regions.
- Long-session performance, GPU time, and physical Android/iPhone Safari checks were not covered by source-level tests.
- Future high-fidelity model replacement requires explicit, rig-compatible asset sources, provenance/license validation, updated character skeleton QA, and browser visual acceptance.

No changes to Nation City, Telegram/n8n, task states, worker schedules or database schema.
