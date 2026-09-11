# Fixed-deposit maturity delay

- Date: 2026-09-11 KST.
- Symptom: deposits maturing on September 10 remained active the following morning.
- Confirmed evidence: host timezone Asia/Seoul; cron file contains CRON_TZ=UTC and `5 15 * * *`; journal records the task at September 10 15:05 KST, not the intended 00:05 KST.
- Cause: actual scheduler execution timezone differed from the UTC assumption. Deposits maturing after the daily sweep waited for the next afternoon.
- Impact: inspected three deposits remained active without payout; principal and interest were not lost. No student identifiers are included here.
- Response: change only fd-maturity to `0 * * * *`, checking elapsed maturity timestamps every hour. Existing transactional claim prevents duplicate payout.
- Recovery: operating schedule changed to `0 * * * *` on September 11 KST. Existing maturity worker ran successfully at 11:55:48 KST. Readback confirmed all three inspected deposits were matured and their payouts were 114, 11 and 22 (total 147), with one maturity transaction each.
- Follow-up: audit other daily schedules separately; verify the next automatic hourly run. Do not infer that CRON_TZ is honored from the configuration line alone.
