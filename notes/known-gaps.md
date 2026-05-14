# Known gaps

| Gap | Why deferred | Impact | Planned phase |
|-----|----------------|--------|----------------|
| Live Setu AA OAuth and webhooks | Requires Setu org credentials and documented consent flow in a deployed environment | Import fetch uses stub batch until wired | Phase 3+ hardening |
| PDF / Markdown annual export | PRD future export | Users have CSV only | Future |
| E2E Playwright suite | Timeboxed bootstrap; API + unit coverage first | Less full-browser regression signal | Add when auth flows stabilize |
| Email / push reminders | No provider chosen | In-app notification flags only | Phase 4+ |
