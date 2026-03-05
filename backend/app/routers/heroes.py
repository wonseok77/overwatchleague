import os
import uuid
import shutil
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.hero import Hero
from app.services.auth import get_current_user, require_admin
from app.models.user import User

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads", "heroes"
)

# Blizzard 공식 CDN URL (https://d15f34w2p8l1cc.cloudfront.net/overwatch/{key}.png)
_CDN = "https://d15f34w2p8l1cc.cloudfront.net/overwatch/{}.png"

DEFAULT_HEROES = [
    # Tank
    {"name": "D.Va",          "role": "tank",    "key": "dva"},
    {"name": "Doomfist",      "role": "tank",    "key": "doomfist"},
    {"name": "Junker Queen",  "role": "tank",    "key": "junker-queen"},
    {"name": "Mauga",         "role": "tank",    "key": "mauga"},
    {"name": "Orisa",         "role": "tank",    "key": "orisa"},
    {"name": "Ramattra",      "role": "tank",    "key": "ramattra"},
    {"name": "Reinhardt",     "role": "tank",    "key": "reinhardt"},
    {"name": "Roadhog",       "role": "tank",    "key": "roadhog"},
    {"name": "Sigma",         "role": "tank",    "key": "sigma"},
    {"name": "Winston",       "role": "tank",    "key": "winston"},
    {"name": "Wrecking Ball", "role": "tank",    "key": "wrecking-ball"},
    {"name": "Zarya",         "role": "tank",    "key": "zarya"},
    # DPS
    {"name": "Ashe",          "role": "dps",     "key": "ashe"},
    {"name": "Bastion",       "role": "dps",     "key": "bastion"},
    {"name": "Cassidy",       "role": "dps",     "key": "cassidy"},
    {"name": "Echo",          "role": "dps",     "key": "echo"},
    {"name": "Genji",         "role": "dps",     "key": "genji"},
    {"name": "Hanzo",         "role": "dps",     "key": "hanzo"},
    {"name": "Junkrat",       "role": "dps",     "key": "junkrat"},
    {"name": "Mei",           "role": "dps",     "key": "mei"},
    {"name": "Pharah",        "role": "dps",     "key": "pharah"},
    {"name": "Reaper",        "role": "dps",     "key": "reaper"},
    {"name": "Sojourn",       "role": "dps",     "key": "sojourn"},
    {"name": "Soldier: 76",   "role": "dps",     "key": "soldier-76"},
    {"name": "Sombra",        "role": "dps",     "key": "sombra"},
    {"name": "Symmetra",      "role": "dps",     "key": "symmetra"},
    {"name": "Torbjörn",      "role": "dps",     "key": "torbjorn"},
    {"name": "Tracer",        "role": "dps",     "key": "tracer"},
    {"name": "Venture",       "role": "dps",     "key": "venture"},
    {"name": "Widowmaker",    "role": "dps",     "key": "widowmaker"},
    # Support
    {"name": "Ana",           "role": "support", "key": "ana"},
    {"name": "Baptiste",      "role": "support", "key": "baptiste"},
    {"name": "Brigitte",      "role": "support", "key": "brigitte"},
    {"name": "Illari",        "role": "support", "key": "illari"},
    {"name": "Kiriko",        "role": "support", "key": "kiriko"},
    {"name": "Lifeweaver",    "role": "support", "key": "lifeweaver"},
    {"name": "Lúcio",         "role": "support", "key": "lucio"},
    {"name": "Mercy",         "role": "support", "key": "mercy"},
    {"name": "Moira",         "role": "support", "key": "moira"},
    {"name": "Zenyatta",      "role": "support", "key": "zenyatta"},
]


# ── Pydantic schemas ────────────────────────────────────────────────────────

class HeroResponse(BaseModel):
    id: str
    name: str
    role: str
    portrait_url: Optional[str] = None
    is_custom: bool
    created_at: str

    class Config:
        from_attributes = True


class HeroCreate(BaseModel):
    name: str
    role: str  # tank / dps / support
    portrait_url: Optional[str] = None


class HeroUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    portrait_url: Optional[str] = None


# ── Helper ──────────────────────────────────────────────────────────────────

def _to_response(h: Hero) -> HeroResponse:
    return HeroResponse(
        id=str(h.id),
        name=h.name,
        role=h.role,
        portrait_url=h.portrait_url,
        is_custom=h.is_custom,
        created_at=h.created_at.isoformat(),
    )


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/heroes", response_model=List[HeroResponse])
def list_heroes(db: Session = Depends(get_db)):
    """전체 영웅 목록 조회 (역할군 → 이름 순)"""
    role_order = {"tank": 0, "dps": 1, "support": 2}
    heroes = db.query(Hero).all()
    heroes.sort(key=lambda h: (role_order.get(h.role, 9), h.name))
    return [_to_response(h) for h in heroes]


@router.post("/heroes", response_model=HeroResponse, status_code=status.HTTP_201_CREATED)
def create_hero(
    req: HeroCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if req.role not in ("tank", "dps", "support"):
        raise HTTPException(status_code=400, detail="role must be tank / dps / support")
    if db.query(Hero).filter(Hero.name == req.name).first():
        raise HTTPException(status_code=400, detail="Hero name already exists")

    hero = Hero(name=req.name, role=req.role, portrait_url=req.portrait_url, is_custom=True)
    db.add(hero)
    db.commit()
    db.refresh(hero)
    return _to_response(hero)


@router.put("/heroes/{hero_id}", response_model=HeroResponse)
def update_hero(
    hero_id: uuid.UUID,
    req: HeroUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    hero = db.query(Hero).filter(Hero.id == hero_id).first()
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")

    if req.name is not None:
        hero.name = req.name
    if req.role is not None:
        if req.role not in ("tank", "dps", "support"):
            raise HTTPException(status_code=400, detail="role must be tank / dps / support")
        hero.role = req.role
    if req.portrait_url is not None:
        hero.portrait_url = req.portrait_url

    db.commit()
    db.refresh(hero)
    return _to_response(hero)


@router.delete("/heroes/{hero_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hero(
    hero_id: uuid.UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    hero = db.query(Hero).filter(Hero.id == hero_id).first()
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")
    db.delete(hero)
    db.commit()


@router.post("/heroes/{hero_id}/portrait", response_model=HeroResponse)
def upload_portrait(
    hero_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """신규 영웅 초상화 이미지 업로드 (JPG / PNG / WebP, 최대 5MB)"""
    hero = db.query(Hero).filter(Hero.id == hero_id).first()
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")

    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="JPG / PNG / WebP only")

    content = file.file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png"
    filename = f"{hero_id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    hero.portrait_url = f"/uploads/heroes/{filename}"
    hero.is_custom = True
    db.commit()
    db.refresh(hero)
    return _to_response(hero)


@router.post("/heroes/seed", response_model=dict)
def seed_heroes(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """기본 영웅 데이터 시드 (이미 있으면 스킵). 최초 1회 실행."""
    added = 0
    for h in DEFAULT_HEROES:
        if db.query(Hero).filter(Hero.name == h["name"]).first():
            continue
        hero = Hero(
            name=h["name"],
            role=h["role"],
            portrait_url=_CDN.format(h["key"]),
            is_custom=False,
        )
        db.add(hero)
        added += 1
    db.commit()
    return {"seeded": added, "message": f"{added}개 영웅 추가됨"}
