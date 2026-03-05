# 개발 환경 설정

## 빠른 시작 (Docker)

```bash
# 1. 환경변수
cp backend/.env.example backend/.env
# backend/.env 수정: SECRET_KEY, DISCORD_WEBHOOK_URL (선택)

# 2. 빌드 및 실행
docker-compose up --build

# 3. DB 마이그레이션
docker-compose exec backend alembic upgrade head

# 4. 영웅 시드 데이터 (선택)
# Admin 계정으로 POST /heroes/seed 호출
```

- 프론트엔드: http://localhost:3000
- API 문서: http://localhost:8000/docs

## 로컬 개발 (Docker 없이)

### 백엔드
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 프론트엔드
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```
Vite dev server가 `/api` 요청을 `localhost:8000`으로 프록시.

## 테스트

```bash
# 백엔드
cd backend && python3 -m pytest tests/ -v

# 프론트엔드
cd frontend && npx vitest run

# 빌드 검증
cd frontend && npm run build
```

## 환경변수 (`backend/.env`)

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://user:pass@db:5432/owleague` |
| `SECRET_KEY` | JWT 서명 키 | 필수 |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL | 선택 |

## 알려진 이슈

- `bcrypt<4.1` 고정 필요 — passlib 호환성
- SQLite 테스트에서 `ARRAY` 타입 미지원 → TypeDecorator로 TEXT 변환 (2 skipped)
- Python 3.9: `str | None` 문법 미지원 → `Optional[str]` 사용
