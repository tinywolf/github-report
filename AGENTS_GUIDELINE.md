# 프로젝트 설명

- 목적: Codex SDK와 CLI를 활용해 GitHub 주간 트렌드 리포트를 생성·전송하는 자동화를 제공한다.
- 주요 기능: 리포트 생성 및 저장, 덮어쓰기 제어, Agit 웹훅 전송, Jenkins/로컬 파이프라인 실행.
- 기술 스택: Node.js 18+, @openai/codex-sdk, dotenv, Bash 스크립트, Jenkins 파이프라인.

# Setup & Build

- 필수 환경: Node.js 18+, npm, Codex CLI, python3(전송 단계), curl.
- 설치: `npm ci`
- 로컬 실행: `npm run generate:weekly-report` 또는 `./run.sh`
- 빌드: 별도 빌드 단계 없음(스크립트 실행형).
- 설정: `.env`(AGIT_WEBHOOK, OPENAI_API_KEY, OVERWRITE_WEEKLY_TREND), `weekly-trend-report-prompt.md`, 출력 디렉터리 `weekly-trend/`.

# 코드 스타일과 가이드라인

- 포매터/린터: 레포지토리 내 명시된 도구 없음.
- 네이밍 규칙: 스크립트와 환경 변수는 역할이 드러나는 이름을 유지한다.
- 구조/모듈 규칙: Node 스크립트는 `scripts/`, 파이프라인은 `scripts/pipeline/`, 산출물은 `weekly-trend/`.
- 주의 사항: `OVERWRITE_WEEKLY_TREND` 설정 없이는 리포트 덮어쓰기를 금지한다.

# 테스트

- 테스트 종류: 현재 설정된 테스트 없음.
- 실행 방법: 해당 없음.
- 커버리지/게이트: 해당 없음.

# Boundaries

- 금지 작업: 신뢰되지 않은 환경에서 네트워크 접근 또는 `danger-full-access` 실행 금지, 사용자 승인 없이 웹훅 전송 금지.
- 민감 데이터 처리: `.env` 및 API 키/웹훅 URL을 커밋하거나 로그에 노출하지 않는다.
- 확인 필요 사항: 리포트 생성·전송 실행 전 승인 여부, 기존 `weekly-trend/` 파일 덮어쓰기 여부.
