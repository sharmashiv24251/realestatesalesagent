"""Site-visit slot scheduling for Northstar One.

Generates the rolling availability window against the current time in IST,
applying existing reservations and hold/restriction rules from
booking_config.json so the schedule never goes stale.
"""

import json
import os
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
from typing import Optional

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_CONFIG_PATH = os.path.join(_DATA_DIR, "booking_config.json")

with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
    BOOKING_CONFIG = json.load(f)

IST = ZoneInfo(BOOKING_CONFIG["business_hours"]["timezone"])

_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def now_ist() -> datetime:
    return datetime.now(IST)


def _reserved_datetimes() -> set:
    today = now_ist().date()
    reserved = set()
    for entry in BOOKING_CONFIG["existing_reservations"]:
        d = today + timedelta(days=entry["days_from_today"])
        reserved.add(datetime.combine(d, time(hour=entry["hour"]), tzinfo=IST))
    return reserved


def slot_id_for(dt: datetime) -> str:
    return f"SLOT-{dt.strftime('%Y%m%d-%H%M')}"


def generate_available_slots(date_filter: Optional[str] = None) -> list[dict]:
    """Return open slots from now through the booking window.

    date_filter: optional ISO date string (YYYY-MM-DD) to narrow to a single day.
    """
    cfg = BOOKING_CONFIG
    start_hour = int(cfg["business_hours"]["start"].split(":")[0])
    last_slot_hour = int(cfg["last_slot_start"].split(":")[0])
    window_days = cfg["booking_window_days"]
    min_notice = timedelta(hours=cfg["min_advance_notice_hours"])

    now = now_ist()
    earliest = now + min_notice

    open_day_keys = set(cfg["open_days"])

    slots = []
    for day_offset in range(0, window_days + 1):
        day = (now + timedelta(days=day_offset)).date()
        if date_filter and day.isoformat() != date_filter:
            continue
        if _DAY_KEYS[day.weekday()] not in open_day_keys:
            continue
        for hour in range(start_hour, last_slot_hour + 1):
            dt = datetime.combine(day, time(hour=hour), tzinfo=IST)
            if dt < earliest:
                continue
            if is_reserved(dt):
                continue
            slots.append({"slot_id": slot_id_for(dt), "datetime_ist": dt.isoformat()})

    return slots


def resolve_slot(slot_id: str) -> Optional[datetime]:
    """Parse a slot_id back into its datetime, or None if malformed."""
    try:
        _, date_part, time_part = slot_id.split("-")
        dt = datetime.strptime(date_part + time_part, "%Y%m%d%H%M")
        return dt.replace(tzinfo=IST)
    except (ValueError, IndexError):
        return None


def is_within_business_hours(dt: datetime) -> bool:
    cfg = BOOKING_CONFIG
    start_hour = int(cfg["business_hours"]["start"].split(":")[0])
    last_slot_hour = int(cfg["last_slot_start"].split(":")[0])
    if _DAY_KEYS[dt.weekday()] not in set(cfg["open_days"]):
        return False
    return start_hour <= dt.hour <= last_slot_hour


_runtime_reserved: set = set()


def is_reserved(dt: datetime) -> bool:
    return dt in _reserved_datetimes() or dt in _runtime_reserved


def mark_reserved(dt: datetime) -> None:
    _runtime_reserved.add(dt)


def is_on_hold(slot_id: str) -> bool:
    return slot_id in BOOKING_CONFIG.get("on_hold_slot_ids", [])


def is_restricted_name(name: str) -> bool:
    patterns = BOOKING_CONFIG.get("restricted_booking_name_patterns", [])
    return any(p in name for p in patterns)
