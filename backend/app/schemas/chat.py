from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "model", "assistant", "system"] = Field(
        default="user",
        description="Role of the message sender ('user', 'model'/'assistant', or 'system')"
    )
    content: str = Field(..., description="Text content of the message")


class ChatRequest(BaseModel):
    prompt: Optional[str] = Field(None, description="Latest user prompt if sending a single turn")
    messages: Optional[List[ChatMessage]] = Field(
        default_factory=list,
        description="Full conversation history for multi-turn chat"
    )
    model: Optional[str] = Field(
        default=None,
        description="Override model name (defaults to configured GEMINI_MODEL e.g. gemini-2.5-flash / gemini-2.0-flash-lite)"
    )
    system_instruction: Optional[str] = Field(
        default="You are an intelligent, friendly, and expert Real Estate Sales & Advisory AI Assistant. Help clients with property inquiries, market insights, buying/selling guidance, and recommendations with professional, engaging, and clear advice.",
        description="System instruction / persona for the AI agent"
    )
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, description="Sampling temperature")
    stream: bool = Field(False, description="Whether to stream the response chunks")


class ChatResponse(BaseModel):
    response: str
    model: str
    status: str = "success"


class HealthResponse(BaseModel):
    status: str
    version: str
    model: str
    api_key_configured: bool
    service: str = "Real Estate AI Agent API"
