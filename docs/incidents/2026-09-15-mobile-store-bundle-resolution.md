# Mobile store bundle resolution failure

- Date: 2026-09-15 KST
- Symptoms: EAS iOS build `2c630aee-45ab-4bb2-a26a-8dfea0ac642f` failed during `expo export:embed`; Metro could not resolve `src/lib/pets/catalog-shop.ts` from the mobile app.
- Impact: iOS production submission was delayed. The Android build using the same source was canceled before execution.
- Timeline: The iOS build failed at 04:31 KST. The shared catalog was confirmed present in the uploaded source, and the Metro workspace configuration was added and verified locally before retrying.
- Evidence: The EAS `EAGER_BUNDLE` log reported `Unable to resolve module ../../../src/lib/pets/catalog-shop` from `apps/mobile/lib/game-participant-pet-projection.ts`.
- Cause: The mobile app imported a canonical module outside `apps/mobile`, but Metro had no monorepo workspace root in `watchFolders` or root dependency lookup path.
- Response: Added `apps/mobile/metro.config.js` with the repository root as a watch folder and both mobile and root `node_modules` resolution paths.
- Recovery verification: `npx expo export --platform ios` and `npx expo export --platform android` both completed and bundled the full app successfully.
- Follow-up: Keep cross-workspace imports covered by local iOS and Android export checks before requesting store builds.
