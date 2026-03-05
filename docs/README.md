# OW League 문서 인덱스

> 오버워치 커뮤니티 내전 종합 플랫폼

## 문서 목록

| 파일 | 내용 |
|------|------|
| [api.md](./api.md) | REST API 엔드포인트 명세 |
| [models.md](./models.md) | DB 모델 및 관계 설명 |
| [services.md](./services.md) | 핵심 비즈니스 로직 (밸런싱, Discord, Auth) |
| [components.md](./components.md) | 프론트엔드 컴포넌트 가이드 |
| [setup.md](./setup.md) | 개발 환경 설정 및 실행 방법 |
| [CHANGELOG.md](./CHANGELOG.md) | 변경 이력 |

## 빠른 시작

```bash
cp backend/.env.example backend/.env
docker-compose up --build
docker-compose exec backend alembic upgrade head
```

- 프론트엔드: http://localhost:3000
- API 문서(Swagger): http://localhost:8000/docs

## 구조

```
frontend/   React 18 + Vite + TypeScript + shadcn/ui
backend/    FastAPI + SQLAlchemy + PostgreSQL
```
