import uuid
from datetime import date, time, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.database import get_db
from app.models.session import MatchSession, SessionRegistration, MatchmakingResult
from app.models.season import Season
from app.models.match import Match, MatchParticipant
from app.models.user import User, PlayerProfile, PlayerPositionRank
from app.schemas.session import (
    SessionCreate,
    SessionUpdate,
    SessionResponse,
    SessionRegistrationCreate,
    SessionRegistrationResponse,
    PositionRankInfo,
)
from app.services.auth import get_current_user, require_admin, require_manager_or_admin
from app.services.matchmaking import (
    run_matchmaking,
    RegistrationInput,
    SessionConfig,
    BalanceWeights,
)
from app.services.discord import send_matchmaking_confirmed
from app.models.community import Community

router = APIRouter(tags=["sessions"])


def _session_response(s: MatchSession) -> SessionResponse:
    reg_count = len([r for r in s.registrations if r.status != "cancelled"])
    return SessionResponse(
        id=str(s.id),
        community_id=str(s.community_id),
        season_id=str(s.season_id),
        title=s.title,
        scheduled_date=s.scheduled_date.isoformat() if s.scheduled_date else "",
        scheduled_start=s.scheduled_start.isoformat()[:5] if s.scheduled_start else None,
        total_games=s.total_games,
        status=s.status,
        team_size=s.team_size,
        tank_count=s.tank_count,
        dps_count=s.dps_count,
        support_count=s.support_count,
        discord_announced=s.discord_announced,
        created_at=s.created_at.isoformat() if s.created_at else None,
        registration_count=reg_count,
    )


def _registration_response(
    r: SessionRegistration,
    nickname: Optional[str] = None,
    current_rank: Optional[str] = None,
    position_ranks: Optional[List[PositionRankInfo]] = None,
) -> SessionRegistrationResponse:
    return SessionRegistrationResponse(
        id=str(r.id),
        session_id=str(r.session_id),
        user_id=str(r.user_id),
        priority_1=r.priority_1,
        priority_2=r.priority_2,
        priority_3=r.priority_3,
        min_games=r.min_games,
        max_games=r.max_games,
        status=r.status,
        registered_at=r.registered_at.isoformat() if r.registered_at else None,
        nickname=nickname,
        current_rank=current_rank,
        position_ranks=position_ranks or [],
    )


# --- Session CRUD ---

@router.get("/seasons/{season_id}/sessions", response_model=List[SessionResponse])
def list_sessions(
    season_id: uuid.UUID,
    month: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(MatchSession).filter(MatchSession.season_id == season_id)
    if month:
        try:
            year, m = month.split("-")
            start = date(int(year), int(m), 1)
            if int(m) == 12:
                end = date(int(year) + 1, 1, 1)
            else:
                end = date(int(year), int(m) + 1, 1)
            query = query.filter(MatchSession.scheduled_date >= start, MatchSession.scheduled_date < end)
        except (ValueError, IndexError):
            pass
    sessions = query.order_by(MatchSession.scheduled_date).all()
    return [_session_response(s) for s in sessions]


@router.post("/seasons/{season_id}/sessions", response_model=SessionResponse, status_code=201)
def create_session(
    season_id: uuid.UUID,
    body: SessionCreate,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

    scheduled_start = None
    if body.scheduled_start:
        try:
            parts = body.scheduled_start.split(":")
            scheduled_start = time(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Invalid time format, use HH:MM")

    session = MatchSession(
        id=uuid.uuid4(),
        community_id=admin.community_id,
        season_id=season_id,
        title=body.title,
        scheduled_date=date.fromisoformat(body.scheduled_date),
        scheduled_start=scheduled_start,
        total_games=body.total_games,
        team_size=body.team_size,
        tank_count=body.tank_count,
        dps_count=body.dps_count,
        support_count=body.support_count,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_response(session)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return _session_response(session)


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
def update_session(
    session_id: uuid.UUID,
    body: SessionUpdate,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    update_data = body.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key == "scheduled_date" and value:
            setattr(session, key, date.fromisoformat(value))
        elif key == "scheduled_start" and value:
            parts = value.split(":")
            setattr(session, key, time(int(parts[0]), int(parts[1])))
        else:
            setattr(session, key, value)

    db.commit()
    db.refresh(session)
    return _session_response(session)


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: uuid.UUID,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Only open sessions can be deleted")
    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}


# --- Session Registration ---

@router.post("/sessions/{session_id}/register", response_model=SessionRegistrationResponse, status_code=201)
def register_for_session(
    session_id: uuid.UUID,
    body: SessionRegistrationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Session is not open for registration")

    existing = db.query(SessionRegistration).filter(
        SessionRegistration.session_id == session_id,
        SessionRegistration.user_id == current_user.id,
        SessionRegistration.status != "cancelled",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already registered for this session")

    # 시즌 랭크 설정 여부 확인
    if session.season_id:
        season_ranks = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == current_user.id,
            PlayerPositionRank.season_id == session.season_id,
        ).all()
        if not season_ranks:
            raise HTTPException(
                status_code=422,
                detail="시즌 포지션 랭크가 설정되지 않았습니다. 프로필에서 현재 시즌의 포지션별 랭크를 먼저 설정해주세요."
            )

    reg = SessionRegistration(
        id=uuid.uuid4(),
        session_id=session_id,
        user_id=current_user.id,
        priority_1=body.priority_1,
        priority_2=body.priority_2,
        priority_3=body.priority_3,
        min_games=body.min_games,
        max_games=body.max_games,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return _registration_response(reg, nickname=current_user.nickname)


# --- Admin: register another member ---

class AdminRegisterRequest(BaseModel):
    user_id: str
    priority_1: str = "dps"
    priority_2: Optional[str] = None
    priority_3: Optional[str] = None
    min_games: int = 1
    max_games: int = 999


@router.post("/sessions/{session_id}/register-member", response_model=SessionRegistrationResponse, status_code=201)
def admin_register_member(
    session_id: uuid.UUID,
    body: AdminRegisterRequest,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Session is not open for registration")

    target_user = db.query(User).filter(User.id == body.user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target_user.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not in your community")

    existing = db.query(SessionRegistration).filter(
        SessionRegistration.session_id == session_id,
        SessionRegistration.user_id == target_user.id,
        SessionRegistration.status != "cancelled",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already registered for this session")

    # 시즌 랭크 설정 여부 확인 (관리자 대리 등록도 차단)
    if session.season_id:
        season_ranks = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == target_user.id,
            PlayerPositionRank.season_id == session.season_id,
        ).all()
        if not season_ranks:
            raise HTTPException(
                status_code=422,
                detail="해당 멤버의 시즌 포지션 랭크가 설정되지 않았습니다. 프로필에서 현재 시즌의 포지션별 랭크를 먼저 설정해주세요."
            )

    reg = SessionRegistration(
        id=uuid.uuid4(),
        session_id=session_id,
        user_id=target_user.id,
        priority_1=body.priority_1,
        priority_2=body.priority_2,
        priority_3=body.priority_3,
        min_games=body.min_games,
        max_games=body.max_games,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return _registration_response(reg, nickname=target_user.nickname)


@router.patch("/sessions/{session_id}/register", response_model=SessionRegistrationResponse)
def update_my_registration(
    session_id: uuid.UUID,
    body: SessionRegistrationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Session is not open")
    reg = db.query(SessionRegistration).filter(
        SessionRegistration.session_id == session_id,
        SessionRegistration.user_id == current_user.id,
        SessionRegistration.status != "cancelled",
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    reg.priority_1 = body.priority_1
    reg.priority_2 = body.priority_2
    reg.priority_3 = body.priority_3
    reg.min_games = body.min_games
    reg.max_games = body.max_games
    db.commit()
    db.refresh(reg)
    return _registration_response(reg, nickname=current_user.nickname)


@router.delete("/sessions/{session_id}/register")
def cancel_registration(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Session is not open for cancellation")

    reg = db.query(SessionRegistration).filter(
        SessionRegistration.session_id == session_id,
        SessionRegistration.user_id == current_user.id,
        SessionRegistration.status != "cancelled",
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")

    reg.status = "cancelled"
    db.commit()
    return {"message": "Registration cancelled"}


@router.get("/sessions/{session_id}/registrations", response_model=List[SessionRegistrationResponse])
def list_registrations(
    session_id: uuid.UUID,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    regs = db.query(SessionRegistration).filter(
        SessionRegistration.session_id == session_id,
        SessionRegistration.status != "cancelled",
    ).all()

    user_ids = [r.user_id for r in regs]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    profiles = {p.user_id: p for p in db.query(PlayerProfile).filter(PlayerProfile.user_id.in_(user_ids)).all()}
    pos_ranks_all = db.query(PlayerPositionRank).filter(
        PlayerPositionRank.user_id.in_(user_ids),
        PlayerPositionRank.season_id == session.season_id if session.season_id else PlayerPositionRank.season_id.is_(None),
    ).all()
    pos_ranks_map: Dict[Any, List[PositionRankInfo]] = {}
    for pr in pos_ranks_all:
        pos_ranks_map.setdefault(pr.user_id, []).append(
            PositionRankInfo(position=pr.position, rank=pr.rank, mmr=pr.mmr)
        )

    results = []
    for r in regs:
        user = users.get(r.user_id)
        profile = profiles.get(r.user_id)
        results.append(_registration_response(
            r,
            nickname=user.nickname if user else None,
            current_rank=profile.current_rank if profile else None,
            position_ranks=pos_ranks_map.get(r.user_id, []),
        ))
    return results


@router.patch("/sessions/{session_id}/registrations/{user_id}", response_model=SessionRegistrationResponse)
def update_registration(
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    body: SessionRegistrationCreate,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    reg = db.query(SessionRegistration).filter(
        SessionRegistration.session_id == session_id,
        SessionRegistration.user_id == user_id,
        SessionRegistration.status != "cancelled",
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")

    reg.priority_1 = body.priority_1
    reg.priority_2 = body.priority_2
    reg.priority_3 = body.priority_3
    reg.min_games = body.min_games
    reg.max_games = body.max_games
    db.commit()
    db.refresh(reg)

    user = db.query(User).filter(User.id == user_id).first()
    profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == user_id).first()
    return _registration_response(
        reg,
        nickname=user.nickname if user else None,
        current_rank=profile.current_rank if profile else None,
    )


# --- Matchmaking ---

class MatchmakeRequest(BaseModel):
    pass


def _build_registration_inputs(db: Session, registrations: List[SessionRegistration], season_id: uuid.UUID = None) -> List[RegistrationInput]:
    user_ids = [r.user_id for r in registrations]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    profiles = {p.user_id: p for p in db.query(PlayerProfile).filter(PlayerProfile.user_id.in_(user_ids)).all()}
    position_ranks_all = db.query(PlayerPositionRank).filter(
        PlayerPositionRank.user_id.in_(user_ids),
        PlayerPositionRank.season_id == season_id if season_id else PlayerPositionRank.season_id.is_(None),
    ).all()
    pos_ranks_map: dict = {}
    for pr in position_ranks_all:
        pos_ranks_map.setdefault(pr.user_id, {})[pr.position] = {"rank": pr.rank, "mmr": pr.mmr}

    # season_id 데이터가 없는 유저는 global(NULL) 데이터로 폴백
    if season_id:
        missing_users = [uid for uid in user_ids if uid not in pos_ranks_map]
        if missing_users:
            fallback_ranks = db.query(PlayerPositionRank).filter(
                PlayerPositionRank.user_id.in_(missing_users),
                PlayerPositionRank.season_id.is_(None),
            ).all()
            for pr in fallback_ranks:
                pos_ranks_map.setdefault(pr.user_id, {})[pr.position] = {"rank": pr.rank, "mmr": pr.mmr}

    result = []
    for reg in registrations:
        user = users.get(reg.user_id)
        profile = profiles.get(reg.user_id)
        result.append(RegistrationInput(
            user_id=str(reg.user_id),
            nickname=user.nickname if user else "Unknown",
            priority_1=reg.priority_1,
            priority_2=reg.priority_2,
            priority_3=reg.priority_3,
            min_games=reg.min_games,
            max_games=reg.max_games,
            registered_at=reg.registered_at,
            current_rank=profile.current_rank if profile else None,
            mmr=profile.mmr if profile else 1000,
            win_rate=profile.win_rate if profile and profile.win_rate else 0.0,
            position_ranks={k: v for k, v in pos_ranks_map.get(reg.user_id, {}).items()},
        ))
    return result


def _format_matchmaking_result(
    raw: Dict[str, Any],
    registrations: List[RegistrationInput],
) -> Dict[str, Any]:
    """Transform raw matchmaking output to match the frontend MatchmakingResult shape."""
    reg_map = {r.user_id: r for r in registrations}

    # Transform games: flatten balance_summary, rename balance_score -> score, drop assignment_reason
    formatted_games = []
    for game in raw.get("games", []):
        balance = game.get("balance_summary", {})
        def _format_player(p):
            reg = reg_map.get(p["user_id"])
            pos = p["assigned_position"]
            pos_info = reg.position_ranks.get(pos, {}) if reg else {}
            pos_mmr = p["balance_score"]
            pos_rank = pos_info.get("rank") or (reg.current_rank if reg else None)
            return {
                "user_id": p["user_id"],
                "nickname": p["nickname"],
                "assigned_position": p["assigned_position"],
                "priority_used": p["priority_used"],
                "score": p["balance_score"],
                "mmr": pos_mmr,
                "rank": pos_rank,
            }

        formatted_game = {
            "game_no": game["game_no"],
            "team_a": [_format_player(p) for p in game.get("team_a", [])],
            "team_b": [_format_player(p) for p in game.get("team_b", [])],
            "team_a_score": balance.get("team_a_score", 0),
            "team_b_score": balance.get("team_b_score", 0),
            "score_diff": balance.get("score_diff", 0),
            "team_a_avg_mmr": balance.get("team_a_avg_mmr", 0),
            "team_b_avg_mmr": balance.get("team_b_avg_mmr", 0),
            "mmr_diff": balance.get("mmr_diff", 0),
        }
        formatted_games.append(formatted_game)

    # waitlist (list of user_ids) -> bench (list of objects with user_id, nickname, reason)
    bench = []
    for uid in raw.get("waitlist", []):
        reg = reg_map.get(uid)
        bench.append({
            "user_id": uid,
            "nickname": reg.nickname if reg else "Unknown",
            "reason": "game_count_zero",
        })

    # player_game_counts (dict) -> player_stats (list of objects)
    priority_counts = raw.get("priority_counts", {})
    player_stats = []
    for uid, count in raw.get("player_game_counts", {}).items():
        reg = reg_map.get(uid)
        prio = priority_counts.get(uid, {})
        player_stats.append({
            "user_id": uid,
            "nickname": reg.nickname if reg else "Unknown",
            "games_played": count,
            "priority_1_count": prio.get(1, 0),
            "priority_2_count": prio.get(2, 0),
            "priority_3_count": prio.get(3, 0),
            "forced_count": prio.get(0, 0),
        })

    return {
        "session_id": raw.get("session_id"),
        "games": formatted_games,
        "bench": bench,
        "player_stats": player_stats,
    }


@router.post("/sessions/{session_id}/matchmake")
def matchmake(
    session_id: uuid.UUID,
    body: MatchmakeRequest,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status not in ("open", "closed", "in_progress"):
        raise HTTPException(status_code=400, detail="Matchmaking only available for open/closed/in-progress sessions")

    regs = db.query(SessionRegistration).filter(
        SessionRegistration.session_id == session_id,
        SessionRegistration.status == "registered",
    ).all()

    reg_inputs = _build_registration_inputs(db, regs, session.season_id)

    config = SessionConfig(
        session_id=str(session.id),
        total_games=session.total_games,
        team_size=session.team_size,
        tank_count=session.tank_count,
        dps_count=session.dps_count,
        support_count=session.support_count,
    )
    weights = BalanceWeights(rank=0.0, mmr=1.0, win_rate=0.0, stat_score=0.0)
    raw_result = run_matchmaking(config, reg_inputs, weights)
    result = _format_matchmaking_result(raw_result, reg_inputs)

    mm_result = MatchmakingResult(
        id=uuid.uuid4(),
        session_id=session.id,
        is_confirmed=False,
        algorithm_version="v1.0",
        summary_json=result,
    )
    db.add(mm_result)

    session.status = "closed"
    db.commit()
    db.refresh(mm_result)

    return {**result, "id": str(mm_result.id), "is_confirmed": False}


@router.get("/sessions/{session_id}/matchmake/preview")
def get_matchmake_preview(
    session_id: uuid.UUID,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    mm_result = db.query(MatchmakingResult).filter(
        MatchmakingResult.session_id == session_id,
    ).order_by(MatchmakingResult.generated_at.desc()).first()
    if not mm_result:
        raise HTTPException(status_code=404, detail="No matchmaking result found")

    data = mm_result.summary_json or {}
    return {
        **data,
        "id": str(mm_result.id),
        "session_id": str(mm_result.session_id),
        "generated_at": mm_result.generated_at.isoformat() if mm_result.generated_at else None,
        "is_confirmed": mm_result.is_confirmed,
    }


@router.post("/sessions/{session_id}/matchmake/confirm")
def confirm_matchmaking(
    session_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    mm_result = db.query(MatchmakingResult).filter(
        MatchmakingResult.session_id == session_id,
        MatchmakingResult.is_confirmed == False,
    ).order_by(MatchmakingResult.generated_at.desc()).first()
    if not mm_result:
        raise HTTPException(status_code=400, detail="No unconfirmed matchmaking result found")

    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    summary = mm_result.summary_json or {}
    games = summary.get("games", [])
    matches_created = 0

    for game in games:
        match = Match(
            id=uuid.uuid4(),
            community_id=session.community_id,
            season_id=session.season_id,
            title=f"{session.title} - Game {game['game_no']}",
            scheduled_at=datetime.combine(session.scheduled_date, session.scheduled_start or time(0, 0)),
            status="in_progress",
        )
        db.add(match)
        db.flush()

        for team_key, team_side in [("team_a", "A"), ("team_b", "B")]:
            for player in game.get(team_key, []):
                participant = MatchParticipant(
                    id=uuid.uuid4(),
                    match_id=match.id,
                    user_id=uuid.UUID(player["user_id"]),
                    status="confirmed",
                    team=team_side,
                    session_id=session.id,
                    assigned_position=player.get("assigned_position"),
                    priority_used=player.get("priority_used"),
                    session_game_no=game["game_no"],
                )
                db.add(participant)

        matches_created += 1

    mm_result.is_confirmed = True
    session.status = "in_progress"
    db.commit()

    # Discord Webhook 알림
    community = db.query(Community).filter(Community.id == session.community_id).first()
    if community and community.discord_webhook_url:
        background_tasks.add_task(
            send_matchmaking_confirmed,
            community.discord_webhook_url,
            session.title,
            games,
        )

    match_ids = [str(m.id) for m in db.query(Match).filter(
        Match.id.in_([p.match_id for p in db.query(MatchParticipant.match_id).filter(
            MatchParticipant.session_id == session_id
        ).distinct()])
    ).all()]

    return {"message": "Matchmaking confirmed", "matches_created": matches_created, "match_ids": match_ids}


@router.get("/sessions/{session_id}/matches")
def get_session_matches(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    session = db.query(MatchSession).filter(MatchSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    match_ids_q = (
        db.query(MatchParticipant.match_id)
        .filter(MatchParticipant.session_id == session_id)
        .distinct()
    )
    matches = (
        db.query(Match)
        .filter(Match.id.in_(match_ids_q))
        .order_by(Match.title)
        .all()
    )

    return [
        {
            "id": str(m.id),
            "title": m.title,
            "status": m.status,
            "map_name": m.map_name,
            "result": m.result,
            "team_a_score": m.team_a_score,
            "team_b_score": m.team_b_score,
            "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        }
        for m in matches
    ]
