from fastapi import FastAPI

from api.chat import router as chat_router
from config.settings import get_settings


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Enterprise SAP AI microservice for intent routing, RAG, and SAP tool orchestration.",
)

app.include_router(chat_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
