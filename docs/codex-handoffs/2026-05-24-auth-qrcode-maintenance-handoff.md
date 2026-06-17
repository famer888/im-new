cd# Codex Handoff - Auth QRCode + Maintenance (2026-05-24)

## Reactivation Prompt

```text
We are continuing from this handoff. Read this document first, inspect the current repo state, verify what still applies, and continue from the next steps without assuming the old chat context is available.
```

## Context

- Repo/path: `/Users/diannao/Documents/project/im（老项目）以及im-new（新项目【要重构项目】）/im-new`
- Branch: `test`
- Related chat/session: auth QRCode login + keep-codex-fast maintenance setup
- Current goal:
  - Keep auth/desktop-related work continuous while reducing Codex local-state bloat safely.
  - Apply maintenance only after confirming active-chat handoffs are ready.
- User preferences or constraints:
  - Default edit scope is `im-new` only.
  - Keep behavior aligned with old `im` project.
  - Prefer minimal, safe changes and avoid unrelated refactors.

## What Changed

- Installed custom skill `keep-codex-fast` under local Codex skills directory.
- Ran first health check in report mode (read-only, no writes).
- Prepared this repo-local handoff document for continuity before any archiving/apply action.

## Files Touched Or Investigated

- `/Users/diannao/.codex/skills/keep-codex-fast/SKILL.md`
- `/Users/diannao/.codex/skills/keep-codex-fast/scripts/keep_codex_fast.py`
- `/Users/diannao/.codex/skills/keep-codex-fast/references/handoff-template.md`
- `/Users/diannao/Documents/project/im（老项目）以及im-new（新项目【要重构项目】）/im-new/src/modules/auth/components/QRCodeLogin.vue` (active focus)
- `/Users/diannao/Documents/project/im（老项目）以及im-new（新项目【要重构项目】）/im-new/src-tauri/src/window/tray.rs` (open context)

## Commands And Checks Already Run

- `python3 ~/.codex/skills/keep-codex-fast/scripts/keep_codex_fast.py`
  - Mode: `report` (read-only)
  - Key output summary:
    - active sessions: `1.284 GB`
    - archived sessions: `0.000 GB`
    - old session candidates: `165` (`0.769 GB`)
    - logs: `745.5 MB`
    - extended Windows paths: `0`
    - metadata repair candidates: `31`
- `git status --short` in repo root
  - Modified: `.cursor/rules/im-alignment.mdc`, `.gitignore`
  - Untracked: `AGENTS.md`, `BUILD_GUIDE.md`, `image-1.png`, `image.png`, and two Chinese-named markdown files.
- `ps -axo pid,comm,%cpu,%mem | rg -i 'node|vite|tauri|pnpm' | head -n 12`
  - Node processes found: 5 (low CPU/memory footprint at check time)

## Known Issues

- Codex local logs are relatively large (`~745 MB`).
- Thread display metadata bloat exists (title/preview over-limit candidates reported).
- No archived sessions yet, so history cleanup has not started.

## Open Decisions

- Whether to run maintenance apply now:
  - `--apply --archive-older-than-days 10 --worktree-older-than-days 7`
- Whether to also run optional metadata repair:
  - `--apply --repair-thread-metadata-bloat`
- Which active old chats must stay accessible (and need more detailed handoffs) before archiving.

## Top Session Handoff Priority

- Recommended handoff order: `2,4,5,6,7,9,1,10,3,8`
- Priority logic:
  - First: build/release and core chat behavior contexts.
  - Then: feature and bug-analysis contexts.
  - Last: generic/low-signal contexts.
- Candidate list (largest sessions):
  1. `36.2 MB` (high) `pnpm tauri:build:mac` build error context.
  2. `27.3 MB` (high) Group image send failure and receive-garbled troubleshooting.
  3. `22.1 MB` (high) Post-exit-group visibility issue.
  4. `22.0 MB` (high) Group notification display behavior.
  5. `21.6 MB` (high) Burn-after-reading background logic integration in `im-new`.
  6. `19.2 MB` (high) Apple/Windows installer packaging context.
  7. `38.4 MB` (high) Group right-click open-directory proposal context.
  8. `17.2 MB` (medium) Single-chat right-click save-as menu check.
  9. `34.5 MB` (medium) Trigger-path analysis context.
  10. `21.0 MB` (low) Generic greeting thread, confirm business value before handoff.

## Next Steps

1. Review active old chats and mark which ones still matter.
2. Add/complete handoff docs for those important chats (same folder recommended).
3. Close Codex, or use `--wait-for-codex-exit` if you want script-side wait.
4. Run apply maintenance:
   - `python3 ~/.codex/skills/keep-codex-fast/scripts/keep_codex_fast.py --apply --archive-older-than-days 10 --worktree-older-than-days 7`
5. Re-run report mode to verify changes.
6. If metadata bloat remains meaningful, decide whether to opt into repair.

## Do Not Touch / Be Careful

- Do not run `--apply` until handoffs for important chats are confirmed.
- Do not delete sessions/worktrees/logs manually; this workflow archives instead.
- Keep `im-new` as default code-change target; do not modify `im` unless explicitly requested.
