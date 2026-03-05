## Phase 3 API 계약서

### 공통 사항
- 모든 `/admin/*` 엔드포인트: `Authorization: Bearer {token}` 필수
- 인증/인가: 기존 `require_admin` 의존성 활용 (`get_current_user` -> role=admin 체크)
- 에러 응답: 기존 HTTPException 패턴 (401 Unauthorized, 403 Forbidden, 404 Not Found, 400 Bad Request)
- UUID 필드는 응답에서 `str`로 직렬화 (기존 패턴)
- Python 3.9: `Optional[str]` 사용 (`str | None` 불가)

---

### 시즌 관리 API

#### GET /admin/seasons
시즌 목록 조회. admin의 `community_id`로 자동 필터링.

- **Auth**: `require_admin`
- **Response**: `List[AdminSeasonResponse]`

```python
class AdminSeasonResponse(BaseModel):
    id: str
    name: str
    status: str          # "active" | "closed"
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    created_at: Optional[str] = None  # started_at과 동일 (Season 모델에 created_at 없음, started_at 활용)

    class Config:
        from_attributes = True
```

#### POST /admin/seasons
시즌 생성.

- **Auth**: `require_admin`
- **Request**:
```python
class AdminSeasonCreate(BaseModel):
    name: str
    description: Optional[str] = None  # 향후 확장용, Season 모델에 description 없으므로 현재는 무시
```
- **Response**: `AdminSeasonResponse` (201 Created)
- **로직**: `Season(community_id=admin.community_id, name=req.name)` 생성

#### PATCH /admin/seasons/{season_id}
시즌 상태 변경.

- **Auth**: `require_admin`
- **Request**:
```python
class AdminSeasonUpdate(BaseModel):
    status: str  # "active" | "closed"
```
- **Response**: `AdminSeasonResponse`
- **로직**:
  - season.community_id == admin.community_id 검증
  - status="closed"이면 ended_at = datetime.utcnow()
  - 이미 같은 상태면 400

#### POST /admin/seasons/{season_id}/finalize
시즌 집계 실행. 해당 시즌의 모든 매치 결과를 기반으로 `season_stats` 레코드 생성.

- **Auth**: `require_admin`
- **Precondition**: season.status == "closed" (아니면 400)
- **Response**:
```python
class FinalizeResponse(BaseModel):
    message: str           # "Season finalized successfully"
    stats_created: int     # 생성된 SeasonStat 레코드 수
```
- **로직** (S4에서 구현):
  1. 해당 시즌의 모든 Match에서 PlayerMatchStat 집계
  2. 유저별 wins, losses, win_rate 계산
  3. MMR 기준 rank_position 산출
  4. SeasonStat 레코드 upsert
  5. 기존 stats 있으면 삭제 후 재생성 (멱등성)

---

### 멤버 관리 API

#### GET /admin/members
커뮤니티 멤버 목록 조회. admin의 `community_id`로 자동 필터링.

- **Auth**: `require_admin`
- **Response**: `List[AdminMemberResponse]`

```python
class AdminMemberResponse(BaseModel):
    user_id: str
    nickname: str
    real_name: str
    email: str
    role: str              # "admin" | "member"
    main_role: Optional[str] = None   # "tank" | "dps" | "support"
    current_rank: Optional[str] = None
    mmr: Optional[int] = None

    class Config:
        from_attributes = True
```

#### PATCH /admin/members/{user_id}
멤버 역할 또는 랭크 변경.

- **Auth**: `require_admin`
- **Request**:
```python
class AdminMemberUpdate(BaseModel):
    role: Optional[str] = None            # "admin" | "member"
    current_rank: Optional[str] = None
```
- **Response**: `AdminMemberResponse`
- **로직**:
  - user.community_id == admin.community_id 검증
  - role 변경: user.role 업데이트
  - current_rank 변경: user.profile.current_rank 업데이트 (profile 없으면 무시 또는 400)

---

### Webhook API

#### PATCH /admin/community/webhook
Discord webhook URL 저장/변경.

- **Auth**: `require_admin`
- **Request**:
```python
class WebhookUpdate(BaseModel):
    webhook_url: Optional[str] = None  # None이면 제거
```
- **Response**:
```python
class WebhookResponse(BaseModel):
    message: str                        # "Webhook URL updated"
    webhook_url: Optional[str] = None
```
- **로직**: `community.discord_webhook_url = req.webhook_url` 저장

#### POST /admin/community/webhook/test
테스트 메시지 발송.

- **Auth**: `require_admin`
- **Response**:
```python
class WebhookTestResponse(BaseModel):
    message: str  # "Test message sent successfully" | "No webhook URL configured"
```
- **로직**:
  - community.discord_webhook_url 없으면 400
  - Discord webhook으로 테스트 embed 전송 (httpx/requests)
  - 실패 시 502 Bad Gateway

---

### 프론트엔드 TypeScript 타입

```typescript
// --- 시즌 관리 ---
interface AdminSeasonResponse {
  id: string;
  name: string;
  status: 'active' | 'closed';
  started_at: string | null;
  ended_at: string | null;
}

interface AdminSeasonCreate {
  name: string;
  description?: string;
}

interface AdminSeasonUpdate {
  status: 'active' | 'closed';
}

interface FinalizeResponse {
  message: string;
  stats_created: number;
}

// --- 멤버 관리 ---
interface AdminMemberResponse {
  user_id: string;
  nickname: string;
  real_name: string;
  email: string;
  role: 'admin' | 'member';
  main_role: 'tank' | 'dps' | 'support' | null;
  current_rank: string | null;
  mmr: number | null;
}

interface AdminMemberUpdate {
  role?: 'admin' | 'member';
  current_rank?: string;
}

// --- Webhook ---
interface WebhookUpdate {
  webhook_url: string | null;
}

interface WebhookResponse {
  message: string;
  webhook_url: string | null;
}

interface WebhookTestResponse {
  message: string;
}
```

---

### 모델 변경 사항

#### Community 모델
- `discord_webhook_url` 필드 **이미 존재** (`String(500), nullable=True`)
- 추가 마이그레이션 불필요

#### Season 모델
- 현재 필드: id, community_id, name, status, started_at, ended_at
- description 필드 없음 (AdminSeasonCreate의 description은 현재 무시, 필요시 향후 추가)
- 추가 마이그레이션 불필요

#### SeasonStat 모델 (이미 존재)
- 위치: `backend/app/models/match.py:80`
- 필드: id, season_id, user_id, wins, losses, win_rate, final_mmr, rank_position
- finalize 엔드포인트가 이 테이블에 레코드 생성

---

### 라우터 구조

새 파일: `backend/app/routers/admin.py`
- prefix: `/admin`
- 모든 엔드포인트에 `admin: User = Depends(require_admin)` 적용
- admin.community_id로 자동 스코핑 (URL에 community_id 불필요)

```python
router = APIRouter(prefix="/admin", tags=["admin"])
```

기존 라우터(seasons.py, members.py)는 수정하지 않음. admin 전용 엔드포인트를 별도 라우터로 분리.

---

### 주의사항
- Python 3.9: `Optional[str]` 사용 (`str | None` 불가)
- SQLAlchemy relationship: selectin 로딩 패턴 유지 (User.profile 접근 시)
- 기존 `require_admin` 함수가 이미 get_current_user + role 체크를 처리
- admin.community_id를 활용하여 URL에서 community_id 파라미터 제거 (보안 + 간결함)
- finalize 로직은 S4 태스크에서 구현, 이 계약은 인터페이스만 정의
