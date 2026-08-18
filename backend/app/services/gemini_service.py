import os
from typing import Optional
from google import genai

from app.core.config import settings


class GeminiService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")

    def get_client(self) -> genai.Client:
        key = self.api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        if not key:
            raise ValueError(
                "Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env "
                "or pass your Google AI Studio API key."
            )
        return genai.Client(api_key=key)

    def is_configured(self) -> bool:
        key = self.api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        return bool(key and len(key.strip()) > 5)


gemini_service = GeminiService()
