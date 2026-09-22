#!/usr/bin/env python3
"""Bilingual copy gate (issue #16) — static acceptance for the EN-first / FR-secondary
booth convention. Run from anywhere:

    python3 tools/playtest/bilingual-check.py

Exit 0 iff all three contracts hold:

  1. CONTROLS  — every src/genres/*.js module carries a meta.controls string in the
                 blessed world-tour/rewind format: "EN: … FR: …" (EN first, FR after).
  2. DISPLAY   — every string literal in src/genres/*.js containing FR diacritics
                 carries an EN sibling on the same literal: an "EN:" marker, the
                 bilingual " / " separator, or a word/word pair (e.g. ENTRÉE/ENTER).
                 A bare "FR:" marker is NOT an EN sibling — FR-only copy must fail.
                 Comments are skipped; escapes and template ${…} nesting are handled.
  3. OBJECTIVES — every levels/*/level.json "objective" containing FR diacritics
                 carries an "FR:" tail (drawn dimmed under the EN line on canvas).

Deliberately NOT scanned: level.json prompt/brief/tagFr fields (authored metadata
and attendees' own words), core.js/ui.js chrome, and FR text without any diacritics
(outside lexical reach — the plan's copy table owns those conversions).
Kept in tools/playtest so future levels can re-run it before merge.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIACRITICS = "àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒœ"
CONTROLS_RE = re.compile(r'controls\s*:\s*"((?:[^"\\]|\\.)*)"')
WORD_SLASH_WORD = re.compile(r"[A-Za-zÀ-ÿ]{2,}/[A-Za-zÀ-ÿ]{2,}")


def has_en_sibling(s: str) -> bool:
    # "FR:" counts as a bilingual marker ONLY with content before it (the
    # "EN head… FR: tail" objective convention). An FR-only string like
    # "FR: attrape-les" is exactly the leak this gate exists to catch (#16 e2e).
    # \bEN: (not a bare substring) so "WHEN: …" can't masquerade as an EN marker.
    fr = s.find("FR:")
    en_head = fr > 0 and bool(s[:fr].strip())
    return bool(re.search(r"\bEN:", s)) or en_head or " / " in s or bool(WORD_SLASH_WORD.search(s))


def scan_js_literals(src: str):
    """Yield (line, text) for every quoted/template literal, skipping comments.
    Handles escapes and nested ${…} interpolation (quotes inside interpolations
    count as their own literals — the contract is about the rendered string)."""
    out = []
    stack = []  # frames: [kind, buf, start_line]; kind in " ' ` ic (interp code)
    i, n, line = 0, len(src), 1

    while i < n:
        c = src[i]
        if not stack or stack[-1][0] == "ic":
            if stack and stack[-1][0] == "ic" and c == "}":
                stack.pop()
                if stack and stack[-1][0] == "`":
                    stack[-1][1] += "}"  # hand the brace back to the template literal
                i += 1
                continue
            if src[i : i + 2] == "//":
                while i < n and src[i] != "\n":
                    i += 1
                continue
            if src[i : i + 2] == "/*":
                i += 2
                while i < n and src[i : i + 2] != "*/":
                    if src[i] == "\n":
                        line += 1
                    i += 1
                i += 2
                continue
            if c == "\n":
                line += 1
                i += 1
                continue
            if c in "\"'`":
                stack.append([c, "", line])
            i += 1
            continue
        # inside a quote literal
        top = stack[-1]
        if c == "\n":
            line += 1
            if top[0] != "`":  # unterminated single-line string — bail out of it
                stack.pop()
            else:
                top[1] += c
            i += 1
            continue
        if c == "\\":
            if i + 1 < n and src[i + 1] == "\n":
                line += 1
            top[1] += src[i : i + 2]
            i += 2
            continue
        if top[0] == "`" and c == "$" and src[i : i + 2] == "${":
            top[1] += "${"
            stack.append(["ic", "", line])
            i += 2
            continue
        if c == top[0]:
            out.append((top[2], top[1]))
            stack.pop()
            i += 1
            continue
        top[1] += c
        i += 1
    return out


def main() -> int:
    failures = []
    genre_files = sorted((ROOT / "src" / "genres").glob("*.js"))

    for f in genre_files:
        src = f.read_text(encoding="utf-8")
        # 1. controls contract
        m = CONTROLS_RE.search(src)
        if not m:
            failures.append((f, 0, "meta.controls string not found — every genre module must carry one"))
        else:
            controls = m.group(1)
            en, fr = controls.find("EN:"), controls.find("FR:")
            if en == -1 or fr == -1 or fr < en:
                failures.append((f, src[: m.start()].count("\n") + 1,
                                 f"controls must be 'EN: … FR: …' (EN first) — got: {controls[:72]}…"))
        # 2. FR-diacritic display strings need an EN sibling
        lines = src.splitlines()
        for ln, lit in scan_js_literals(src):
            if not any(ch in lit for ch in DIACRITICS) or has_en_sibling(lit):
                continue
            # exemption: en/fr-KEYED translation data pairs — "en: "Upper stage",
            # fr: "Étage supérieur"" on one line is a paired structure, not a leak
            if re.search(r"\ben\s*:", lines[ln - 1] if ln - 1 < len(lines) else ""):
                continue
            failures.append((f, ln, f"FR-diacritic string without EN sibling: {lit[:84]}"))

    # 3. level.json objectives must be bilingual when they carry FR
    for f in sorted((ROOT / "levels").glob("*/level.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001 — a broken manifest is itself a failure
            failures.append((f, 0, f"invalid JSON: {e}"))
            continue
        obj = data.get("objective")
        if isinstance(obj, str) and any(ch in obj for ch in DIACRITICS) and "FR:" not in obj:
            failures.append((f, 0, f"objective is FR-only — needs EN-first + 'FR:' tail: {obj[:72]}…"))

    if failures:
        print(f"bilingual-check: {len(failures)} violation(s)\n")
        for f, ln, msg in failures:
            loc = f"{f.relative_to(ROOT)}:{ln}" if ln else str(f.relative_to(ROOT))
            print(f"  {loc}\n    {msg}")
        return 1
    print(f"bilingual-check: OK — {len(genre_files)} genre modules, "
          f"{len(list((ROOT / 'levels').glob('*/level.json')))} level.json files all bilingual-clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
