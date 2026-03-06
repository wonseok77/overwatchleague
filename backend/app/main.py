import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import auth, community, members, seasons, matches, highlights, profiles, heroes, admin
from app.routers import sessions as sessions_router
from app.routers import ranks

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "avatars"), exist_ok=True)

app = FastAPI(title="OW League API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(community.router, prefix="/communities", tags=["communities"])
app.include_router(members.router, prefix="/communities", tags=["members"])
app.include_router(seasons.router, prefix="", tags=["seasons"])
app.include_router(matches.router, prefix="", tags=["matches"])
app.include_router(profiles.router, prefix="", tags=["profiles"])
app.include_router(highlights.router, prefix="", tags=["highlights"])
app.include_router(heroes.router, prefix="", tags=["heroes"])
app.include_router(admin.router, prefix="", tags=["admin"])
app.include_router(sessions_router.router, prefix="", tags=["sessions"])
app.include_router(ranks.router, prefix="", tags=["ranks"])

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
