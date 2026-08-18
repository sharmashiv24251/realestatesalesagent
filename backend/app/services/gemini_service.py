import os
import logging
from typing import List, Optional, AsyncGenerator
from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.core.config import settings
from app.schemas.chat import ChatMessage

logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
        self.default_model = settings.GEMINI_MODEL

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

    def _prepare_contents(
        self,
        messages: Optional[List[ChatMessage]] = None,
        prompt: Optional[str] = None
    ) -> List[types.Content]:
        """Convert chat history and prompt into Google GenAI types.Content objects."""
        contents: List[types.Content] = []

        if messages:
            for msg in messages:
                # Map role names: 'assistant' -> 'model'
                role = "model" if msg.role in ("assistant", "model") else "user"
                # Skip system messages in contents (they go into system_instruction)
                if msg.role == "system":
                    continue
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=msg.content)]
                    )
                )

        if prompt:
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)]
                )
            )

        if not contents:
            raise ValueError("No prompt or messages provided for chat completion.")

        return contents

    def generate_response(
        self,
        messages: Optional[List[ChatMessage]] = None,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
    ) -> str:
        """Generate complete non-streaming response."""
        client = self.get_client()
        target_model = model or self.default_model
        contents = self._prepare_contents(messages, prompt)

        config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=system_instruction
        )

        try:
            response = client.models.generate_content(
                model=target_model,
                contents=contents,
                config=config,
            )
            return response.text or ""
        except APIError as e:
            logger.error(f"Google GenAI API error: {e}")
            raise RuntimeError(f"Google GenAI Error: {e.message}") from e
        except Exception as e:
            logger.error(f"Unexpected error in Gemini generation: {e}")
            raise

    async def stream_response(
        self,
        messages: Optional[List[ChatMessage]] = None,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Stream response chunks asynchronously."""
        client = self.get_client()
        target_model = model or self.default_model
        contents = self._prepare_contents(messages, prompt)

        config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=system_instruction
        )

        try:
            # client.models.generate_content_stream produces chunks
            response_stream = client.models.generate_content_stream(
                model=target_model,
                contents=contents,
                config=config,
            )
            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
        except APIError as e:
            logger.error(f"Google GenAI Stream API error: {e}")
            yield f"\n\n[API Error: {e.message}]"
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"\n\n[Error: {str(e)}]"


gemini_service = GeminiService()
