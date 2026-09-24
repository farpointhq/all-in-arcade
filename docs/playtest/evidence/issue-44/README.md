# Issue #44 — submissions PII leak: evidence

Fix: `serve.py` static handler hard-denies any GET whose resolved path is inside a
submissions directory (the configured `--submissions-dir` **and** the default
`<repo>/submissions`). Live queue `pending.jsonl` + rotated `pending-*.jsonl` are
no longer downloadable; a bare `404` leaks nothing.

- `before-fix.txt` — unmodified `serve.py` @ 20e882d, port 8644: `GET /submissions/pending.jsonl`
  and a rotated-style name both return **200 + attendee name/email** unauthenticated.
- `after-fix.txt` — fixed tree: same requests return **404**; `POST /api/submit` and
  on-disk appends still work; legit assets still 200; also verified with
  `--submissions-dir` pointing outside the web root.

## Repro / regression suite

    python3 tools/server_tests/test_intake.py -v           # 24 tests (21 baseline + 3 new)

New suite: `SubmissionsPrivacyTests` — pending.jsonl denied, rotated name denied,
POST-then-HTTP-GET never returns the submitted email. Verified red (3/3 fail) against
the pre-fix `serve.py` and green after.
