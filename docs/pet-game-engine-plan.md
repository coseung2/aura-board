# Pet World Game Engine Plan

## Status

This document records the intended direction only. It does not authorize
Production exposure or start an engine migration. Pet World remains
Preview-only until explicitly approved.

## Product Direction

Pet World should feel like entering a separate game rather than opening
another Aura Board settings page. The transition should hide the normal app
navigation and open a full-screen world with its own camera, audio, motion,
input, and pixel-art interface. Leaving the world returns the student to the
normal Aura Board shell.

## Recommended Stack

- Use Phaser for the 2D pixel-art game layer.
- Run Phaser directly in a dedicated web route.
- Run the same Phaser game inside an Expo DOM component/WebView on mobile.
- Keep authentication, currency, eggs, pets, upgrades, evolution, loadouts,
  reading rewards, and walking rewards in the existing server APIs and
  database.
- Keep native navigation, Health Connect, haptics, and app lifecycle handling
  in Expo and expose only narrow bridge actions to the game.

Three.js is reserved for a later 3D or 2.5D requirement. It is not the default
renderer for the current sprite-based game. Godot or Unity embedding is also
out of scope unless Pet World grows into a standalone real-time game whose
requirements justify a separate native build pipeline.

## Target Architecture

```text
Aura Board shell
  |-- web: /student/pets/world
  |     `-- Phaser canvas
  |-- mobile: /pets/world
  |     `-- Expo DOM/WebView -> shared Phaser game
  `-- server
        |-- existing student session
        |-- pet APIs
        |-- activity rewards
        `-- PostgreSQL/Prisma persistence

shared pet game
  |-- scenes
  |-- entities
  |-- animation systems
  |-- input adapters
  |-- API client
  `-- asset manifests
```

The game client must not become the source of truth for balances, hatch
results, enhancement, evolution, or rewards. It may animate optimistic state,
but server responses decide persisted outcomes.

## World and Scene Boundaries

Initial scenes:

1. Portal transition: enter and leave Pet World.
2. Home habitat: show the active five-pet loadout and ambient behavior.
3. Incubator: purchase eggs, display live progress, and play hatch reveals.
4. Dex: browse discovered forms and locked silhouettes.
5. Growth: enhancement and evolution presentation.
6. Buff panel: show individual contributions, type synergy, caps, and totals.

Normal Aura Board headers and tabs should not render inside these scenes. A
single unobtrusive exit control and native back handling are required.

## Shared Asset Contract

Source files may live outside the repository while being authored. Commit only
runtime exports and manifests.

```text
public/pets/
  rabbit.webp
  fox.webp
  turtle.webp

public/game-ui/
  incubator-egg.webp
  empty-nest.webp

game-assets/
  pet-atlas.json
  world-atlas.json
```

Rules:

- Preserve `.aseprite` source files outside the runtime asset folders.
- Export transparent, lossless WebP files.
- Use consistent frame dimensions, row order, animation names, and foot
  anchors across species.
- Store frame rectangles, duration, looping, and anchor metadata in an atlas
  manifest rather than hard-coding each species in components.
- Use nearest-neighbor scaling and integer display scales for pixel art.
- Web and mobile consume the same WebP and atlas contract.

## Mobile Bridge

Only serializable state crosses the Expo DOM/WebView boundary. Recommended
native actions:

- `exitPetWorld()`
- `triggerHaptic(kind)`
- `getWalkingSummary()`
- `openNativeSettings()` when required

Pet API calls can be made by the shared game client using the authenticated
Aura Board origin, or delegated through a narrow native bridge if cookie
handling requires it. Avoid mirroring the entire app store across the bridge.

## Delivery Phases

### Phase 1: Portal shell

- Add full-screen web and mobile routes.
- Add entry/exit transition and back handling.
- Load a static habitat and one WebP sprite atlas.
- Keep all existing pet management UI available as a fallback.

### Phase 2: Shared 2D runtime

- Add Phaser scenes, camera, input, animation state, audio, and resize logic.
- Connect read-only pet home data.
- Verify consistent behavior on desktop web, mobile webview, Android, and iOS.

### Phase 3: Interactive loops

- Move incubation, hatch reveal, loadout, enhancement, and evolution
  presentation into game scenes.
- Continue using server-authoritative APIs and idempotency rules.
- Add native haptics and lifecycle pause/resume.

### Phase 4: Polish and performance

- Add particles, scene transitions, sound settings, reduced-motion handling,
  texture atlases, and device performance tiers.
- Measure cold start, memory, frame rate, and low-power behavior before
  expanding the world.

## Acceptance Gates

- Pet World is enabled only in the configured Preview environment.
- Production navigation and APIs remain gated off.
- Web and mobile use the same species IDs and server contracts.
- Backgrounding the mobile app pauses rendering and never duplicates rewards.
- Re-entering a scene reloads authoritative state without losing progress.
- Missing assets fail gracefully without breaking navigation.
- A low-end supported device remains responsive with five active pets.

## Explicit Non-goals for the First Version

- Open-world movement or combat
- PvP or real-time multiplayer
- Client-authoritative currency or random results
- Native Three.js/WebGPU builds
- Embedded Unity or Godot runtime
- Separate mobile and web game rules
