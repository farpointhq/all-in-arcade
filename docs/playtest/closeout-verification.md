# Issue #24 — Close-out verification record

Final verification record for the meta playtest cascade (issue #24, twin #4):
fleet tracker, regression-suite verdicts, and the 15-level boot smoke for the
close-out of the full-game hardening cascade.

Run: 2026-09-22, close-out driver worktree `tmp_worktree/issue-24`
(`fix/issue-24`), serve port `8624` (`8600 + (24 % 200)`) with
`--host 127.0.0.1`. Small artifacts only (JSON verdicts + JPEG stills) —
no regenerated sheet PNGs (evidence-bloat policy).

## Baseline audit — sub-issue fleet tracker

Snapshot **2026-09-22T20:20Z**. Baselines: `origin/main` = `22dc288` at audit
end (was `8f5ede5` at audit start — the 20:11–20:15Z auto-merge wave landed
PRs #30/#34/#35/#36/#41 mid-audit). Branch columns: tip vs `origin/main` at
audit start. "Testing" links to the deployed plans-repo report.

| # | Sub-issue (short) | Prio | Issue | Branch tip (local = remote unless noted) | vs main | PR | Merged as | Testing report |
|---|---|---|---|---|---|---|---|---|
| 6 | Rewind Gate never flips (good-bot regression) | high | open | `1b7dd61` **local-only** (no remote ref), 2.5h stale | +2 / −7 | — | — | (none — pre-PR) |
| 7 | nano-cure live-vs-sims divergence (boss death) | high | open | `3d9fbd3` **local-only** (no remote ref), 2.5h stale | +4 / −9 | — | — | (none — pre-PR) |
| 8 | maze autopilots lose — wrap-blind threat distance | high | open | `6288a11` (remote ref absent; PR head live) | +7 / −7 | **#42 open** (updated 20:15Z) | — | [issue-8-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-8-testing/) |
| 9 | corrupt v1 save black-screens boot | high | closed | — | — | #28 | `d8e0703` | [issue-9-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-9-testing/) |
| 10 | auto-pause on blur/hidden tab | high | closed | — | — | #23 (+ #34 boot-race hardening) | `b9acc2b` (+ `decf27b`) | [issue-10-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-10-testing/) |
| 11 | booth logo assets missing (boot 404s) | high | closed | — | — | #26 | `79bf03d` | [issue-11-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-11-testing/) |
| 12 | Death Star Run inverted climb mapping | high | closed | — | — | #29 | `8f5ede5` | [issue-12-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-12-testing/) |
| 13 | DPR resize blur | medium | closed | — | — | #22 | `e1b4fe9` | [issue-13-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-13-testing/) |
| 14 | survival volley heart-bank drain (~33s) | medium | closed | `20307c0` | +? | #41 (merged 20:15:30Z) | `7a1f698` | [issue-14-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-14-testing/) |
| 15 | HUD collision + legibility sweep | medium | closed | remote `8886595`; local `b87d978` (post-merge E2E round in flight) | +? | #30 (merged 20:11:40Z) | `47432aa` | [issue-15-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-15-testing/) |
| 16 | bilingual + FTUE sweep | medium | open | `00874de` | +5 | **#31 open, DIRTY** (conflicts with main; quiet since 19:16Z) | — | [issue-16-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-16-testing/) |
| 17 | kiosk intake hardening | high | closed | — | — | #27 | `0e879b6` | [issue-17-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-17-testing/) |
| 18 | AudioContext unlock + element pool hardening | high | closed | — | — | #25 | `7128d62` | [issue-18-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-18-testing/) |
| 19 | genre `exit()` teardown never runs (latent leak) | low | closed | `ad99d61` | +? | #36 (merged 20:15:23Z) | `a64fc0a` | [issue-19-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-19-testing/) |
| 20 | contrast sweep (snow pickups, hero in clouds) | medium | closed | `7ce6f22` | +? | #35 (merged 20:15:18Z) | `c7d2b0c` | [issue-20-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-20-testing/) |

**Audit notes**

- **12/15 merged** at audit time; the plan's snapshot (7/15 + PR #30 + 7 in
  flight) was overtaken by the 20:11–20:15Z auto-merge wave from the live fix
  tabs. Remaining: **#6, #7** (PR-less, branches look complete but 2.5h
  stale), **#8** (PR #42 open — its fix tab was live at 20:15Z), **#16**
  (PR #31 open but dirty).
- **Siblings are live.** Fleet tabs hold `8600 + (issue# % 200)` ports and are
  still committing (e.g. `fix/issue-15` local `b87d978` at 20:15:14Z = a
  post-merge E2E round). Close-out drain is strictly **one sub-issue at a
  time**, re-checking PR/branch state immediately before each action, so a
  sibling that lands its own PR first is skipped, not raced.
- **Drain order** (plan's order, adapted to live state): bookkeeping for the
  12 merged → #6 → #7 → #8 (re-check PR #42) → #16 (resolve PR #31 conflicts).
  Both PR-less branches carry complete TDD arcs (fix + regenerated rig
  evidence), so per the plan they take the *verify → PR → squash-merge* lane,
  not the re-spawn lane (re-spawning a tab into a populated branch/worktree
  would collide with the existing work).
- No sub-issue carried a `Fixed in #<PR>` comment at audit time (the fix tabs
  merged but skipped the comment step) — close-out adds them.
- Out-of-fleet follow-ups (do **not** block close-out; filed by later E2E
  passes): #32 fatal-overlay XSS, #33 kiosk head-of-line blocking, #38/#39
  star-racer findings, #40 rig hardening (requestfailed gate, `--mute-audio`
  in sims, single-logo fallback).
- New-level work (issue #3, `level/miray-kavruk-world-tour`) is active in the
  main checkout and out of scope here.

## Bookkeeping lane

Filled in as checklists are ticked on #24 and #4 (see the meta-issue bodies;
tick format carries `Fixed in #<PR>` + testing-report URL).

## Regression sweep

Filled in after each merge during the drain (see "Drain log").

## Drain log

Filled in per sub-issue during the fleet lane.

## Close-out verification pass

Filled in at the end: full 15-level rig run + 15/15 boot smoke + static
booth-rule pass.
