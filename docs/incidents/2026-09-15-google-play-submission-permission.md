# Google Play closed-testing submission permission failure

- Date: 2026-09-15 KST
- Symptoms: EAS submission `10083d94-f873-420b-a89e-397606984ae5` was rejected before uploading Android 1.0.15 versionCode 47 to the `alpha` track.
- Impact: The signed production AAB was built successfully, but the closed-testing release was delayed.
- Timeline: EAS build `bcd70cb3-8188-47fc-9af2-0e6d909f0a25` completed at 05:20 KST. The submission was scheduled immediately and then rejected by Google Play.
- Evidence: EAS reported that the configured service account was missing the app permissions required to submit to Google Play.
- Confirmed cause: The service account stored on EAS did not have sufficient Google Play Console permissions for `com.auraboard.app`.
- Response: Added a submit-only workflow path that reuses the successful EAS build and the release service account managed in the GitHub Production environment.
- Recovery verification: Pending successful upload of versionCode 47 to the `alpha` closed-testing track.
- Follow-up: Verify Google Play Console app permissions whenever the release service account changes, before scheduling a store submission.
