"""In-memory conversation session store.

Holds everything a live conversation accumulates: message history for the
model, the lead profile as it's captured turn by turn, and the tracked
events (bookings, objections, escalations) that later feed analytics.
Sessions are held in process memory and expire after SESSION_TTL_SECONDS
of inactivity -- there's no requirement in the brief for persistence
across server restarts.
"""

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from app.core.config import settings

Channel = Literal["chat", "voice"]

LEAD_FIELDS = (
    "configuration_interest",
    "budget_min_inr",
    "budget_max_inr",
    "budget_stated_raw",
    "purpose",
    "purchase_timeline",
    "financing",
    "loan_preapproved",
    "current_locality",
    "possession_preference",
    "family_size",
    "first_time_buyer",
    "customer_name",
    "customer_phone",
)


@dataclass
class Session:
    session_id: str
    channel: Channel = "chat"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_active_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    history: list[dict] = field(default_factory=list)
    lead: dict[str, Any] = field(default_factory=lambda: {k: None for k in LEAD_FIELDS})

    languages_used: list[str] = field(default_factory=list)
    turn_count: int = 0

    unanswered_questions: list[str] = field(default_factory=list)
    booking_attempts: list[dict] = field(default_factory=list)
    booking_id: Optional[str] = None
    scheduled_datetime_ist: Optional[str] = None

    escalation_requested: bool = False
    escalation_reason: Optional[str] = None
    preferred_callback_time: Optional[str] = None

    do_not_contact: bool = False
    do_not_contact_reason: Optional[str] = None

    scoring_events: list[str] = field(default_factory=list)

    ended: bool = False
    end_reason: Optional[str] = None
    ended_at: Optional[datetime] = None

    def touch(self) -> None:
        self.last_active_at = datetime.now(timezone.utc)

    def is_expired(self, ttl_seconds: int) -> bool:
        age = (datetime.now(timezone.utc) - self.last_active_at).total_seconds()
        return age > ttl_seconds

    def record_scoring_event(self, event_key: str) -> None:
        self.scoring_events.append(event_key)


class SessionStore:
    def __init__(self, ttl_seconds: Optional[int] = None):
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()
        self.ttl_seconds = ttl_seconds or settings.SESSION_TTL_SECONDS

    def create(self, channel: Channel = "chat") -> Session:
        session_id = str(uuid.uuid4())
        with self._lock:
            session = Session(session_id=session_id, channel=channel)
            self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Optional[Session]:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if session.is_expired(self.ttl_seconds):
                del self._sessions[session_id]
                return None
            return session

    def sweep_expired(self) -> int:
        with self._lock:
            expired = [sid for sid, s in self._sessions.items() if s.is_expired(self.ttl_seconds)]
            for sid in expired:
                del self._sessions[sid]
            return len(expired)


session_store = SessionStore()
