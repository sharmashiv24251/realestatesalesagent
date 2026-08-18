#!/usr/bin/env python3
"""Runs the scripted conversations in app/data/test_fixtures.json against the
live agent (real Gemini calls, real tool execution) and writes TEST_RESULTS.md
at the repo root with input, expected behaviour, and actual output for each
turn -- plus pass/fail for every automated assertion.

Usage: backend/.venv/bin/python backend/scripts/run_tests.py
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.agent_service import get_agent_reply  # noqa: E402
from app.services.session_store import session_store  # noqa: E402

_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "data", "test_fixtures.json")
_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "TEST_RESULTS.md")

_PATH_SEGMENT_RE = re.compile(r"([^.\[\]]+)(\[(-?\d+)\])?")


def _resolve_path(obj, path: str):
    for name, _, index in _PATH_SEGMENT_RE.findall(path):
        if isinstance(obj, dict):
            obj = obj.get(name)
        else:
            obj = getattr(obj, name, None)
        if index != "":
            if not obj:
                return None
            obj = obj[int(index)]
    return obj


def _check_assertion(session, assertion: dict) -> tuple[bool, str]:
    value = _resolve_path(session, assertion["path"])
    op = assertion["op"]
    if op == "eq":
        ok = value == assertion["value"]
        return ok, f"{assertion['path']} == {assertion['value']!r} (got {value!r})"
    if op == "not_none":
        ok = value is not None
        return ok, f"{assertion['path']} is not None (got {value!r})"
    if op == "is_none":
        ok = value is None
        return ok, f"{assertion['path']} is None (got {value!r})"
    if op == "not_empty":
        ok = bool(value)
        return ok, f"{assertion['path']} is non-empty (got {value!r})"
    raise ValueError(f"unknown assertion op: {op}")


def run_fixture(fixture: dict) -> dict:
    session = session_store.create(channel=fixture.get("channel", "chat"))
    turn_records = []
    for message in fixture["turns"]:
        reply = get_agent_reply(session, message)
        turn_records.append({"input": message, "actual": reply})

    all_replies_lower = " ".join(t["actual"] for t in turn_records).lower()

    checks = []
    for forbidden in fixture.get("must_not_contain", []):
        ok = forbidden.lower() not in all_replies_lower
        checks.append((f'must not contain "{forbidden}"', ok))
    for required in fixture.get("must_contain", []):
        ok = required.lower() in all_replies_lower
        checks.append((f'must contain "{required}"', ok))
    for assertion in fixture.get("session_assertions", []):
        ok, label = _check_assertion(session, assertion)
        checks.append((label, ok))

    return {
        "id": fixture["id"],
        "lang": fixture.get("lang", "en"),
        "channel": fixture.get("channel", "chat"),
        "expect": fixture.get("expect", []),
        "turns": turn_records,
        "checks": checks,
        "passed": all(ok for _, ok in checks) if checks else None,
    }


def render_markdown(results: list[dict]) -> str:
    lines = ["# Northstar Agent -- Test Results", ""]
    total_with_checks = [r for r in results if r["passed"] is not None]
    passed = sum(1 for r in total_with_checks if r["passed"])
    lines.append(f"{passed}/{len(total_with_checks)} automated fixtures passed "
                 f"({len(results) - len(total_with_checks)} more are manual-review only).")
    lines.append("")

    for r in results:
        status = "PASS" if r["passed"] else ("FAIL" if r["passed"] is False else "MANUAL REVIEW")
        lines.append(f"## {r['id']} -- {status}")
        lines.append(f"_Language: {r['lang']} · Channel: {r['channel']}_")
        lines.append("")
        lines.append("**Expected behaviour:**")
        for e in r["expect"]:
            lines.append(f"- {e}")
        lines.append("")
        lines.append("**Conversation:**")
        for t in r["turns"]:
            lines.append(f"- **Input:** {t['input']}")
            lines.append(f"  **Actual:** {t['actual']}")
        if r["checks"]:
            lines.append("")
            lines.append("**Automated checks:**")
            for label, ok in r["checks"]:
                lines.append(f"- [{'x' if ok else ' '}] {label}")
        lines.append("")

    return "\n".join(lines)


def main():
    with open(_DATA_PATH, "r", encoding="utf-8") as f:
        fixtures = json.load(f)["fixtures"]

    results = []
    for fixture in fixtures:
        print(f"running {fixture['id']}...", flush=True)
        results.append(run_fixture(fixture))

    markdown = render_markdown(results)
    with open(_OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(markdown)

    total_with_checks = [r for r in results if r["passed"] is not None]
    failed = [r for r in total_with_checks if not r["passed"]]
    print(f"\n{len(total_with_checks) - len(failed)}/{len(total_with_checks)} automated fixtures passed.")
    print(f"Wrote {_OUTPUT_PATH}")
    if failed:
        print("Failed:", ", ".join(r["id"] for r in failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
