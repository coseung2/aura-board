# ADB enumeration stall

- Date/time: 2026-09-12 20:36–20:46 KST (Asia/Seoul).
- Symptom: `adb devices -l` hung. Earlier reporting incorrectly inferred disconnected devices from this timeout.
- Impact: physical-device qualification was delayed; no evidence justified a USB-disconnected claim.
- Evidence: Windows PnP reported two healthy Samsung USB composite devices and two ADB interfaces. TCP 5037 belonged to ADB server PID 23416; several enumeration clients were waiting.
- Response: restarted only the identified ADB server, then restored device reverse mappings for ports 3000, 8081 and 8787.
- Recovery: ADB returned S23 R3CW50BW8KB and A20 R59M904MEMY as `device`. Both reopened the existing Omok match. Next and Rust test services were restored through the existing Infisical supervisor; health checks passed.
- Cause: ADB server nonresponse is confirmed at the service boundary; the underlying reason for its stall remains unknown.
- Follow-up test: a confirm during Rust restart at 20:45:27 produced pending layout and settled at authoritative version 25 at 20:45:32. This demonstrates in-flight recovery, not proof of input rejection after disconnect detection. Native-paint percentiles and the restart input-gate check remain open.
- Prevention: distinguish transport timeout from absent hardware; inspect PnP and the ADB listener before reporting disconnected devices. Preserve existing Metro and the DB SSH tunnel.
