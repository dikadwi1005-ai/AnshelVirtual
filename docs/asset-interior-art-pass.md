# Anshel 3D interior asset art pass — 15 November 2026

This is a visual-code checkpoint, **not a declaration of final visual acceptance**.

## Implemented

1. **Office (21 rooms):** deterministic, low-profile entrance floor inlays pick up each room's existing color theme. Rooms with a real rear partition also get a compact wall-mounted acoustic/plaque trim. Open rooms without a back partition get no floating wall panels. The decorative geometry is non-interactive and never enters the obstacle or navigation map.
2. **Homes (12 employees):** reusable framed rear-wall art references the stable employee ID and the palette introduced in the preceding art pass. The number of art marks varies by profile. Details stay above walking height, inside the interior wall boundary, and are excluded from collision.
3. **Rendering/performance:** all details use existing local procedural geometry and materials, batched through the existing neighborhood instancing and office static batching pipeline. There are no new GLB, textures, dependencies, remote network requests or license changes.
4. **Automated acceptance:** checks that every room gets two low-profile floor accents; wall art is present only where a partition exists; all detail bounds remain within room/home coordinates; the 12 staff-home identities stay distinct and deterministic.

## Left open

- This checkpoint does **not** replace Kenney employee GLB rigs or create new copyrighted third-party assets.
- Actual browser screenshots, physically tested iPhone performance, full collision tests for animated hands with furnishings, long-soak profiling, bespoke furniture/lighting redesign, and personal vehicle interactions still require separate verification.
- The visual accents are deliberately small changes to the current world, not a full graphics overhaul. No Nation City, Telegram, n8n or Production task state is touched.

For full approval, inspect rear wall details (especially room lighting and bookcases) and decorative wall art in 12 homes during interior/cutaway mode and at day/night. Confirm there is no floating trim or obvious clipping at the doorways before describing the result as final quality.
