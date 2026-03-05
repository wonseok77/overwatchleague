# SPEC.md: 오버워치 커뮤니티 내전 종합 플랫폼

> 기반 문서: PRD.md
> 작성일: 2026-03-05
> 상태: v1.0

---

## 개요

오버워치 내전 커뮤니티를 위한 팀 자동 밸런싱, 참가 신청, 스탯 누적, 하이라이트 아카이브 종합 웹 플랫폼.

---

## 기술 스택

| 레이어 | 기술 | 비고 |
|--------|------|------|
| 프론트엔드 | React (Vite) + TypeScript | SPA |
| UI 라이브러리 | TailwindCSS + shadcn/ui | 화이트 + 현대적 카드 스타일 |
| 백엔드 | FastAPI (Python 3.11+) | REST API |
| ORM | SQLAlchemy + Alembic | 마이그레이션 관리 |
| 데이터베이스 | PostgreSQL | 로컬 + 향후 Supabase 전환 가능 |
| 파일 저장 | 로컬 파일시스템 → 향후 Supabase Storage | 스크린샷 저장 |
| 인증 | JWT (이메일/비밀번호) + Discord OAuth (선택적 연동) | |
| Discord 알림 | Discord Webhook (HTTP POST) | Bot 아닌 Webhook |
| 배포 | Docker Compose | 로컬 서버 (무료 우선) |

---

## 아키텍처

```
[React SPA] ←→ [FastAPI] ←→ [PostgreSQL]
                    ↓
            [Discord Webhook]
                    ↓
            [로컬 파일시스템]
            (스크린샷 저장)
```

### 디렉토리 구조

```
ow-league/
├── frontend/          # React (Vite) + TypeScript
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── api/       # API 클라이언트
│   └── vite.config.ts
├── backend/           # FastAPI
│   ├── app/
│   │   ├── routers/
│   │   ├── models/    # SQLAlchemy 모델
│   │   ├── schemas/   # Pydantic 스키마
│   │   ├── services/  # 비즈니스 로직 (밸런싱 알고리즘 등)
│   │   └── main.py
│   ├── alembic/       # DB 마이그레이션
│   └── requirements.txt
├── docker-compose.yml
└── PRD.md
```

---

## 데이터 모델

### `communities` (커뮤니티 - 멀티 테넌트)
```sql
id            UUID PRIMARY KEY
name          VARCHAR(100) NOT NULL
slug          VARCHAR(50) UNIQUE NOT NULL  -- URL 식별자
description   TEXT
discord_webhook_url  VARCHAR(500)
created_at    TIMESTAMP
```

### `users` (유저)
```sql
id              UUID PRIMARY KEY
community_id    UUID REFERENCES communities
real_name       VARCHAR(50) NOT NULL        -- 본명 (식별용)
nickname        VARCHAR(50) NOT NULL        -- 현재 닉네임
discord_id      VARCHAR(50)                 -- Discord 사용자 ID (선택)
email           VARCHAR(200) UNIQUE
password_hash   VARCHAR(200)
role            ENUM('admin', 'member')     -- admin: 운영자
avatar_url      VARCHAR(500)               -- 프로필 사진 경로 (/uploads/avatars/{user_id}.{ext})
created_at      TIMESTAMP
```

### `player_profiles` (플레이어 게임 프로필)
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users UNIQUE
main_role       ENUM('tank', 'dps', 'support')
current_rank    VARCHAR(30)                 -- 메인 역할군 현시즌 공식 랭크 (fallback용)
current_sr      INTEGER                     -- SR 수치 (선택적)
main_heroes     VARCHAR(50)[]               -- 주 영웅 Top 3 배열
mmr             INTEGER DEFAULT 1000        -- 내전 누적 MMR
win_rate        FLOAT DEFAULT 0.0           -- 누적 승률 (밸런싱 계산용, 경기 결과 시 갱신)
```

### `player_position_ranks` (포지션별 · 시즌별 티어)
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users
season_id       UUID REFERENCES seasons     -- NULL = 현재 공식 시즌 (비시즌 포함)
position        ENUM('tank', 'dps', 'support')
rank            VARCHAR(30)                 -- 예: "Diamond 3"
updated_at      TIMESTAMP
UNIQUE (user_id, season_id, position)
```

**설계 근거:**
- 같은 플레이어가 포지션마다 다른 티어를 가질 수 있음 (DPS Diamond, Tank Gold 등)
- 시즌별로 히스토리 보존 (이전 시즌 랭크 확인 가능)
- `season_id = NULL`: 현재 공식 랭크 (시즌 외 기간 포함)
- 밸런싱 시 우선순위: `position_rank(해당 포지션)` > `player_profiles.current_rank` (fallback)

### `seasons` (시즌)
```sql
id              UUID PRIMARY KEY
community_id    UUID REFERENCES communities
name            VARCHAR(100) NOT NULL       -- 예: "2026 시즌 1"
status          ENUM('active', 'closed')
started_at      TIMESTAMP
ended_at        TIMESTAMP
```

### `matches` (내전 일정 + 경기)
```sql
id              UUID PRIMARY KEY
community_id    UUID REFERENCES communities
season_id       UUID REFERENCES seasons
title           VARCHAR(100)               -- 예: "2026.03.10 정기 내전"
scheduled_at    TIMESTAMP                  -- 예정 일시
status          ENUM('open', 'closed', 'in_progress', 'completed')
map_name        VARCHAR(100)               -- 경기 맵 (결과 입력 시)
team_a_score    INTEGER
team_b_score    INTEGER
result          ENUM('team_a', 'team_b', 'draw')
discord_announced  BOOLEAN DEFAULT FALSE
created_at      TIMESTAMP
```

### `match_participants` (경기 참가자)
```sql
id              UUID PRIMARY KEY
match_id        UUID REFERENCES matches
user_id         UUID REFERENCES users
status          ENUM('registered', 'waitlist', 'cancelled', 'confirmed')
team            ENUM('A', 'B')             -- 팀 배정 결과
registered_at   TIMESTAMP
```

### `player_match_stats` (경기별 개인 스탯)
```sql
id              UUID PRIMARY KEY
match_id        UUID REFERENCES matches
user_id         UUID REFERENCES users
heroes_played   VARCHAR(50)[]              -- 해당 경기에서 플레이한 영웅들
screenshot_path VARCHAR(500)              -- 스코어카드 스크린샷 경로
mmr_before      INTEGER
mmr_after       INTEGER
mmr_change      INTEGER                   -- +/- 변동량
```

### `highlights` (하이라이트)
```sql
id              UUID PRIMARY KEY
match_id        UUID REFERENCES matches
user_id         UUID REFERENCES users     -- 주인공 플레이어 (선택)
title           VARCHAR(200)
youtube_url     VARCHAR(500)              -- YouTube 링크
registered_at   TIMESTAMP
```

### `season_stats` (시즌 집계 스탯 - 캐시 테이블)
```sql
id              UUID PRIMARY KEY
season_id       UUID REFERENCES seasons
user_id         UUID REFERENCES users
wins            INTEGER DEFAULT 0
losses          INTEGER DEFAULT 0
win_rate        FLOAT                     -- 승률 (%)
final_mmr       INTEGER
rank_position   INTEGER                   -- 시즌 최종 순위
```

### `heroes` (영웅 목록 - DB 관리)
```sql
id              UUID PRIMARY KEY
name            VARCHAR(50) UNIQUE NOT NULL  -- 영웅 이름 (예: "Genji")
role            ENUM('tank', 'dps', 'support')
portrait_url    VARCHAR(500)               -- Blizzard CDN URL 또는 /uploads/heroes/{id}.png
is_custom       BOOLEAN DEFAULT FALSE      -- TRUE = 관리자가 직접 업로드한 이미지
created_at      TIMESTAMP
```

**설계 근거:**
- 영웅 목록을 DB에 저장하여 신규 영웅 출시 시 Admin 페이지에서 즉시 추가 가능
- `portrait_url`이 `NULL`이면 영웅 이름 첫 글자 아바타로 폴백
- 기본 영웅은 `POST /heroes/seed`로 Blizzard CDN URL과 함께 일괄 등록
- 신규 영웅은 `POST /heroes/{id}/portrait`로 이미지 직접 업로드 가능

---

## API 설계

### 인증
```
POST /auth/register          이메일 회원가입
POST /auth/login             로그인 (JWT 반환)
GET  /auth/discord/callback  Discord OAuth 콜백
```

### 커뮤니티
```
POST /communities            커뮤니티 생성 (운영자)
GET  /communities/{slug}     커뮤니티 정보
```

### 멤버
```
GET  /communities/{id}/members          멤버 목록
POST /communities/{id}/members          멤버 등록 (본명, 닉네임, 역할군, 랭크 등)
PUT  /communities/{id}/members/{uid}    멤버 정보 수정
```

### 시즌
```
GET  /communities/{id}/seasons          시즌 목록
POST /communities/{id}/seasons          시즌 생성 (운영자)
PUT  /seasons/{id}/close                시즌 종료 (운영자)
```

### 내전 일정
```
GET  /seasons/{id}/matches              경기 목록
POST /seasons/{id}/matches              내전 일정 등록 (운영자)
POST /matches/{id}/register             참가 신청
DELETE /matches/{id}/register           참가 취소
POST /matches/{id}/close-registration   참가 마감 + 팀 자동 구성 트리거 (운영자)
PUT  /matches/{id}/teams                팀 수동 조정 (운영자)
POST /matches/{id}/result               경기 결과 입력 (운영자)
```

### 스탯 / 프로필
```
POST /matches/{id}/stats/{uid}          개인 스탯 + 스크린샷 업로드 (운영자)
GET  /communities/{id}/leaderboard      커뮤니티 파워랭킹
GET  /users/{id}/profile                개인 프로필 + 누적 스탯
POST /users/{id}/avatar                 프로필 사진 업로드 (본인 or 관리자, JPG/PNG/WebP, 최대 5MB)
GET  /seasons/{id}/stats                시즌 집계 스탯
```

### 포지션 랭크
```
GET  /users/{id}/ranks                  포지션별 · 시즌별 랭크 목록
PUT  /users/{id}/ranks                  포지션별 랭크 설정 (본인 or 관리자)
                                        body: [{position, rank, season_id?}]
GET  /users/{id}/ranks/current          현재 시즌 포지션별 랭크 요약
```

### 하이라이트
```
GET  /matches/{id}/highlights           경기별 하이라이트
POST /matches/{id}/highlights           하이라이트 등록 (운영자)
GET  /communities/{id}/highlights       커뮤니티 하이라이트 피드
```

### 영웅 관리
```
GET  /heroes                            전체 영웅 목록 (역할군→이름 순)
POST /heroes                            영웅 추가 (관리자)
PUT  /heroes/{id}                       영웅 수정 (관리자)
DELETE /heroes/{id}                     영웅 삭제 (관리자)
POST /heroes/{id}/portrait              영웅 초상화 이미지 업로드 (관리자, 최대 5MB)
POST /heroes/seed                       기본 영웅 일괄 등록 (관리자, 멱등성 보장)
```

---

## 팀 밸런싱 알고리즘

> Phase 1~4 단순 경기용. Phase 5 세션 매치메이킹은 아래 "매치메이킹 시스템" 섹션의 3단계를 사용.

### 입력
- 참가자 목록: `[{user_id, main_role, current_rank, mmr, win_rate, role_stats}]`
- 팀 인원: 기본 5v5 (조정 가능)

### 알고리즘

```python
# 1단계: 역할군 균형 보장
# 각 팀에 Tank 1, DPS 2, Support 2 목표 (5인 기준)
# 참가자 역할군 분포에 따라 최선 배분

# 2단계: 점수 균형
# rank_score 변환:
#   Bronze=1~Silver=2~Gold=3~Platinum=4~Diamond=5~Master=6~Grandmaster=7~Champion=8
#   세부 단계: "Diamond 3" → 5.0 - (3-1)*0.1 = 4.8
#
# balance_score = (rank_score * 0.3) + (mmr/200 * 0.4)
#               + (win_rate * 0.2) + (role_stat_score * 0.1)
#
# itertools.combinations으로 모든 A팀 조합 탐색 (≤10명)
# 팀A 총점 vs 팀B 총점 차이 최소화
```

### 투명성 출력
```json
{
  "team_a": [...],
  "team_b": [...],
  "balance_reason": {
    "team_a_score": 28.4,
    "team_b_score": 27.9,
    "score_diff": 0.5,
    "role_distribution": {
      "team_a": {"tank": 1, "dps": 2, "support": 2},
      "team_b": {"tank": 1, "dps": 2, "support": 2}
    }
  }
}
```

### MMR 변동
- 승리: +20 (기본), 상대팀 점수가 높으면 보너스 최대 +10
- 패배: -20 (기본), 상대팀 점수가 낮으면 페널티 최대 -10
- 무승부: ±0

---

## Discord Webhook 연동

### 설정
- 커뮤니티 생성 시 Discord Webhook URL 등록 (선택)
- 환경변수: `DISCORD_WEBHOOK_URL`

### 발송 시점 4가지
1. **내전 일정 등록 시** → 날짜/시간, 참가 신청 링크 포함
2. **참가 신청 마감 시** → 최종 참가자 명단
3. **팀 구성 완료 시** → A팀/B팀 멤버 목록 + 밸런스 점수
4. **경기 결과 업로드 시** → 승패, 맵, MVP 하이라이트 링크

### 구현
```python
import httpx

async def send_discord_webhook(webhook_url: str, embed: dict):
    async with httpx.AsyncClient() as client:
        await client.post(webhook_url, json={"embeds": [embed]})
```

---

## UI 상세 명세

### 디자인 시스템
- 스타일: 화이트 배경 + 현대적 카드 UI
- 컴포넌트: shadcn/ui 기반
- 색상 포인트: OW 브랜드 오렌지(#F99E1A) + 파란색(#4FC1E9)
- 폰트: Pretendard (한글) / Inter (영문)
- 반응형: Mobile First (내전 당일 스마트폰 사용 고려)

### 페이지 목록

#### 1. 메인 (랜딩)
- 다음 내전 일정 카드 (D-day, 참가 인원 바)
- 파워랭킹 Top 5 미리보기
- 최근 경기 결과 피드
- 로그인/회원가입 버튼

#### 2. 내전 생성 페이지
- **레이아웃**: 좌측 월별 달력 + 우측 세션 상세 패널 (2-column)
- **달력**:
  - 내전이 있는 날짜: 오렌지 점(dot) 표시
  - 날짜 클릭 → 우측 패널에 해당 날 세션 목록 또는 EmptyState
  - 운영자: EmptyState 상태에서 "내전 생성" 버튼 노출
- **세션 카드** (날짜 선택 후 우측):
  - 세션 제목, 시작 시각, 총 경기 수, 현재 신청자 수
  - 멤버: "신청하기" 버튼 → 신청 폼 슬라이드 오픈
  - 운영자: "매치메이킹 실행" 버튼 (마감 후)
- **신청 폼** (슬라이드 패널):
  - 1지망 포지션 (필수)
  - 2지망 포지션 (선택)
  - 3지망 포지션 (선택)
  - 참가 희망 경기 수: 최소/최대 입력
- **내전 생성 폼** (운영자, 모달):
  - 제목 (자동 생성: "YYYY.MM.DD 정기 내전"), 시작 시각
  - 총 경기 수, 팀당 인원, 포지션 구성 (Tank/DPS/Support 수)
  - 밸런싱 가중치 슬라이더
  - Discord 알림 발송 여부 토글
- 빈 상태 시 EmptyState 컴포넌트 표시

#### 3. 팀 구성 페이지 (운영자 전용)
- 자동 구성 결과 표시
- 드래그앤드롭으로 수동 조정
- 밸런스 점수 + 역할군 분포 시각화
- Discord 발송 버튼

#### 4. 경기 기록 페이지 (운영자 전용)
- 맵 선택, 승패 입력
- 참가자별 영웅 선택 (Most 3 중 1개 선택)
- 스크린샷 업로드 (선택)
- 저장 시 MMR 자동 계산 + Discord 알림

#### 5. 파워랭킹 / 리더보드
- 시즌 선택 드롭다운
- MMR 순위표 (순위, 본명, 닉네임, 역할군, 승/패, 승률, MMR)
- 역할군별 필터 (Tank / DPS / Support)

#### 6. 개인 프로필
- 기본 정보 (닉네임, 본명 이니셜, 역할군, 메인 영웅)
- **포지션별 티어 설정** (본인 프로필에서 편집 가능):
  - Tank / DPS / Support 각각 랭크 선택 드롭다운
  - 현재 시즌 기준으로 저장, 시즌별 히스토리 조회 가능
  - 설정하지 않은 포지션은 `current_rank` (메인 랭크) fallback 표시
- 시즌별 스탯 탭
- 경기 히스토리 (최근 20경기)
- 하이라이트 목록

#### 7. 하이라이트 피드
- 커뮤니티 전체 하이라이트 (YouTube 임베드)
- 플레이어 필터
- 경기별 연결

#### 8. 운영자 대시보드
- 시즌 관리 (열기/닫기)
- 멤버 관리 (추가/수정/권한 변경)
- Webhook 설정
- 통계 요약

---

## 시즌 운영 플로우

```
운영자: 시즌 생성 (이름 입력)
  ↓
status: 'active'
  ↓
경기 반복: 내전 일정 등록 → 참가 신청 → 팀 구성 → 경기 결과 입력
  ↓
운영자: 시즌 종료 버튼 클릭
  ↓
status: 'closed'
  ↓
season_stats 테이블에 최종 집계 저장 (MMR 스냅샷)
  ↓
다음 시즌 생성 시 MMR은 이전 시즌 최종값에서 10% 수렴 후 시작
(예: 이전 1200 → 다음 시즌 시작 MMR = 1180, 이전 800 → 820)
```

---

## 스크린샷 업로드

- 운영자가 경기 결과 입력 시 스코어카드 스크린샷 업로드 (선택)
- 파일 저장: `/uploads/screenshots/{match_id}/` 폴더
- 파일 타입: JPG, PNG, WebP (최대 10MB)
- 뷰어: 경기 상세 페이지에서 클릭하면 원본 사이즈로 보기

---

## 인증 플로우

### 이메일 가입
```
POST /auth/register
  { email, password, real_name, nickname, community_slug }
  → 커뮤니티 슬러그로 소속 커뮤니티 자동 연결
  → JWT 반환
```

### Discord 연동 (선택)
```
GET /auth/discord/connect  (로그인 상태에서)
  → Discord OAuth 인증
  → users.discord_id 업데이트
  → 이후 Discord ID로 닉네임 자동 동기화 가능
```

### 권한 체계
- `member`: 참가 신청/취소, 프로필 조회
- `admin`: 위 + 시즌 관리, 경기 결과 입력, 팀 구성, 멤버 관리

---

## Docker Compose 구성

```yaml
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/owleague
      - SECRET_KEY=...
    depends_on:
      - db
    volumes:
      - ./uploads:/app/uploads  # 스크린샷 저장

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: owleague
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 보안 고려사항

- JWT 토큰: HS256, 만료 7일, Refresh Token 지원
- 비밀번호: bcrypt 해싱 (cost factor 12)
- 파일 업로드: 확장자 화이트리스트 + MIME 타입 검증
- 운영자 전용 엔드포인트: `role == 'admin'` 미들웨어 보호
- CORS: 프론트엔드 도메인만 허용
- SQL 인젝션: SQLAlchemy ORM 사용으로 방지

---

## 테스트 계획

### 백엔드
- pytest + httpx AsyncClient
- 팀 밸런싱 알고리즘 단위 테스트 (역할군 균형 보장 검증)
- API 엔드포인트 통합 테스트

### 프론트엔드
- Vitest + Testing Library
- 팀 구성 화면 컴포넌트 테스트

---

## 매치메이킹 시스템 (Phase 5)

> 인터뷰 완료: 2026-03-05
> 기존 match 기반 구조에 MatchSession(하루 단위) 레이어를 추가

### 개요

기존 경기(match) 단위 신청에서 **세션(하루 내전 행사) 단위 신청**으로 확장.
운영자가 "총 N경기 진행" 설정 → 알고리즘이 참가자를 균등 배분하여 경기 목록을 자동 생성.

---

### 신규 데이터 모델

#### `match_sessions` (내전 세션 - 하루 단위)
```sql
id                UUID PRIMARY KEY
community_id      UUID REFERENCES communities
season_id         UUID REFERENCES seasons
title             VARCHAR(100)              -- 예: "2026.03.15 정기 내전"
scheduled_date    DATE                      -- 날짜 (시간 없음)
scheduled_start   TIME                      -- 시작 시각
total_games       INTEGER DEFAULT 0         -- 운영자가 설정하는 총 경기 수
status            ENUM('open', 'closed', 'in_progress', 'completed')
team_size         INTEGER DEFAULT 5         -- 팀 당 인원 (기본 5v5)
tank_count        INTEGER DEFAULT 1         -- 팀 당 Tank 수
dps_count         INTEGER DEFAULT 2         -- 팀 당 DPS 수
support_count     INTEGER DEFAULT 2         -- 팀 당 Support 수
discord_announced BOOLEAN DEFAULT FALSE
created_at        TIMESTAMP
```

#### `session_registrations` (세션 신청 - 지망 우선순위 포함)
```sql
id                UUID PRIMARY KEY
session_id        UUID REFERENCES match_sessions
user_id           UUID REFERENCES users
priority_1        ENUM('tank', 'dps', 'support')  -- 1지망 포지션
priority_2        ENUM('tank', 'dps', 'support')  -- 2지망 포지션 (선택)
priority_3        ENUM('tank', 'dps', 'support')  -- 3지망 포지션 (선택)
min_games         INTEGER DEFAULT 1               -- 최소 참가 경기 수
max_games         INTEGER DEFAULT 999             -- 최대 참가 경기 수
status            ENUM('registered', 'waitlist', 'cancelled')
registered_at     TIMESTAMP
```

#### `matchmaking_results` (매치메이킹 결과 - 미리보기 + 확정)
```sql
id                UUID PRIMARY KEY
session_id        UUID REFERENCES match_sessions
generated_at      TIMESTAMP
is_confirmed      BOOLEAN DEFAULT FALSE    -- FALSE=미리보기, TRUE=확정
algorithm_version VARCHAR(20)             -- 알고리즘 버전 기록
summary_json      JSONB                   -- 전체 결과 스냅샷 (조정 내역 포함)
```

#### `ocr_configs` (OCR 설정 - 운영자 어드민)
```sql
id                UUID PRIMARY KEY
community_id      UUID REFERENCES communities
engine            ENUM('claude_vision', 'tesseract')  -- 기본: claude_vision
claude_model      VARCHAR(50) DEFAULT 'claude-opus-4-5'
tesseract_lang    VARCHAR(20) DEFAULT 'eng'
is_enabled        BOOLEAN DEFAULT TRUE
updated_at        TIMESTAMP
```

#### `match_participants` 확장 컬럼
```sql
-- 기존 컬럼에 추가
session_id        UUID REFERENCES match_sessions   -- 세션 연결
assigned_position ENUM('tank', 'dps', 'support')  -- 배정된 포지션
priority_used     INTEGER                          -- 몇 지망으로 배정됐는지 (1/2/3)
session_game_no   INTEGER                          -- 세션 내 몇 번째 경기
```

#### `player_match_stats` 확장 컬럼
```sql
-- 기존 컬럼에 추가
kills             INTEGER
deaths            INTEGER
assists           INTEGER
damage_dealt      INTEGER
healing_done      INTEGER
survivability_pct FLOAT                  -- 생존률 (%)
stat_source       ENUM('manual', 'ocr')  -- 입력 방식
```

---

### 신규 API 엔드포인트

#### 세션 관리
```
GET    /seasons/{id}/sessions              세션 목록 (달력 뷰용)
POST   /seasons/{id}/sessions              세션 생성 (운영자)
GET    /sessions/{id}                      세션 상세 (신청자 목록 포함)
PATCH  /sessions/{id}                      세션 수정 (total_games, team_size 등)
DELETE /sessions/{id}                      세션 삭제 (운영자)
```

#### 세션 신청
```
POST   /sessions/{id}/register             세션 신청 (priority_1/2/3, min/max_games)
DELETE /sessions/{id}/register             세션 신청 취소
GET    /sessions/{id}/registrations        신청자 목록 (운영자)
PATCH  /sessions/{id}/registrations/{uid}  신청 정보 수정 (운영자)
```

#### 매치메이킹 실행
```
POST   /sessions/{id}/matchmake            매치메이킹 실행 → 미리보기 반환
GET    /sessions/{id}/matchmake/preview    최신 미리보기 조회
PATCH  /sessions/{id}/matchmake/preview    미리보기 수동 조정 (팀/포지션 변경)
POST   /sessions/{id}/matchmake/confirm    미리보기 확정 → matches 일괄 생성
```

#### OCR 스탯 추출
```
POST   /matches/{id}/stats/ocr             스크린샷 → OCR → JSON 반환 (저장 안 함)
POST   /matches/{id}/stats/ocr/confirm     OCR 결과 확인 후 저장 (운영자)
GET    /admin/ocr-config                   OCR 설정 조회 (운영자)
PATCH  /admin/ocr-config                   OCR 설정 변경 (engine/model 등)
```

---

### 매치메이킹 알고리즘

#### 입력
```python
{
  "session": {total_games, team_size, tank_count, dps_count, support_count},
  "registrations": [
    {user_id, priority_1, priority_2, priority_3, min_games, max_games,
     current_rank,  # 예: "Diamond 3" → rank_score 변환용
     mmr, win_rate,
     role_stats: {tank: score, dps: score, support: score},
     registered_at: datetime}  # 동점 시 신청 순서
  ],
  "balance_weights": {rank: 0.3, mmr: 0.4, win_rate: 0.2, stat_score: 0.1}  # admin 설정, 합계 1.0
}
```

#### 알고리즘 (3단계)

```python
# 전제: 이전 세션 출전 횟수는 고려하지 않음.
#       당일 세션 내에서만 균등 분배를 보장한다.

# 공통 초기화
session_games = {user_id: 0 for user in registrations}  # 당일 출전 횟수

# 1단계: 후보 정렬 기준 (각 경기마다 매번 재정렬)
# 우선순위:
#   [1] session_games[user] 오름차순  ← 핵심: 당일 덜 뛴 사람 먼저
#   [2] min_games 미달 플레이어 우선  ← 최소 참가 횟수 보장
#   [3] max_games 초과 플레이어 제외
#   [4] 동점이면 신청 시각 빠른 순

# 2단계: 경기별 순환 배정
# for game_no in range(total_games):
#   for position, count in [(tank, tank_count), (dps, dps_count), (support, support_count)]:
#     candidates = [p for p in registrations
#                   if session_games[p.user_id] < p.max_games
#                   and not already_selected_this_game(p)]
#     candidates.sort(key=lambda p: (
#         0 if session_games[p.user_id] < p.min_games else 1,  # min_games 미달 우선
#         session_games[p.user_id],                             # 당일 적게 뛴 순
#         p.registered_at                                       # 신청 시각
#     ))
#     # 포지션 슬롯 채우기: 1지망 → 2지망 → 3지망 순
#     selected = pick_by_priority(candidates, position, count)
#     for p in selected:
#         session_games[p.user_id] += 1
#         record(p, priority_used, game_no)
#
# waitlist = [p for p in registrations if session_games[p.user_id] == 0]

# 3단계: 팀 밸런싱 (경기별)
#
# rank_score 변환:
#   Bronze=1.0, Silver=2.0, Gold=3.0, Platinum=4.0,
#   Diamond=5.0, Master=6.0, Grandmaster=7.0, Champion=8.0
#   세부 단계 반영: "Diamond 3" → 5.0 - (3-1)*0.1 = 4.8
#                  "Diamond 1" → 5.0 - (1-1)*0.1 = 5.0
#
# 랭크 우선순위 (포지션별 랭크 > 메인 랭크 fallback):
#   rank_to_use = position_ranks.get(assigned_position)
#                 or player_profiles.current_rank
#
# balance_score = (rank_score * w_rank) + (mmr/200 * w_mmr)
#               + (win_rate * w_win_rate) + (role_stat_score * w_stat)
# * mmr을 rank_score와 스케일 맞추기 위해 /200 정규화 (1000mmr → 5.0)
#
# role_stat_score: 배정된 포지션별 스탯 점수
#   tank    → survivability_pct (생존률) + damage_dealt/1000
#   dps     → (kills + assists) / deaths (KDA) + damage_dealt/1000
#   support → healing_done/1000 + assists/5
#
# itertools.combinations으로 모든 A팀 조합 탐색 (≤10명 완전탐색)
# 팀A 총점 vs 팀B 총점 차이 최소화
```

**균등 분배 보장 근거:**
- 매 경기 선발 시 `session_games` 적은 순으로 정렬 → 자동 로테이션
- 이상적 배분: `total_games × slots_per_game / 총신청자` 경기/인
- 오차 범위: **최대 ±1경기** (포지션 슬롯 제약으로 인한 불가피한 편차)
- `prev_session_games`(이전 날짜 기록) 미사용 — 당일 공정성만 보장

#### 결과 JSON 형식
```json
{
  "session_id": "...",
  "games": [
    {
      "game_no": 1,
      "team_a": [
        {
          "user_id": "...",
          "nickname": "...",
          "assigned_position": "tank",
          "priority_used": 1,
          "balance_score": 28.4,
          "assignment_reason": "1지망(탱커) 배정 | Diamond 2 (4.9) | MMR 1250 | 승률 62%"
        }
      ],
      "team_b": [...],
      "balance_summary": {
        "team_a_score": 139.2,
        "team_b_score": 138.7,
        "score_diff": 0.5,
        "role_distribution": {
          "team_a": {"tank": 1, "dps": 2, "support": 2},
          "team_b": {"tank": 1, "dps": 2, "support": 2}
        }
      }
    }
  ],
  "waitlist": ["user_id_1", "user_id_2"],
  "player_game_counts": {
    "user_id_abc": 2,
    "user_id_def": 2,
    "user_id_ghi": 1
  },
  "stats": {
    "avg_games_per_player": 2.0,
    "max_games_played": 2,
    "min_games_played": 1,
    "avg_priority_used": 1.4,
    "waitlist_count": 2,
    "score_diff_avg": 0.6
  }
}
```

#### 밸런싱 가중치 (admin 설정, 합계 1.0)
| 항목 | 기본값 | 스케일 | 설명 |
|------|--------|--------|------|
| rank_weight | 0.3 | 1.0~8.0 | 공식 티어 (Bronze~Champion, 세부단계 반영) |
| mmr_weight | 0.4 | mmr/200 | 내전 누적 MMR (1000→5.0으로 정규화) |
| win_rate_weight | 0.2 | 0.0~1.0 | 승률 |
| stat_score_weight | 0.1 | 0.0~10.0 | 포지션별 스탯 (딜/힐/KDA, 경기 경험 없으면 0) |

---

### OCR 플로우 (스코어보드 자동 인식)

```
운영자: 스크린샷 업로드
  ↓
POST /matches/{id}/stats/ocr
  ↓
백엔드: Claude Vision API 호출
  payload: { image_base64, prompt: "OW scoreboard JSON 추출" }
  반환: { kills, deaths, assists, damage_dealt, healing_done, heroes_played }
  ↓
실패 or admin 설정 engine=tesseract:
  Tesseract fallback (로컬 OCR)
  ↓
프론트엔드: 수정 가능한 폼으로 OCR 결과 표시
  (각 플레이어 행을 테이블로 렌더링, 셀 클릭 시 인라인 편집)
  ↓
운영자: 확인 후 저장 버튼
  ↓
POST /matches/{id}/stats/ocr/confirm → DB 저장 + MMR 계산
```

**Claude Vision 프롬프트 템플릿:**
```
다음 오버워치 경기 스코어보드 이미지에서 모든 플레이어의 스탯을 JSON으로 추출해줘.

반환 형식:
{
  "players": [
    {
      "nickname": "...",
      "hero": "...",
      "kills": 0,
      "deaths": 0,
      "assists": 0,
      "damage": 0,
      "healing": 0,
      "team": "A" or "B"
    }
  ]
}

인식 불가한 값은 null로 표시.
```

---

### UI 플로우

#### 세션 생성 및 매치메이킹 (운영자)
```
1. 내전 생성 탭 → 달력에서 날짜 클릭 → 우측 패널 "내전 생성" 버튼
2. 세션 생성 모달:
   - 제목 (자동: "YYYY.MM.DD 정기 내전"), 시작 시각
   - 총 경기 수 (N경기)
   - 팀당 인원 (기본 5v5)
   - 포지션 구성 (Tank/DPS/Support 수)
   - 밸런싱 가중치 (MMR/승률/스탯 슬라이더, 합계 100%)
   - Discord 알림 발송 여부 토글
3. 저장 → 달력 해당 날짜에 오렌지 점 표시
4. 신청 기간 중 → 우측 패널에 신청자 명단 실시간 확인
5. 마감 후 → "매치메이킹 실행" 버튼 활성화
6. 미리보기 화면 (전체 페이지로 전환):
   - 상단: 요약 바 (신청자 N명, N경기, 1인당 평균 N경기, waitlist N명)
   - 경기별 탭 (1경기 | 2경기 | ...)
   - 각 탭: A팀/B팀 카드 목록 + 균형 점수 바
   - 플레이어 카드: 닉네임, 포지션 아이콘, "1지망 배정" / "2지망 배정" 뱃지
   - 드래그앤드롭으로 팀 간/포지션 수동 조정
7. "확정" 버튼 → matches 일괄 생성 → Discord 알림
```

#### 세션 신청 (멤버)
```
1. 내전 생성 탭 → 달력에서 날짜 클릭 → 우측 패널 세션 카드
2. "신청하기" 버튼 → 슬라이드 패널 오픈:
   - 1지망 포지션 (필수)
   - 2지망 포지션 (선택)
   - 3지망 포지션 (선택)
   - 참가 희망 경기 수: 최소 N경기 ~ 최대 M경기
3. 신청 완료 → 세션 카드에 "신청됨 ✓" 뱃지
4. 매치메이킹 확정 후 → 몇 경기 배정됐는지 표시 ("2경기 배정됨")
```

#### 경기 결과 + OCR (운영자)
```
1. 경기 상세 → "결과 입력" 탭
2. 스크린샷 업로드 (drag & drop)
3. "OCR 분석" 버튼 → 로딩 스피너
4. OCR 결과 → 편집 가능한 테이블 렌더링
   - 각 셀: 클릭 시 인라인 편집 가능
   - 인식 실패(null) 셀: 빨간 테두리 표시
5. 확인 후 "저장" 버튼 → 스탯 저장 + MMR 재계산
```

---

## 마일스톤

### Phase 1: MVP (핵심 루프)
- [ ] Docker Compose 환경 구성 (PostgreSQL + FastAPI + React)
- [ ] DB 스키마 + Alembic 마이그레이션
- [ ] 이메일 인증 + JWT
- [ ] 멤버 등록 (본명, 닉네임, 역할군, 랭크)
- [ ] 내전 일정 등록 + 참가 신청/취소
- [ ] 팀 자동 밸런싱 알고리즘 + 수동 조정
- [ ] Discord Webhook (팀 구성 완료 알림)

### Phase 2: 스탯 & 기록
- [ ] 경기 결과 입력 (맵, 승패)
- [ ] 개인 스탯 기록 (영웅, 스크린샷)
- [ ] MMR 자동 계산
- [ ] 파워랭킹 / 리더보드
- [ ] 개인 프로필 페이지

### Phase 3: 시즌 & 하이라이트
- [ ] 시즌 관리 (열기/닫기/아카이브)
- [ ] 시즌 집계 스탯
- [ ] 하이라이트 YouTube 임베드
- [ ] Discord Webhook 나머지 3가지

### Phase 4: 멀티 테넌트
- [ ] 커뮤니티 생성 온보딩 플로우
- [ ] 커뮤니티 디렉토리
- [ ] 공동 운영자 권한

### Phase 5: 매치메이킹 고도화
- [ ] `match_sessions` 모델 + alembic 마이그레이션
- [ ] `session_registrations` 모델 (1/2/3지망 + min/max_games)
- [ ] `matchmaking_results` 모델 (미리보기 스냅샷)
- [ ] `ocr_configs` 모델
- [ ] `match_participants` 확장 (assigned_position, priority_used, session_game_no)
- [ ] `player_match_stats` 확장 (kills/deaths/assists/damage/healing, stat_source)
- [ ] `player_position_ranks` 신규 모델 + alembic 마이그레이션
- [ ] `player_profiles.win_rate` 컬럼 추가
- [ ] 포지션 랭크 API (`GET/PUT /users/{id}/ranks`)
- [ ] ProfilePage 포지션별 티어 편집 UI (Tank/DPS/Support 드롭다운, 시즌별 히스토리)
- [ ] 세션 CRUD API (`/seasons/{id}/sessions`)
- [ ] 세션 신청 API (`/sessions/{id}/register`, priority + min/max)
- [ ] 매치메이킹 실행 API (`/sessions/{id}/matchmake`)
- [ ] 미리보기 수동 조정 + 확정 API
- [ ] OCR API (`/matches/{id}/stats/ocr`, Claude Vision → Tesseract fallback)
- [ ] OCR 설정 API (`/admin/ocr-config`)
- [ ] 세션 신청 UI (1/2/3지망 + min/max 설정)
- [ ] 매치메이킹 미리보기 화면 (경기별 탭, 드래그앤드롭, 배정 이유 패널)
- [ ] OCR 결과 편집 테이블 UI
- [ ] 밸런싱 가중치 슬라이더 (Admin 설정)

---

## 열린 질문

- [ ] 초기 MMR 세팅: 공식 랭크 → MMR 변환 테이블 확정 필요 (예: Bronze=800, Silver=900, Gold=1000...)
- [ ] 스크린샷 OCR 파싱: v1은 Claude Vision API, v2는 Tesseract fallback 토글
- [ ] Discord OAuth 범위: `identify` + `guilds` 스코프 필요, 서버 멤버십 확인으로 가입 제한 가능 (추후 고려)
- [ ] 밸런싱 가중치 기본값: mmr=0.5 / win_rate=0.3 / stat_score=0.2 (추후 커뮤니티별 조정 가능)

---

## 구현 시작

새 세션에서 다음으로 구현을 시작하세요:

```
SPEC.md 읽고 구현 시작해줘
```

구현 완료 후 검증:

```
/spec-verify
```
