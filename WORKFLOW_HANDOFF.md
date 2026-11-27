# Workflow handoff

- Canonical handoff: https://github.com/pyw31337/macmini-workflow-handoff
- Read the canonical repository `AGENTS.md` and latest `inventory/workflows.json` before changing automated jobs.
- Any change to `.github/workflows/`, collection cadence, deployment triggers, secrets names, or local scheduler replacements must update this file and the canonical handoff repository in the same change.
- Never commit secret values, `.env` files, tokens, cookies, or machine-specific paths.

The authoritative workflow files remain in this repository under `.github/workflows/`. GitHub-hosted Actions do not depend on the old Mac.

## Recent workflow changes
- **2026-11-27 (`fix/youtube-deep-collection`)**:
  - `.github/workflows/shorts-sync.yml`: Moved daily cron from `40 19 * * *` (04:40 KST) to `40 21 * * *` (06:40 KST) to avoid `letscamp-data-publish` queue eviction by `Data sync`, and added `sync-youtube-facts.mjs` to extract campground facts from YouTube descriptions and transcripts.
- **2026-11-26 (`fix/data-sync-timeout-and-monitoring`)**:
  - `.github/workflows/data-sync.yml`: Raised job `timeout-minutes` from `90` to `180` to prevent daily `Sync web mentions` cancellations, and capped `Fill review thumbnails` (`REVIEW_FILL_MAX=2500`, step `25m`) and `Sync web mentions` (`SEARCH_MINUTES=12`, `BODY_MINUTES=15`, step `35m`) so the full pipeline finishes and publishes daily.
  - `.github/workflows/quality-supervisor.yml`: Scheduled twice daily (`17 10 * * *`, `17 22 * * *` UTC), expanded detection from 24h `failure`-only to 72h + consecutive `failure|cancelled|timed_out` across non-PR runs, and added automatic GitHub Issue creation/comment/close on alerts.
  - `pipeline/scripts/daily-brief.mjs`: Included `cancelled` and `timed_out` in daily brief failure reporting.
