"""Northstar agent tools.

Each method on ToolBox is a function-calling tool the model can invoke.
A ToolBox is bound to one conversation Session, so every call reads and
writes that session's state directly -- this is where lead capture,
booking attempts, and escalation flags actually get recorded.

All product facts are read from data/catalog.json and data/process_kb.json;
booking rules are enforced here in Python against the current time in IST,
not left to the model to reason about.
"""

import json
import os
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.services import slots
from app.services.session_store import Session

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

with open(os.path.join(_DATA_DIR, "catalog.json"), "r", encoding="utf-8") as f:
    CATALOG = json.load(f)

with open(os.path.join(_DATA_DIR, "process_kb.json"), "r", encoding="utf-8") as f:
    PROCESS_KB = json.load(f)

_PROJECTS_BY_ID = {p["project_id"]: p for p in CATALOG["projects"]}


def _network_delay() -> None:
    """Real calls to a catalog/booking backend never resolve instantly."""
    time.sleep(random.uniform(0.12, 0.32))


def _business_hours_display() -> str:
    bh = slots.BOOKING_CONFIG["business_hours"]
    return f"{bh['start']}-{bh['end']} {bh['timezone']}"


class ToolBox:
    def __init__(self, session: Session):
        self.session = session

    # ------------------------------------------------------------------
    # Catalog & booking
    # ------------------------------------------------------------------

    def search_projects(
        self,
        configuration: Optional[str] = None,
        budget_max: Optional[int] = None,
        location: Optional[str] = None,
    ) -> list[dict]:
        """Find Northstar projects matching a configuration, budget ceiling, or location.

        Args:
            configuration: Desired unit type, e.g. "2 BHK" or "3 BHK". Omit to match any.
            budget_max: Maximum budget in INR. Omit to match any.
            location: Locality or city to filter by. Omit to match any.
        """
        _network_delay()
        results = []
        for project in CATALOG["projects"]:
            if project.get("status") != "active":
                continue
            if location and location.lower() not in project["location"].lower():
                continue

            configs = project["configurations"]
            if configuration:
                configs = [c for c in configs if c["type"].lower() == configuration.lower()]
            if budget_max is not None:
                configs = [c for c in configs if c["starting_price_inr"] <= budget_max]
            if (configuration or budget_max is not None) and not configs:
                continue

            results.append(
                {
                    "project_id": project["project_id"],
                    "name": project["name"],
                    "location": project["location"],
                    "status": project["status"],
                    "configurations": [
                        {
                            "type": c["type"],
                            "starting_price_inr": c["starting_price_inr"],
                            "starting_price_display": c["starting_price_display"],
                        }
                        for c in configs
                    ],
                }
            )
        return results

    def get_project_details(self, project_id: str) -> dict:
        """Get full details for one project. Fields the catalog has no data for come back null --
        that means the information genuinely isn't available, not that it should be guessed.

        Args:
            project_id: The project's id, from search_projects.
        """
        _network_delay()
        project = _PROJECTS_BY_ID.get(project_id)
        if project is None:
            return {"error": "not_found", "project_id": project_id}
        return project

    def check_slot_availability(
        self, project_id: str, date: Optional[str] = None
    ) -> dict:
        """List open site-visit slots for a project.

        Args:
            project_id: The project's id.
            date: Optional ISO date (YYYY-MM-DD) to check a specific day. Omit to see the
                full rolling window.
        """
        _network_delay()
        if project_id not in _PROJECTS_BY_ID:
            return {"error": "not_found", "project_id": project_id}
        available = slots.generate_available_slots(date_filter=date)
        return {
            "business_hours": _business_hours_display(),
            "available_slots": available[:20],
        }

    def book_site_visit(
        self,
        project_id: str,
        customer_name: str,
        customer_phone: str,
        slot_id: Optional[str] = None,
        requested_datetime_ist: Optional[str] = None,
    ) -> dict:
        """Attempt to book a site visit. Pass slot_id when the customer chose a slot you
        showed them from check_slot_availability. Pass requested_datetime_ist (ISO 8601,
        IST) when the customer names a specific date/time you have not already confirmed is
        open -- including one that might turn out to be in the past or outside business
        hours. The booking can fail; the reason tells you what to say and what to offer next.

        Args:
            project_id: The project's id.
            customer_name: The visitor's name.
            customer_phone: The visitor's phone number.
            slot_id: A slot_id from check_slot_availability, if the customer picked one.
            requested_datetime_ist: ISO 8601 datetime in IST for an unconfirmed request.
        """
        _network_delay()

        session = self.session
        requested_label = slot_id or requested_datetime_ist or "unspecified"

        def _fail(reason: str) -> dict:
            suggestions = slots.generate_available_slots()[:2]
            session.booking_attempts.append(
                {"requested": requested_label, "result": "failed", "reason": reason}
            )
            return {"ok": False, "reason": reason, "suggested_slots": suggestions}

        if project_id not in _PROJECTS_BY_ID:
            return _fail("SYSTEM_ERROR")

        if slots.is_restricted_name(customer_name):
            return _fail("SYSTEM_ERROR")

        target_dt = None
        if slot_id:
            if slots.is_on_hold(slot_id):
                return _fail("SYSTEM_ERROR")
            target_dt = slots.resolve_slot(slot_id)
        elif requested_datetime_ist:
            try:
                target_dt = datetime.fromisoformat(requested_datetime_ist)
                if target_dt.tzinfo is None:
                    target_dt = target_dt.replace(tzinfo=slots.IST)
            except ValueError:
                target_dt = None

        if target_dt is None:
            return _fail("SYSTEM_ERROR")

        now = slots.now_ist()
        min_notice = slots.BOOKING_CONFIG["min_advance_notice_hours"]

        if target_dt < now:
            return _fail("PAST_DATE")
        if not slots.is_within_business_hours(target_dt):
            return _fail("OUTSIDE_HOURS")
        if (target_dt - now).total_seconds() < min_notice * 3600:
            return _fail("TOO_SOON")
        if slots.is_reserved(target_dt):
            return _fail("SLOT_TAKEN")

        slots.mark_reserved(target_dt)
        booking_id = f"NB-{uuid.uuid4().hex[:8].upper()}"
        session.booking_id = booking_id
        session.scheduled_datetime_ist = target_dt.isoformat()
        session.lead["customer_name"] = customer_name
        session.lead["customer_phone"] = customer_phone
        session.booking_attempts.append(
            {"requested": target_dt.isoformat(), "result": "booked"}
        )
        session.record_scoring_event("accepted_proposed_slot")

        return {
            "ok": True,
            "booking_id": booking_id,
            "datetime_ist": target_dt.isoformat(),
            "address": slots.BOOKING_CONFIG["site_address"],
        }

    # ------------------------------------------------------------------
    # Lead capture & escalation
    # ------------------------------------------------------------------

    def save_lead_profile(
        self,
        configuration_interest: Optional[str] = None,
        budget_min_inr: Optional[int] = None,
        budget_max_inr: Optional[int] = None,
        budget_stated_raw: Optional[str] = None,
        purpose: Optional[str] = None,
        purchase_timeline: Optional[str] = None,
        financing: Optional[str] = None,
        loan_preapproved: Optional[bool] = None,
        current_locality: Optional[str] = None,
        possession_preference: Optional[str] = None,
        family_size: Optional[int] = None,
        first_time_buyer: Optional[bool] = None,
        customer_name: Optional[str] = None,
        customer_phone: Optional[str] = None,
    ) -> dict:
        """Save or update whatever the customer has shared so far. Call this as each field
        lands in the conversation, not only at the end -- pass only the fields you have new
        information for; anything you omit is left as it already was.

        Args:
            configuration_interest: Which configuration they want, e.g. "2 BHK" or "3 BHK".
            budget_min_inr: Lower end of their stated budget, in INR.
            budget_max_inr: Upper end of their stated budget, in INR.
            budget_stated_raw: Their budget in their own words, e.g. "around 1.5 to 1.8 crore".
            purpose: "end_use" or "investment".
            purchase_timeline: "immediate", "3_months", "6_months", or "exploring".
            financing: "home_loan" or "self_funded".
            loan_preapproved: Whether their home loan is already pre-approved.
            current_locality: Where they currently live or work.
            possession_preference: "ready_to_move", "under_construction", or "flexible".
            family_size: Number of people in the household.
            first_time_buyer: Whether this is their first property purchase.
            customer_name: The customer's name.
            customer_phone: The customer's phone number.
        """
        _network_delay()
        session = self.session
        updates = {
            "configuration_interest": configuration_interest,
            "budget_min_inr": budget_min_inr,
            "budget_max_inr": budget_max_inr,
            "budget_stated_raw": budget_stated_raw,
            "purpose": purpose,
            "purchase_timeline": purchase_timeline,
            "financing": financing,
            "loan_preapproved": loan_preapproved,
            "current_locality": current_locality,
            "possession_preference": possession_preference,
            "family_size": family_size,
            "first_time_buyer": first_time_buyer,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
        }

        disclosure_events = {
            "current_locality": "volunteered_constraint",
            "purchase_timeline": "volunteered_timeline",
            "financing": "volunteered_financing",
            "family_size": "volunteered_family",
            "customer_name": "gave_name",
            "customer_phone": "gave_phone",
        }

        for field, value in updates.items():
            if value is None:
                continue
            is_new = session.lead.get(field) is None
            session.lead[field] = value
            if is_new and field in disclosure_events:
                session.record_scoring_event(disclosure_events[field])

        return {"ok": True, "lead": session.lead}

    def log_unanswered_question(self, question_text: str) -> dict:
        """Record a question you could not answer from your tools, so it can be followed up
        on and used to spot gaps in what Northstar makes available to the agent.

        Args:
            question_text: The customer's question, as close to their own words as possible.
        """
        _network_delay()
        self.session.unanswered_questions.append(question_text)
        return {"ok": True}

    def request_human_callback(
        self, reason: str, preferred_time: Optional[str] = None
    ) -> dict:
        """Escalate to a human consultant -- for discounts, negotiation, documentation/legal
        questions, an upset customer, or anything asked twice that you couldn't answer.

        Args:
            reason: Why this needs a human, e.g. "payment_details", "discount_request".
            preferred_time: When the customer would like to be called back, if they said.
        """
        _network_delay()
        session = self.session
        session.escalation_requested = True
        session.escalation_reason = reason
        if preferred_time:
            session.preferred_callback_time = preferred_time
        session.record_scoring_event("asked_for_human_consultant")
        return {"ok": True}

    def set_do_not_contact(self, reason: Optional[str] = None) -> dict:
        """Record that the customer wants no further contact. Call this once, then stop
        asking anything further.

        Args:
            reason: Why they opted out, if they said.
        """
        _network_delay()
        session = self.session
        session.do_not_contact = True
        session.do_not_contact_reason = reason
        return {"ok": True}

    def end_conversation(self, reason: str) -> dict:
        """Close out the conversation. Call this once, at the very end, after you've read
        back anything confirmed and said goodbye.

        Args:
            reason: "user_goodbye", "agent_close", "opt_out", or "abandoned".
        """
        _network_delay()
        session = self.session
        session.ended = True
        session.end_reason = reason
        session.ended_at = datetime.now(timezone.utc)
        return {"ok": True}
