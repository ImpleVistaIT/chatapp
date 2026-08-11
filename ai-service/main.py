from fastapi import FastAPI
from api.chat import router


app = FastAPI(
    title="SAP AI Service"
)


app.include_router(router)


@app.get("/health")
def health():
    return {
        "status": "AI service running"
    }