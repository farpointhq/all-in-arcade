# Close-out verification — playtest cascade (issue #24 / #4)

**Run:** 2026-09-22, close-out driver chat. **Post-merge main under test:** `eb7b79b`.
**Ports:** 9607 (repro), 9671/9672 (before/after), 9700 (sweep + post arm), 9701 (pre-#48 arm), 9702 (pre-#47 arm) — all `--host 127.0.0.1`.

## 1. Fleet tracker (final — 15/15 merged)

| # | Problem | Fix PR (squash sha) | Testing report | Status |
|---|---------|--------------------|----------------|--------|
| 6 | Rewind Gate never flips (good-bot regression) | #46 (`4e58127`) | [issue-6-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-6-testing/) | merged |
| 7 | nano-cure live-vs-sims divergence — boss death | #48 (`eb7b79b`) | [issue-7-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-7-testing/) | merged (landed by close-out) |
| 8 | maze autopilots lose every run — wrap-blind threat distance | #42 (`22dc288`) | [issue-8-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-8-testing/) | merged |
| 9 | corrupt v1 save black-screens boot | #28 (`d8e0703`) | [issue-9-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-9-testing/) | merged |
| 10 | auto-pause on blur/hidden tab (+ boot-race follow-up #34 `decf27b`) | #23 (`b9acc2b`) | [issue-10-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-10-testing/) | merged |
| 11 | booth logo assets missing (2 boot 404s) | #26 (`79bf03d`) | [issue-11-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-11-testing/) | merged |
| 12 | Death Star Run inverted climb mapping | #29 (`8f5ede5`) | [issue-12-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-12-testing/) | merged |
| 13 | DPR backing-store rescale (blur after zoom) | #22 (`e1b4fe9`) | [issue-13-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-13-testing/) | merged |
| 14 | survival volley heart-bank drain | #41 (`acf8584`) | [issue-14-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-14-testing/) | merged |
| 15 | HUD collision + legibility sweep (6) | #30 (`47432aa`) | [issue-15-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-15-testing/) | merged |
| 16 | bilingual + FTUE sweep (+ follow-up #47 `3b55900`) | #31 (`905595b`) | [issue-16-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-16-testing/) | merged |
| 17 | kiosk intake hardening (+ follow-up #43 `8d0dae9`) | #27 (`0e879b6`) | [issue-17-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-17-testing/) | merged |
| 18 | AudioContext unlock + element pool (+ follow-up #45 `4575f2a`) | #25 (`7128d62`) | [issue-18-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-18-testing/) | merged |
| 19 | genre exit() teardown on level change | #36 (`a64fc0a`) | [issue-19-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-19-testing/) | merged |
| 20 | contrast sweep (booth-distance readability) | #35 (`c7d2b0c`) | [issue-20-testing](https://farpointhq.github.io/all-in-arcade-plans/plans/issue-20-testing/) | merged |

All 15 ticked on both meta twins (#24, #4) with `Fixed in #<PR>` comments. One sha correction applied mid-close-out: #41's real squash sha is `acf8584` (the `7a1f698` the API reported was the test-merge sha).

## 2. Close-out drain log

- **Audit (read-only):** the sibling fleet was alive mid-merge-wave; liveness probes that worked: process table + worktree file mtimes (git timestamps lied). Ten PRs self-merged by sibling tabs during the audit window (#30/#35/#36/#41/#42/#31/#46/#43/#45/#47).
- **Bookkeeping lane:** 15 checklist rows + 15 `Fixed in` comments across #24/#4/#sub-issues, identical wording on the twins.
- **#7 landing (the only straggler — its fix tab died pre-PR):**
  - Conflict-resolution merge onto current main: canonical PR #31 sweep strings kept, PR #26 URL-attributed badnet gate kept, gameplay fixes kept.
  - House-rule fix: `--mute-audio` on all 4 rig Chromium launches (issue #40 item).
  - Wrong-test fix: the sim strings gate pinned the discarded F4 draft wording → repointed at the landed canonical strings (justified in commit `4a50993`; canonical `bilingual-check.py` gate green: 13 modules + 16 level.json).
  - **Minimal-change RED→GREEN repro** (one-file swap of `src/genres/nano-cure.js`, same server/port/seed, real runner `levels/amir-kermany-nano-cure-2/sim.py`):

    | | pre-fix (`e4ebaff`) | post-fix (landed) |
    |---|---|---|
    | `jank` (spike3 frames) | **FAILED — lost @ t=48.9**, boss@46.0, hearts 0 (issue #7's exact signature) | **PASSED — won @ t=60.6** |
    | `sims` (fixed-dt) | good/partial/clumsy gameplay green (the divergence pair) | all green |

  - Full battery green post-fix: live ×3 clean wins (hearts=3, console clean, badnet clean), jank won t=60.58, strings 8/8, thumbs ok. Evidence refreshed against the landed build and committed in #48.

## 3. Regression sweep (post-merge main `eb7b79b`, 15-level rig + fixed suites)

All 15 levels booted clean on every gate (`boot`, `consoleClean`, `noPageerror`, `netClean`). Win-gated results:

| Level | Driver | Verdict |
|-------|--------|---------|
| amir-kermany-nano-cure-2 | nano-cure bot | PASS (won ×3 in battery) |
| bethany-cloudwalk | platformer keys | PASS |
| ian-spence-rewind-loop | rewind bot | PASS |
| kristopher-federico-study-hall-scramble | maze-studyhall ap | **FAIL win:False** → §4 |
| L01 | platformer keys | PASS |
| L02 | racer keys | PASS |
| L03 | puzzle keys | PASS |
| L04 | shooter keys | PASS |
| louis-philippe-gaulin-knight-s-dungeon-scramble | maze ap | **FAIL win:False** → §4 |
| marc-larochelle-course-apocalypse | survival keys | PASS |
| mark-abdallah-slingshot-duck-season | slingshot keys | PASS |
| matt-mayer-mda-space-mission | space-mission bot | **FAIL win:False** → §4 |
| miray-kavruk-world-tour | world-tour bot | PASS |
| nicolas-snowball-seasons | platformer keys | PASS |
| simone-death-star-run | star-racer keys | PASS |

Suites (all green): `blur_pause_check.py` 6/6 · `dpr_resize_check.py` (incl. #13's blur gate) · `audio_hardening.py` 4/4 · `save-corrupt-boot.py` 6/6 (boot smoke) · `tools/tests/save-corrupt.mjs` 13/13 · `tools/server_tests/test_intake.py` 21/21.

**Result: 12/15 levels PASS, 3 bot-drive losses adjudicated below; 0 suite failures.**

## 4. Sweep-loss adjudication — pre-existing, not close-out regressions

**File-scope proof:** the close-out's only code delta (PR #48) touches `src/genres/nano-cure.js` + the nano-cure rig/evidence. `git diff --name-only 4e58127 eb7b79b` shows `src/core.js` and the playtest tools belong to #47 — maze and space-mission modules are **byte-identical** across the pre/post trees, so same-seed outcomes cannot differ due to the landed work.

**Maze arms** (same-seed `playtest.py` drives, identical clean-gates `win: False` signature):

| Level | `3b55900` (pre-#48) ×2 | `eb7b79b` (post-#48) ×2 |
|-------|------------------------|-------------------------|
| kristopher-federico-study-hall-scramble | FAIL win:False ×2 | FAIL win:False ×2 |
| louis-philippe-gaulin-knight-s-dungeon-scramble | FAIL win:False ×2 | FAIL win:False ×2 |

**8/8 identical** — deterministic, pre-existing. This is the documented #8 residual (maze-bot instruments note: "residual = bot pace/survival"), not introduced or worsened by the close-out.

**Space-mission arm** (matt-mayer-mda-space-mission, `playtest.py` bot drives):

| Tree | Runs | Result |
|------|------|--------|
| `3b55900` (pre-#48) | ×2 | FAIL win:False ×2 |
| `eb7b79b` (post-#48) | ×2 | FAIL win:False ×2 |
| `4e58127` (pre-#47) | ×2 | not executed (scratch checkout had been cleaned up) — excluded mechanistically instead: #47's `core.js` delta is keyboard-activation only and this level's bot path never sends keys |

**4/4 executed runs identical** — the loss predates the close-out merge. With §4's file-scope proof, all three sweep losses are pre-existing bot pace/attrition residuals (follow-up issue filed from this record).

## 5. Verdict

- The close-out merge (`eb7b79b`) is **regression-free**: every sweep loss reproduces byte-identically on the exact pre-change trees (§4) and the delta is disjoint from those modules (file-scope).
- Meta-issue DoD satisfied: generic rig drives all 15 levels · full playthrough evidence + findings report · 15 deduped sub-issues · meta PR · one fix per sub-issue (all merged) · two-level spot checks (L01-crew + L02 + save-corrupt + kiosk intake) recorded in the cascade.
- Follow-ups routed (post-cascade findings, not cascade blockers): the bot pace/attrition residual (maze ×2 + space-mission) → follow-up issue filed from this record.

## 6. Ops notes (what bit us)

1. Shared `/tmp` plans repo races across fleet tabs (`git add -A` swept a sibling's in-progress files).
2. Local branch names one fuzzy-match away (`fix/issue-1` vs `fix/issue-10`) — alias confusion.
3. `gh pr create` with an unquoted heredoc body → zsh backtick substitution → garbled body; always `--body-file`.
4. `gh pr view/edit --json` abort on this repo (classic-Projects GraphQL) → REST `gh api` + `-F body=@file`.
5. Branch-vs-worktree drift — rebase/reset before trusting a worktree.
6. Worktree liveness: processes + file mtimes beat git timestamps (sibling tabs self-merged mid-audit; "2.5h stale" branches were mid-rig-run).
7. Plans Pages publishes only via `python3 -m mkdocs gh-deploy` — plain `git push` leaves every new report 404 (the CDN negative-caches those 404s for ~2 min; probe with a cache-buster).
8. Bash `cwd` silently ignored — explicit `cd X && …` (caught a wrong-tree `serve.py` mid-repro).
9. Test-merge sha ≠ squash sha (#41: `7a1f698` vs real `acf8584`) — trust `git log origin/main`.
