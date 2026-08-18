import json
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.gemini_service import gemini_service

router = APIRouter()


@router.post("/chat", summary="Chat Completion with Gemini Flash")
async def chat_endpoint(request: ChatRequest):
    """
    Handle single-turn or multi-turn chat completions.
    Supports standard JSON responses and SSE (Server-Sent Events) streaming.
    """
    if not gemini_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API Key is not configured. Please set GEMINI_API_KEY in backend/.env"
        )

    target_model = request.model or settings.GEMINI_MODEL

    if request.stream:
        async def event_generator():
            try:
                async for chunk in gemini_service.stream_response(
                    messages=request.messages,
                    prompt=request.prompt,
                    model=target_model,
                    system_instruction=request.system_instruction,
                    temperature=request.temperature or 0.7,
                ):
                    # SSE formatted data chunk
                    payload = json.dumps({"text": chunk, "model": target_model})
                    yield f"data: {payload}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                err_payload = json.dumps({"error": str(e)})
                yield f"data: {err_payload}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    try:
        response_text = gemini_service.generate_response(
            messages=request.messages,
            prompt=request.prompt,
            model=target_model,
            system_instruction=request.system_instruction,
            temperature=request.temperature or 0.7,
        )
        return ChatResponse(
            response=response_text,
            model=target_model,
            status="success"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/models", summary="Active Gemini engine")
async def list_models() -> Dict[str, Any]:
    """Return active Gemini Flash Lite engine info."""
    return {
        "model": settings.GEMINI_MODEL,
        "name": "Gemini 3.5 Flash Lite",
        "description": "Ultra low-latency, cost-effective Gemini Flash family model."
    }
