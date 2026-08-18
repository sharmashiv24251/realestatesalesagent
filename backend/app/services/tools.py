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
from datetime import datetime
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
