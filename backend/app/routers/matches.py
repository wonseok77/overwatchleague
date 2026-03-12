import json
import logging
import os
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, UploadFile, File, Form

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.community import Community
from app.models.season import Season
from app.models.match import Match, MatchParticipant, PlayerMatchStat
from app.models.user import User, PlayerProfile, PlayerPositionRank
from app.schemas.match import MatchCreate, MatchResponse, ParticipantResponse
from app.services.auth import get_current_user, require_admin, require_manager_or_admin
from app.services.balancing import auto_balance_teams, calculate_mmr_change, compute_player_score
from app.services.mmr import calculate_mmr_change as calc_pos_mmr_change
from app.services.discord import send_match_scheduled, send_match_result
from app.services.ocr import extract_stats_from_image, extract_scoreboard_stats

router = APIRouter()

MAX_PARTICIPANTS = 10


VALID_STATUSES = {"open", "closed", "in_progress", "completed"}


class MatchStatusUpdate(BaseModel):
    status: str


class TeamAdjustment(BaseModel):
    team_a_user_ids: List[str]
    team_b_user_ids: List[str]


class MatchResult(BaseModel):
    map_name: Optional[str] = None
    team_a_score: int
    team_b_score: int
    result: str  # team_a, team_b, draw


def _match_response(m: Match) -> MatchResponse:
    return MatchResponse(
        id=str(m.id),
        community_id=str(m.community_id),
        season_id=str(m.season_id),
        title=m.title,
        scheduled_at=m.scheduled_at.isoformat() if m.scheduled_at else None,
        status=m.status,
        map_name=m.map_name,
        team_a_score=m.team_a_score,
        team_b_score=m.team_b_score,
        result=m.result,
    )


def _participant_response(p: MatchParticipant) -> ParticipantResponse:
    return ParticipantResponse(
        id=str(p.id),
        match_id=str(p.match_id),
        user_id=str(p.user_id),
        status=p.status,
        team=p.team,
    )


@router.get("/seasons/{season_id}/matches", response_model=List[MatchResponse])
def list_matches(season_id: uuid.UUID, db: Session = Depends(get_db)):
    matches = db.query(Match).filter(Match.season_id == season_id).order_by(Match.scheduled_at).all()
    return [_match_response(m) for m in matches]


@router.get("/matches/{match_id}")
def get_match_detail(match_id: uuid.UUID, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    def _resolve_position_mmr(
        user_id: uuid.UUID,
        assigned_position: Optional[str],
        season_id: uuid.UUID,
        profile: Optional[PlayerProfile],
    ) -> Optional[int]:
        """배정 포지션의 MMR 반환. fallback: profile.mmr"""
        if not assigned_position:
            return profile.mmr if profile else None
        pos_rank = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == user_id,
            PlayerPositionRank.position == assigned_position,
            PlayerPositionRank.season_id == season_id,
        ).first()
        if pos_rank and pos_rank.mmr is not None:
            return pos_rank.mmr
        pos_rank = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == user_id,
            PlayerPositionRank.position == assigned_position,
            PlayerPositionRank.season_id.is_(None),
        ).first()
        if pos_rank and pos_rank.mmr is not None:
            return pos_rank.mmr
        return profile.mmr if profile else None

    def _resolve_position_rank(
        user_id: uuid.UUID,
        assigned_position: Optional[str],
        season_id: uuid.UUID,
    ) -> Optional[str]:
        """배정 포지션의 랭크 반환 (예: Diamond 3)"""
        if not assigned_position:
            return None
        pos_rank = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == user_id,
            PlayerPositionRank.position == assigned_position,
            PlayerPositionRank.season_id == season_id,
        ).first()
        if pos_rank and pos_rank.rank:
            return pos_rank.rank
        pos_rank = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == user_id,
            PlayerPositionRank.position == assigned_position,
            PlayerPositionRank.season_id.is_(None),
        ).first()
        return pos_rank.rank if pos_rank and pos_rank.rank else None

    try:
        participants_data = []
        for p in match.participants:
            user = db.query(User).filter(User.id == p.user_id).first()
            profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == p.user_id).first()
            stat = next((s for s in match.stats if s.user_id == p.user_id), None)
            participants_data.append({
                "id": str(p.id),
                "user_id": str(p.user_id),
                "nickname": user.nickname if user else "",
                "status": p.status,
                "team": p.team,
                "main_role": profile.main_role if profile else None,
                "current_rank": profile.current_rank if profile else None,
                "mmr": _resolve_position_mmr(p.user_id, p.assigned_position, match.season_id, profile),
                "assigned_position": p.assigned_position,
                "position_rank": _resolve_position_rank(p.user_id, p.assigned_position, match.season_id),
                "heroes_played": stat.heroes_played if stat else None,
                "screenshot_path": stat.screenshot_path if stat else None,
                "mmr_before": stat.mmr_before if stat else None,
                "mmr_after": stat.mmr_after if stat else None,
                "mmr_change": stat.mmr_change if stat else None,
                "kills": stat.kills if stat else None,
                "assists": stat.assists if stat else None,
                "deaths": stat.deaths if stat else None,
                "damage_dealt": stat.damage_dealt if stat else None,
                "healing_done": stat.healing_done if stat else None,
                "damage_mitigated": getattr(stat, 'damage_mitigated', None) if stat else None,
                "stat_source": stat.stat_source if stat else None,
            })

        highlights_data = [
            {
                "id": str(h.id),
                "title": h.title,
                "youtube_url": h.youtube_url,
                "user_id": str(h.user_id) if h.user_id else None,
                "registered_at": h.registered_at.isoformat() if h.registered_at else None,
            }
            for h in match.highlights
        ]
    except Exception:
        logger.exception("get_match_detail failed for match_id=%s", match_id)
        raise HTTPException(status_code=500, detail="Failed to load match details")

    return {
        **_match_response(match).model_dump(),
        "participants": participants_data,
        "highlights": highlights_data,
    }


@router.post("/seasons/{season_id}/matches", response_model=MatchResponse, status_code=status.HTTP_201_CREATED)
def create_match(
    season_id: uuid.UUID,
    req: MatchCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

    match = Match(
        community_id=season.community_id,
        season_id=season_id,
        title=req.title,
        scheduled_at=datetime.fromisoformat(req.scheduled_at),
    )
    db.add(match)
    db.commit()
    db.refresh(match)

    community = db.query(Community).filter(Community.id == season.community_id).first()
    if community and community.discord_webhook_url:
        background_tasks.add_task(
            send_match_scheduled,
            community.discord_webhook_url,
            match.title,
            match.scheduled_at.isoformat() if match.scheduled_at else "",
            community.name,
        )

    return _match_response(match)


@router.post("/matches/{match_id}/register", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
def register_for_match(
    match_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if match.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match registration is not open")

    existing = (
        db.query(MatchParticipant)
        .filter(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == current_user.id,
            MatchParticipant.status.in_(["registered", "waitlist"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already registered")

    registered_count = (
        db.query(MatchParticipant)
        .filter(MatchParticipant.match_id == match_id, MatchParticipant.status == "registered")
        .count()
    )

    participant_status = "registered" if registered_count < MAX_PARTICIPANTS else "waitlist"

    participant = MatchParticipant(
        match_id=match_id,
        user_id=current_user.id,
        status=participant_status,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return _participant_response(participant)


@router.delete("/matches/{match_id}/register", status_code=status.HTTP_204_NO_CONTENT)
def cancel_registration(
    match_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    participant = (
        db.query(MatchParticipant)
        .filter(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == current_user.id,
            MatchParticipant.status.in_(["registered", "waitlist"]),
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    was_registered = participant.status == "registered"
    participant.status = "cancelled"

    if was_registered:
        next_waitlist = (
            db.query(MatchParticipant)
            .filter(MatchParticipant.match_id == match_id, MatchParticipant.status == "waitlist")
            .order_by(MatchParticipant.registered_at)
            .first()
        )
        if next_waitlist:
            next_waitlist.status = "registered"

    db.commit()


@router.post("/matches/{match_id}/close-registration")
def close_registration(
    match_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if match.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is not open")

    match.status = "closed"

    participants = (
        db.query(MatchParticipant)
        .filter(MatchParticipant.match_id == match_id, MatchParticipant.status == "registered")
        .all()
    )

    player_data = []
    for p in participants:
        profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == p.user_id).first()
        user = db.query(User).filter(User.id == p.user_id).first()
        player_data.append({
            "user_id": str(p.user_id),
            "participant_id": str(p.id),
            "main_role": profile.main_role if profile else "dps",
            "current_rank": profile.current_rank if profile else None,
            "mmr": profile.mmr if profile else 1000,
            "nickname": user.nickname if user else "",
        })

    balance_result = None
    if len(player_data) >= 2:
        balance_result = auto_balance_teams(player_data)

        team_a_ids = {p["user_id"] for p in balance_result["team_a"]}
        for p in participants:
            if str(p.user_id) in team_a_ids:
                p.team = "A"
            else:
                p.team = "B"

    db.commit()
    db.refresh(match)

    response = _match_response(match)
    if balance_result:
        return {
            **response.model_dump(),
            "balance_result": balance_result["balance_reason"],
        }
    return response


@router.patch("/matches/{match_id}/status", response_model=MatchResponse)
def update_match_status(
    match_id: uuid.UUID,
    req: MatchStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    if req.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}",
        )
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    match.status = req.status
    db.commit()
    db.refresh(match)
    return _match_response(match)


@router.put("/matches/{match_id}/teams", response_model=List[ParticipantResponse])
def adjust_teams(
    match_id: uuid.UUID,
    req: TeamAdjustment,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    for uid_str in req.team_a_user_ids:
        uid = uuid.UUID(uid_str)
        p = db.query(MatchParticipant).filter(
            MatchParticipant.match_id == match_id, MatchParticipant.user_id == uid
        ).first()
        if p:
            p.team = "A"

    for uid_str in req.team_b_user_ids:
        uid = uuid.UUID(uid_str)
        p = db.query(MatchParticipant).filter(
            MatchParticipant.match_id == match_id, MatchParticipant.user_id == uid
        ).first()
        if p:
            p.team = "B"

    db.commit()

    all_participants = db.query(MatchParticipant).filter(
        MatchParticipant.match_id == match_id,
        MatchParticipant.status == "registered",
    ).all()
    return [_participant_response(p) for p in all_participants]


def _compute_stat_bonus(stat: PlayerMatchStat, position: str) -> float:
    """스탯 기반 보너스 (-1.0 ~ 1.0)"""
    score = 0.0
    count = 0

    if stat.kills is not None and stat.deaths is not None:
        kd = stat.kills / max(1, stat.deaths)
        if kd > 2.0:
            score += 1.0
        elif kd > 1.0:
            score += 0.5
        elif kd < 0.5:
            score -= 0.5
        count += 1

    if position in ('dps', 'tank') and stat.damage_dealt is not None:
        if stat.damage_dealt > 10000:
            score += 0.5
        elif stat.damage_dealt > 7000:
            score += 0.25
        count += 1

    if position == 'support' and stat.healing_done is not None:
        if stat.healing_done > 10000:
            score += 0.5
        elif stat.healing_done > 7000:
            score += 0.25
        count += 1

    if count == 0:
        return 0.0
    return max(-1.0, min(1.0, score / count))


@router.post("/matches/{match_id}/result", response_model=MatchResponse)
def submit_result(
    match_id: uuid.UUID,
    req: MatchResult,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    match.map_name = req.map_name
    match.team_a_score = req.team_a_score
    match.team_b_score = req.team_b_score
    match.result = req.result
    match.status = "completed"

    participants = (
        db.query(MatchParticipant)
        .filter(MatchParticipant.match_id == match_id, MatchParticipant.status == "registered")
        .all()
    )

    team_a_score_total = 0.0
    team_b_score_total = 0.0
    team_a_participants = []
    team_b_participants = []

    for p in participants:
        profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == p.user_id).first()
        player_score = compute_player_score(
            profile.current_rank if profile else None,
            profile.mmr if profile else 1000,
        )
        if p.team == "A":
            team_a_score_total += player_score
            team_a_participants.append((p, profile))
        elif p.team == "B":
            team_b_score_total += player_score
            team_b_participants.append((p, profile))

    if req.result != "draw":
        for p, profile in team_a_participants:
            if not profile:
                continue
            is_winner = req.result == "team_a"
            mmr_before = profile.mmr
            change = calculate_mmr_change(is_winner, team_a_score_total, team_b_score_total)
            profile.mmr = max(0, profile.mmr + change)

            existing_stat = (
                db.query(PlayerMatchStat)
                .filter(
                    PlayerMatchStat.match_id == match_id,
                    PlayerMatchStat.user_id == p.user_id,
                )
                .first()
            )
            if existing_stat:
                existing_stat.mmr_before = mmr_before
                existing_stat.mmr_after = profile.mmr
                existing_stat.mmr_change = change
            else:
                existing_stat = PlayerMatchStat(
                    match_id=match_id,
                    user_id=p.user_id,
                    mmr_before=mmr_before,
                    mmr_after=profile.mmr,
                    mmr_change=change,
                )
                db.add(existing_stat)

            # 포지션별 MMR 업데이트
            position = p.assigned_position or (profile.main_role if profile else None)
            if position:
                pos_rank = (
                    db.query(PlayerPositionRank)
                    .filter(
                        PlayerPositionRank.user_id == p.user_id,
                        PlayerPositionRank.position == position,
                        PlayerPositionRank.season_id == None,
                    )
                    .first()
                )
                if pos_rank and pos_rank.mmr is not None:
                    stat_bonus = _compute_stat_bonus(existing_stat, position)
                    pos_change = calc_pos_mmr_change(is_winner, stat_bonus)
                    pos_rank.mmr = max(0, pos_rank.mmr + pos_change)

        for p, profile in team_b_participants:
            if not profile:
                continue
            is_winner = req.result == "team_b"
            mmr_before = profile.mmr
            change = calculate_mmr_change(is_winner, team_b_score_total, team_a_score_total)
            profile.mmr = max(0, profile.mmr + change)

            existing_stat = (
                db.query(PlayerMatchStat)
                .filter(
                    PlayerMatchStat.match_id == match_id,
                    PlayerMatchStat.user_id == p.user_id,
                )
                .first()
            )
            if existing_stat:
                existing_stat.mmr_before = mmr_before
                existing_stat.mmr_after = profile.mmr
                existing_stat.mmr_change = change
            else:
                existing_stat = PlayerMatchStat(
                    match_id=match_id,
                    user_id=p.user_id,
                    mmr_before=mmr_before,
                    mmr_after=profile.mmr,
                    mmr_change=change,
                )
                db.add(existing_stat)

            # 포지션별 MMR 업데이트
            position = p.assigned_position or (profile.main_role if profile else None)
            if position:
                pos_rank = (
                    db.query(PlayerPositionRank)
                    .filter(
                        PlayerPositionRank.user_id == p.user_id,
                        PlayerPositionRank.position == position,
                        PlayerPositionRank.season_id == None,
                    )
                    .first()
                )
                if pos_rank and pos_rank.mmr is not None:
                    stat_bonus = _compute_stat_bonus(existing_stat, position)
                    pos_change = calc_pos_mmr_change(is_winner, stat_bonus)
                    pos_rank.mmr = max(0, pos_rank.mmr + pos_change)

    db.commit()
    db.refresh(match)

    community = db.query(Community).filter(Community.id == match.community_id).first()
    if community and community.discord_webhook_url:
        winner_label = "Team A" if req.result == "team_a" else ("Team B" if req.result == "team_b" else "Draw")
        background_tasks.add_task(
            send_match_result,
            community.discord_webhook_url,
            match.title,
            winner_label,
            match.map_name or "N/A",
        )

    return _match_response(match)


UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "screenshots")


@router.post("/matches/{match_id}/stats/{user_id}")
def upload_player_stat(
    match_id: uuid.UUID,
    user_id: uuid.UUID,
    heroes_played: Optional[str] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    kills: Optional[int] = Form(None),
    assists: Optional[int] = Form(None),
    deaths: Optional[int] = Form(None),
    damage_dealt: Optional[int] = Form(None),
    healing_done: Optional[int] = Form(None),
    damage_mitigated: Optional[int] = Form(None),
    stat_source: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    heroes_list = None
    if heroes_played:
        heroes_list = json.loads(heroes_played)

    screenshot_path = None
    if screenshot:
        match_dir = os.path.join(UPLOAD_DIR, str(match_id))
        os.makedirs(match_dir, exist_ok=True)
        ext = os.path.splitext(screenshot.filename)[1] if screenshot.filename else ".png"
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        filename = f"{user_id}_{timestamp}{ext}"
        filepath = os.path.join(match_dir, filename)
        with open(filepath, "wb") as f:
            f.write(screenshot.file.read())
        screenshot_path = f"/uploads/screenshots/{match_id}/{filename}"

    stat = (
        db.query(PlayerMatchStat)
        .filter(PlayerMatchStat.match_id == match_id, PlayerMatchStat.user_id == user_id)
        .first()
    )

    stat_fields = {
        "kills": kills,
        "assists": assists,
        "deaths": deaths,
        "damage_dealt": damage_dealt,
        "healing_done": healing_done,
        "damage_mitigated": damage_mitigated,
        "stat_source": stat_source or ("manual" if any(v is not None for v in [kills, assists, deaths, damage_dealt, healing_done, damage_mitigated]) else None),
    }

    if stat:
        if heroes_list is not None:
            stat.heroes_played = heroes_list
        if screenshot_path:
            stat.screenshot_path = screenshot_path
        for key, value in stat_fields.items():
            if value is not None:
                setattr(stat, key, value)
    else:
        stat = PlayerMatchStat(
            match_id=match_id,
            user_id=user_id,
            heroes_played=heroes_list,
            screenshot_path=screenshot_path,
            **{k: v for k, v in stat_fields.items() if v is not None},
        )
        db.add(stat)

    db.commit()
    db.refresh(stat)

    return {
        "id": str(stat.id),
        "match_id": str(stat.match_id),
        "user_id": str(stat.user_id),
        "heroes_played": stat.heroes_played,
        "screenshot_path": stat.screenshot_path,
        "kills": stat.kills,
        "assists": stat.assists,
        "deaths": stat.deaths,
        "damage_dealt": stat.damage_dealt,
        "healing_done": stat.healing_done,
        "damage_mitigated": stat.damage_mitigated,
        "stat_source": stat.stat_source,
    }


@router.post("/matches/{match_id}/stats/{user_id}/ocr")
def ocr_extract_stats(
    match_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    stat = (
        db.query(PlayerMatchStat)
        .filter(PlayerMatchStat.match_id == match_id, PlayerMatchStat.user_id == user_id)
        .first()
    )
    if not stat or not stat.screenshot_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot not found")

    # screenshot_path is stored as "/uploads/screenshots/..." — resolve to absolute
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    abs_path = os.path.join(base_dir, stat.screenshot_path.lstrip("/"))

    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot file not found on disk")

    extracted = extract_stats_from_image(abs_path)
    if not extracted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to extract stats from screenshot",
        )

    for key in ("kills", "deaths", "assists", "damage_dealt", "healing_done"):
        value = extracted.get(key)
        if value is not None:
            setattr(stat, key, value)
    stat.stat_source = "ocr"

    db.commit()
    db.refresh(stat)

    return {
        "id": str(stat.id),
        "match_id": str(stat.match_id),
        "user_id": str(stat.user_id),
        "kills": stat.kills,
        "deaths": stat.deaths,
        "assists": stat.assists,
        "damage_dealt": stat.damage_dealt,
        "healing_done": stat.healing_done,
        "stat_source": stat.stat_source,
    }


@router.post("/ocr/extract-scoreboard")
def ocr_extract_scoreboard(
    screenshot: UploadFile = File(...),
):
    """스코어보드 이미지에서 전체 플레이어 스탯을 추출"""
    import tempfile

    ext = os.path.splitext(screenshot.filename)[1] if screenshot.filename else ".png"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(screenshot.file.read())
        tmp_path = tmp.name

    try:
        players = extract_scoreboard_stats(tmp_path)
        if not players:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Failed to extract stats from scoreboard",
            )
        return {"players": players}
    finally:
        os.unlink(tmp_path)
