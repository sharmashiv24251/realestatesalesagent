"""Post-conversation analytics.

The lead profile itself is already captured live by save_lead_profile, so
there's nothing to re-extract there. This module derives the rest --
language mix, objections, off-topic classification, and a lead-interest
score -- deterministically from the tracked session state and
scoring_config.json, rather than running a second model call over the
transcript. That keeps the numbers reproducible and directly testable.
"""

import json
import os
import re
from datetime import datetime, timezone
from typing import Optional

from app.services.session_store import Session

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

with open(os.path.join(_DATA_DIR, "scoring_config.json"), "r", encoding="utf-8") as f:
    SCORING_CONFIG = json.load(f)

with open(os.path.join(_DATA_DIR, "catalog.json"), "r", encoding="utf-8") as f:
    CATALOG = json.load(f)

_DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")

_HINGLISH_TOKENS = {
    "hai", "hain", "nahi", "nahin", "kya", "kaise", "krna", "karna", "chahiye",
    "mujhe", "aap", "kar", "raha", "rha", "rahe", "bhi", "abhi", "thik", "theek",
    "sahi", "paisa", "ghar", "kitna", "kitni", "kab", "kyu", "kyun", "acha",
    "accha", "bata", "batao", "mera", "meri", "hoga", "hoga", "koi", "please",
}

_EVENT_LABELS = {
    "gave_phone": "gave phone number",
    "gave_name": "gave name",
    "volunteered_constraint": "volunteered a location constraint",
    "volunteered_timeline": "volunteered a purchase timeline",
    "volunteered_financing": "volunteered financing details",
    "volunteered_family": "volunteered family details",
    "volunteered_current_home": "volunteered current home details",
    "asked_about_payment_process": "asked about payment process",
    "asked_about_possession": "asked about possession",
    "asked_to_compare_configs": "asked to compare configurations",
    "requested_site_visit_unprompted": "requested a site visit unprompted",
    "accepted_proposed_slot": "accepted a proposed slot",
    "asked_for_human_consultant": "asked for a human consultant",
    "session_turns_over_10": "sustained a long conversation",
    "budget_within_project_range": "budget is within project range",
    "budget_far_below_range": "budget is far below project range",
}

QUALIFICATION_FIELDS = (
    "configuration_interest",
    "budget",
    "purpose",
    "purchase_timeline",
    "financing",
    "loan_preapproved",
    "current_locality",
    "possession_preference",
    "family_size",
    "first_time_buyer",
)


def _detect_language(text: str) -> str:
    if _DEVANAGARI_RE.search(text):
        return "hindi"
    words = set(re.findall(r"[a-zA-Z']+", text.lower()))
    if words & _HINGLISH_TOKENS:
        return "hinglish"
    return "english"


def _user_turns(session: Session) -> list[str]:
    return [t["content"] for t in session.history if t["role"] == "user"]


def _language_summary(session: Session) -> tuple[list[str], int]:
    detected = [_detect_language(t) for t in _user_turns(session)]
    used, switches = [], 0
    prev = None
    for lang in detected:
        if lang not in used:
            used.append(lang)
        if prev is not None and lang != prev:
            switches += 1
        prev = lang
    return used, switches


_SENTIMENT_POSITIVE = {"thanks", "great", "good", "perfect", "sounds good", "interested", "nice", "sure", "yes"}
_SENTIMENT_NEGATIVE = {"no", "not interested", "waste", "stop", "annoyed", "angry", "worse", "bad"}
_SENTIMENT_HESITANT = {"maybe", "not sure", "let me think", "hmm", "hesitant", "later"}


def _sentiment_trajectory(session: Session) -> list[str]:
    trajectory = []
    for text in _user_turns(session):
        lowered = text.lower()
        if any(p in lowered for p in _SENTIMENT_NEGATIVE):
            trajectory.append("negative")
        elif any(p in lowered for p in _SENTIMENT_HESITANT):
            trajectory.append("hesitant")
        elif any(p in lowered for p in _SENTIMENT_POSITIVE):
            trajectory.append("positive")
        else:
            trajectory.append("neutral")
    return trajectory


def _objections_raised(session: Session) -> list[dict]:
    taxonomy = SCORING_CONFIG["objection_taxonomy"]
    counts: dict[str, int] = {}
    for text in _user_turns(session):
        lowered = text.lower()
        for obj_type, keywords in taxonomy.items():
            if any(kw in lowered for kw in keywords):
                counts[obj_type] = counts.get(obj_type, 0) + 1
    return [{"type": t, "resolved": c == 1} for t, c in counts.items()]


def _off_topic_events(session: Session) -> list[str]:
    classes = SCORING_CONFIG["off_topic_classes"]
    events = []
    for text in _user_turns(session):
        lowered = text.lower()
        for class_name, cfg in classes.items():
            if any(kw in lowered for kw in cfg["keywords"]):
                events.append(class_name)
                break
    return events


def _qualification_completeness(lead: dict) -> float:
    filled = 0
    for field in QUALIFICATION_FIELDS:
        if field == "budget":
            if lead.get("budget_stated_raw") or lead.get("budget_min_inr") or lead.get("budget_max_inr"):
                filled += 1
        elif lead.get(field) is not None:
            filled += 1
    return round(filled / len(QUALIFICATION_FIELDS), 2)


def _budget_signal(lead: dict) -> Optional[str]:
    floor_price = min(c["starting_price_inr"] for p in CATALOG["projects"] for c in p["configurations"])
    budget = lead.get("budget_max_inr") or lead.get("budget_min_inr")
    if budget is None:
        return None
    if budget < floor_price * 0.7:
        return "budget_far_below_range"
    if budget >= floor_price:
        return "budget_within_project_range"
    return None


def _score_interest(session: Session, off_topic_events: list[str]) -> tuple[int, list[str]]:
    behavioural = SCORING_CONFIG["behavioural_signals"]
    disclosure = SCORING_CONFIG["disclosure_signals"]
    off_topic = SCORING_CONFIG["off_topic_classes"]

    score = 0
    evidence: list[str] = []

    for event in session.scoring_events:
        weight = behavioural.get(event) or (disclosure.get(event) or {}).get("weight")
        if weight:
            score += weight
            evidence.append(_EVENT_LABELS.get(event, event))

    for event in off_topic_events:
        score += off_topic[event]["weight"]

    if session.turn_count > 10:
        score += behavioural["session_turns_over_10"]
        evidence.append(_EVENT_LABELS["session_turns_over_10"])

    budget_signal = _budget_signal(session.lead)
    if budget_signal:
        score += behavioural[budget_signal]
        evidence.append(_EVENT_LABELS[budget_signal])

    return score, evidence


def _interest_level(score: int) -> str:
    thresholds = SCORING_CONFIG["thresholds"]
    if score >= thresholds["hot"]:
        return "hot"
    if score >= thresholds["warm"]:
        return "warm"
    return "cold"


def _site_visit_status(session: Session) -> str:
    if session.booking_id:
        return "booked"
    if session.booking_attempts:
        return "failed"
    return "not_discussed"


def _next_best_action(session: Session, interest_level: str) -> str:
    if session.do_not_contact:
        return "No further contact -- customer opted out."
    if session.escalation_reason:
        return f"Senior consultant to call re: {session.escalation_reason.replace('_', ' ')}."
    if session.booking_id:
        return "Confirm visit reminder ahead of the scheduled slot."
    if session.booking_attempts:
        return "Follow up to reschedule the failed site-visit attempt."
    if interest_level == "hot":
        return "Priority follow-up -- propose a site visit."
    if interest_level == "warm":
        return "Follow up with more project information and a site-visit offer."
    return "Low-touch follow-up; nurture until requirements firm up."


def generate_analytics(session: Session) -> dict:
    languages_used, language_switches = _language_summary(session)
    off_topic_events = _off_topic_events(session)
    score, evidence = _score_interest(session, off_topic_events)
    interest_level = _interest_level(score)

    ended_at = session.ended_at or datetime.now(timezone.utc)
    duration_seconds = int((ended_at - session.created_at).total_seconds())

    return {
        "session_id": session.session_id,
        "lead": session.lead,
        "conversation": {
            "languages_used": languages_used,
            "language_switches": language_switches,
            "turn_count": session.turn_count,
            "sentiment_trajectory": _sentiment_trajectory(session),
            "objections_raised": _objections_raised(session),
            "unanswered_questions": session.unanswered_questions,
            "out_of_scope_attempts": len(off_topic_events),
            "qualification_completeness": _qualification_completeness(session.lead),
        },
        "outcome": {
            "interest_level": interest_level,
            "interest_evidence": evidence,
            "site_visit_status": _site_visit_status(session),
            "booking_attempts": session.booking_attempts,
            "scheduled_datetime_ist": session.scheduled_datetime_ist,
            "follow_up_required": bool(
                session.escalation_requested
                or session.unanswered_questions
                or (session.booking_attempts and not session.booking_id)
                or not session.ended
            ),
            "preferred_callback_time": session.preferred_callback_time,
            "do_not_contact": session.do_not_contact,
            "escalation_requested": session.escalation_requested,
            "escalation_reason": session.escalation_reason,
            "next_best_action": _next_best_action(session, interest_level),
            "end_reason": session.end_reason if session.ended else "in_progress",
        },
        "ops": {
            "duration_seconds": duration_seconds,
            "tool_calls": session.tool_call_count,
            "total_tokens": session.total_tokens,
        },
    }
