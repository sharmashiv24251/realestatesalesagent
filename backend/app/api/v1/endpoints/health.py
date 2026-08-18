from fastapi import APIRouter
from app.core.config import settings
from app.schemas.chat import HealthResponse
from app.services.gemini_service import gemini_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse, summary="Health Check")
async def health_check():
    """Returns the API status and configuration check."""
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        model=settings.GEMINI_MODEL,
        api_key_configured=gemini_service.is_configured(),
        service=settings.PROJECT_NAME
    )
