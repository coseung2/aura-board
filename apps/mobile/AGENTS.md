# Mobile (`apps/mobile/`)

- Run `rtk npm run typecheck` and `rtk npm run design:check`; before a signed
  Android build, run `rtk npx expo export --platform android --clear`.
- Follow `docs/mobile-android-build.md` for APK/AAB. Use
  `.codex\\scripts\\build-android.ps1` with dedicated ASCII
  `C:\\build-aura-board-android`; `apps/mobile/android` is generated, not
  source of truth.
