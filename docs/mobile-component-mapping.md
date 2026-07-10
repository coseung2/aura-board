# Mobile Component Mapping

Updated: 2026-07-10

The web app remains the source of truth. This file maps web UI patterns to
mobile components so mobile parity work happens through shared primitives
instead of route-local patches.

| Web pattern | Web source | Mobile primitive/component | Migration rule |
|---|---|---|---|
| Page canvas | `body`, `.home-page`, `.board-page` | route `SafeAreaView` using `colors.bg` | No route-local background colors. |
| Logo lockup | `Logo` / app icon usage | `LogoLockup` | Use real app icon, not emoji marks. |
| Top/board header | `TopNav`, `BoardHeader` | `AppHeader`, `BoardHeader` | Use tokenized surface, border, compact title scale, and shared back button treatment. |
| Card surface | `.board-grid-card`, `.grid-card`, `.stream-post` | `SurfaceCard` | No local shadow/elevation recipes. |
| Primary button | `.btn-primary`, modal submit buttons | `AppButton variant="primary"` | Use `colors.accent` and `colors.onAccent`. |
| Secondary button | `.btn-secondary`, quiet actions | `AppButton variant="secondary"` or `quiet` | No local border/radius values. |
| Icon button | close, back, settings, menu | `IconButton` | Icon-only buttons use shared hit area and pressed state. |
| Inline control row | bordered link/file/radio rows | `ControlPressable` | Use for pressable rows inside cards or sheets that should not become nested cards. |
| Media press target | image/lightbox/backdrop taps | `MediaPressable` | Use only for full-bleed media hit areas where button chrome would be wrong. |
| Badge/chip | author chips, status chips, counters | `Pill` | Use semantic tones: neutral/accent/danger/warning/submitted/reviewed. Returned/rejected states use `danger`. |
| FAB | `.add-card-fab` | `Fab` | One floating action recipe across boards. |
| Modal | `.add-card-modal`, detail modals | `AppModal` | Use `colors.overlay`, `SurfaceCard`, tokenized close button, shared accessibility defaults, and `align="right"` for side panels. |
| Card detail | `CardDetailModal` web patterns | `CardDetailModal` mobile | Keep media full-bleed, controls tokenized. |
| Board cards | `Dashboard` board cards | student/parent board list card components | Use board thumbnails/layout metadata where available. |
| Student navigation | web student dashboard navigation | `StudentBottomNav`, `StudentNotificationButton` | Production items are board, portfolio, wallet, reading, Canva, notifications, plus assigned duties. |
| Parent navigation | web parent bottom navigation | `ParentBottomNav` | Keep `home / notifications / add / account` identical; showcase is not a production route. |
| Card board | `GridBoard`, freeform grid card style | `CardsBoard`, `ReadOnlyCardsBoard`, `CardView` | Masonry/grid density should not become oversized single-column on tablet. |
| Topic board | `ColumnsBoard` | `ColumnsBoard` | Preserve horizontal column scanning on tablet. |
| Stream board | `StreamBoard` + FAB composer | mobile stream/read-only path | Posting should use the shared `Fab` pattern. |
| Plant journal | `PlantRoadmapBoard` web | `PlantRoadmapBoard` mobile plant components | Timeline and stage cards must share surface tokens. |
| DJ board | `DJBoard` | `DJQueueBoard`, `DJRecapModal` | Now-playing, queue, and side panels map to `SurfaceCard` and `AppModal`. |
| Question board | `QuestionBoard` | `QuestionBoard` | Snapshot, response submission, silent refresh, retry states. |
| Assessment | assessment student flow | `AssessmentBoard` | Bootstrap, answer save, timer, final submit. |
| Word/game boards | Kordle, Speed Game, Shadow Alliance | `KordleBoard`, `SpeedGameBoard`, `ShadowAllianceBoard` | Preserve role visibility, secret-word filtering, polling/realtime, and final states. |
| Event signup | public event application | `EventSignupBoard` | Render the same web form in an origin-restricted in-app WebView. |
| Breakout | breakout columns and membership | `BreakoutBoard` + `ColumnsBoard` | Server-provided visible and writable section IDs are authoritative. |
| Drawing | web drawing studio/gallery | `DrawingBoard` | Native canvas saves through student-assets and reloads the class gallery. |
| Student inspection | web cleaning/shoes role pages | `StudentInspectionScreen` | Preserve findings and photo upload round trips; shoes remains photo-free. |

## Modal Exceptions

Raw React Native `Modal` is reserved for full-screen media or sandbox surfaces
where `AppModal`'s centered/sheet semantics are the wrong abstraction:

- `CardDetailModal`: full-bleed card detail and lightbox media viewer.
  Non-media actions inside it should still use shared primitives.
- `ImageLightbox`: full-screen plant observation image viewer.
- `VibeArcadeBoard` play modal: full-screen WebView sandbox.

Every other sheet, dialog, drawer, or side panel should use `AppModal`.
Every pressable control should use `SurfacePressable`, `ControlPressable`,
`MediaPressable`, `AppButton`, `IconButton`, `Fab`, or a domain component that
wraps one of those primitives.

## Ownership Boundaries

- `apps/mobile/theme/tokens.ts`: RN port of web CSS variables and semantic
  platform constants.
- `apps/mobile/components/ui.tsx`: shared primitives only. No route-specific
  copy, layout data, or API behavior. Shared controls own tap targets and
  pressed states so screens do not recreate hit areas locally.
- `apps/mobile/components/*`: reusable app components and board primitives.
- `apps/mobile/components/layouts/*`: layout-specific board experiences.
- `apps/mobile/app/**`: routing, data loading, and composition only.

When a route needs a new visual treatment, add or extend a shared component
first. Route files should not be the place where new visual recipes are born.
