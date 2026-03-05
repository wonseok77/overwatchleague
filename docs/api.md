# API 엔드포인트

Base URL: `http://localhost:8000`
인증: `Authorization: Bearer {jwt_token}`

## 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/auth/register` | 이메일 회원가입, JWT 반환 |
| POST | `/auth/login` | 로그인, JWT 반환 |
| GET | `/auth/me` | 내 정보 조회 |

**register body:**
```json
{
  "email", "password", "real_name", "nickname", "community_slug",
  "main_role?", "current_rank?", "main_heroes?: string[]"
}
```

## 커뮤니티 / 멤버

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/communities` | 커뮤니티 생성 |
| GET | `/communities/{slug}` | 정보 조회 |
| GET | `/communities/{id}/members` | 멤버 목록 |
| POST | `/communities/{id}/members` | 멤버 등록 |

## 시즌 / 경기

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/communities/{id}/seasons` | 시즌 목록 |
| POST | `/communities/{id}/seasons` | 시즌 생성 |
| GET | `/seasons/{id}/matches` | 경기 목록 |
| POST | `/seasons/{id}/matches` | 경기 생성 |
| GET | `/matches/{id}` | 경기 상세 (participants + stats + highlights) |
| POST | `/matches/{id}/register` | 참가 신청 |
| DELETE | `/matches/{id}/register` | 참가 취소 |
| POST | `/matches/{id}/close-registration` | 마감 + 팀 자동 구성 |
| PUT | `/matches/{id}/teams` | 팀 수동 조정 |
| POST | `/matches/{id}/result` | 결과 입력 + MMR 계산 + Discord 알림 |

## 프로필 / 스탯

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/users/{id}/profile` | 프로필 + 누적 스탯 + 최근 20경기 + 시즌별 |
| POST | `/users/{id}/avatar` | 아바타 업로드 (본인/admin, JPG/PNG/WebP, 5MB) |
| GET | `/communities/{id}/leaderboard` | MMR 파워랭킹 |

## 하이라이트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/matches/{id}/highlights` | 경기 하이라이트 |
| POST | `/matches/{id}/highlights` | 하이라이트 등록 (운영자) |
| DELETE | `/highlights/{id}` | 삭제 (운영자) |
| GET | `/communities/{id}/highlights` | 커뮤니티 전체 피드 |

## 영웅

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/heroes` | 전체 목록 (역할군→이름 순) |
| POST | `/heroes` | 추가 (admin) |
| PUT | `/heroes/{id}` | 수정 (admin) |
| DELETE | `/heroes/{id}` | 삭제 (admin) |
| POST | `/heroes/{id}/portrait` | 초상화 업로드 (admin) |
| POST | `/heroes/seed` | 기본 영웅 일괄 등록 (admin, 멱등성) |

## Admin (운영자 전용, `/admin` prefix)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/admin/seasons` | 시즌 목록 |
| POST | `/admin/seasons` | 시즌 생성 |
| PATCH | `/admin/seasons/{id}` | 상태 변경 (active/closed) |
| POST | `/admin/seasons/{id}/finalize` | 시즌 집계 (SeasonStat 생성) |
| GET | `/admin/members` | 멤버 목록 |
| PATCH | `/admin/members/{id}` | 멤버 정보 수정 (role, rank) |
| PATCH | `/admin/community/webhook` | Webhook URL 설정 |
| POST | `/admin/community/webhook/test` | Webhook 테스트 발송 |

## Phase 5 예정 엔드포인트

```
GET/POST   /seasons/{id}/sessions          세션 CRUD
POST/DELETE /sessions/{id}/register        세션 신청/취소
POST       /sessions/{id}/matchmake        매치메이킹 실행
POST       /sessions/{id}/matchmake/confirm 확정
POST       /matches/{id}/stats/ocr         OCR 분석
GET/PUT    /users/{id}/ranks               포지션별 랭크 설정
```
