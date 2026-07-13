# Yjs Prototype

Minimal echo test for the Yjs candidate. Not production.

## Run

```bash
npm install
YJS_PORT=3201 npm run server &       # starts y-websocket server
YJS_PORT=3201 npm run bench           # runs 2-client bench
```

Emits a JSON blob with `cold_start_ms`, `card_move_payload_bytes`,
`echo_latency_ms.{p50,p95}`, `heap_used_mb`, `rss_mb`.

## Why 3201?
Port 3000 is the Aura-board dev server; 3100/4000 are reserved for local
realtime experiments.
Port 3201 is picked to avoid collisions within this research sandbox.
