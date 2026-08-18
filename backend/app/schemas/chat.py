from typing import Literal
from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    channel: Literal["chat", "voice"] = Field(
        default="chat", description="Conversation channel -- shapes how Aarav replies."
    )


class SessionCreateResponse(BaseModel):
    session_id: str
    channel: str


class ChatTurnRequest(BaseModel):
    session_id: str = Field(..., description="Session id from POST /session")
    message: str = Field(..., min_length=1, description="The customer's message")


class ChatTurnResponse(BaseModel):
    session_id: str
    reply: str
    ended: bool
    do_not_contact: bool


class HealthResponse(BaseModel):
    status: str
    version: str
    model: str
    api_key_configured: bool
    service: str = "Northstar Sales Agent API"
