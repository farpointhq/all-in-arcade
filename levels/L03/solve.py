#!/usr/bin/env python3
"""Frost Depot solvability prover.

BFS-over-moves Sokoban solver (boxes <= 4, boards <= 24x12) with:
  * deadlock pruning via "box-good" cells (reverse-push reachability from targets)
  * optimal-solution reporting (moves + pushes)
  * optional human-friendly move log (--replay)

Usage:
  python3 solve.py                 # reads level.json in this folder
  python3 solve.py --board "#### a couple rows split by | or multiline"
  python3 solve.py --replay        # also print a step-by-step solution
"""
import argparse, json, os, sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
UDLR = {"U": (0, -1), "D": (0, 1), "L": (-1, 0), "R": (1, 0)}


def parse(rows):
    walls, targets, boxes, player = set(), set(), set(), None
    cols = max(len(r) for r in rows)
    for y, row in enumerate(rows):
        for x in range(cols):
            ch = row[x] if x < len(row) else " "
            if ch == "#":
                walls.add((x, y))
            if ch in ".+*":
                targets.add((x, y))
            if ch in "oO*":
                boxes.add((x, y))
            if ch in "@+":
                player = (x, y)
    return walls, targets, boxes, player


def box_good(walls, targets):
    """Cells from which a box can (ignoring other boxes) still reach some target
    by pushes. Anything outside this set is a guaranteed deadlock."""
    h = max(y for _, y in walls) + 1 if walls else 0
    w = max(x for x, _ in walls)
    floor = {(x, y) for y in range(h) for x in range(w) if (x, y) not in walls}
    good = set()
    for seed in {t for t in targets if t in floor}:
        good.add(seed)
    while True:
        grew = False
        for c in floor:
            if c in good:
                continue
            for dx, dy in UDLR.values():
                n = (c[0] + dx, c[1] + dy)          # push dest
                p = (c[0] - dx, c[1] - dy)          # player must stand here
                if n in good and p in floor:
                    good.add(c)
                    grew = True
                    break
        if not grew:
            return good


def solve(rows, max_states=2_000_000):
    walls, targets, boxes0, player = parse(rows)
    assert len(boxes0) == len(targets), f"boxes {len(boxes0)} != targets {len(targets)}"
    good = box_good(walls, targets)
    h = len(rows)
    w = max(len(r) for r in rows)
    dead = {(x, y) for y in range(h) for x in range(w)
            if (x, y) not in walls and (x, y) not in good}

    start = (player, tuple(sorted(boxes0)))
    seen = {start: (None, None)}
    q = deque([(start, "")])
    expanded = 0
    while q:
        (p, boxes), path = q.popleft()
        boxes = set(boxes)
        for k, (dx, dy) in UDLR.items():
            np = (p[0] + dx, p[1] + dy)
            if np in walls:
                continue
            nb = tuple(sorted(boxes))  # canonical state key: always sorted
            if np in boxes:
                bn = (np[0] + dx, np[1] + dy)
                if bn in walls or bn in boxes:
                    continue
                if bn in dead:
                    continue  # simple-deadlock prune
                nb = tuple(sorted((boxes - {np}) | {bn}))
            state = (np, nb)
            if state in seen:
                continue
            seen[state] = (path + k, (p, tuple(sorted(boxes))))
            expanded += 1
            if expanded > max_states:
                raise SystemExit("state-space cap hit — board too open")
            if set(nb) == targets:
                # reconstruct
                moves = path + k
                cells = []
                cur = state
                while cur is not None:
                    cells.append(cur)
                    cur = seen[cur][1]
                pushes = sum(1 for a, b in zip(cells, cells[1:])
                             if set(a[1]) != set(b[1]))
                return moves, pushes, len(seen)
            q.append((state, path + k))
    return None, None, None


def replay(rows, moves):
    """Verify solution letter-by-letter against plain rules (independent re-check)."""
    walls, targets, boxes, player = parse(rows)
    boxes = set(boxes)
    for i, k in enumerate(moves):
        dx, dy = UDLR[k]
        np = (player[0] + dx, player[1] + dy)
        assert np not in walls, f"step {i} walks into wall"
        if np in boxes:
            bn = (np[0] + dx, np[1] + dy)
            assert bn not in walls and bn not in boxes, f"step {i} crates collide"
            boxes.remove(np); boxes.add(bn)
        player = np
    assert boxes == targets, "final state not all-on-target"
    return len(moves)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default=None, help='rows joined by "|"')
    ap.add_argument("--replay", action="store_true")
    args = ap.parse_args()
    if args.board:
        rows = args.board.split("|")
    else:
        lvl = json.load(open(os.path.join(HERE, "level.json"), encoding="utf-8"))
        rows = lvl["data"]["rows"]
    sol, pushes, _ = solve(rows)
    if sol is None:
        print("NOT SOLVABLE")
        raise SystemExit(1)
    ind = replay(rows, sol)
    print(f"SOLVED: optimum {len(sol)} moves ({pushes} pushes) — replay-checked: {ind} steps OK")
    print("solution:", " ".join(sol))
    if args.replay:
        walls, targets, boxes, player = parse(rows)
        boxes = set(boxes)
        print("   start:", " ".join(rows))
        for i, k in enumerate(sol):
            dx, dy = UDLR[k]
            np = (player[0] + dx, player[1] + dy)
            note = ""
            if np in boxes:
                bn = (np[0] + dx, np[1] + dy)
                boxes.remove(np); boxes.add(bn)
                note = "push" + ("->PAD" if bn in targets else "")
            player = np
            print(f"  {i+1:3}. {k}  {note}  boxes={sorted(boxes)}")
