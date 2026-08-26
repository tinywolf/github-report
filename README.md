# 깃헙 주간 트렌드 리포트

*깃헙 주간 트렌드를 분석하고 간략한 리포트를 작성*

## 개요

이 프로젝트는 GitHub 주간 트렌드 리포트 생성 자동화이자, 비결정적으로 동작하는 모델의 절차 수행 능력을 관찰하기 위한 실험 프로젝트입니다.

데이터 수집이나 형식 검증처럼 일반적으로 코드로 구현할 수 있는 절차도 의도적으로 모델에 위임합니다. 모델은 하나의 Skill 지시에 따라 GitHub Trending 페이지 조회 → 분석 → 리포트 작성 → 파일 저장 → 형식 검증 및 수정 → 임시 파일 정리의 전체 과정을 직접 수행합니다.

실행기는 모델과 추론 수준을 지정하고 격리된 Docker 환경에서 Skill을 호출하는 역할만 담당합니다. 이를 통해 모델의 지시 준수, 도구 활용, 오류 복구 및 결과 일관성을 실제 주간 리포트 생성 과정에서 관찰할 수 있습니다.

## 실행 방법 (Docker 샌드박스)

보안과 일관된 환경을 위해 모든 리포트 생성은 **Docker 컨테이너 내부**에서 수행됩니다.
필수: Docker 설치.
인증은 두 가지 중 하나가 필요합니다.
- `OPENAI_API_KEY` 환경 변수(또는 `.env`)
- 또는 호스트의 `~/.codex/auth.json` 로그인 정보 파일 마운트

과거 리포트는 `weekly-trend/`에 보관하고, 새로 생성하는 리포트 초안은 `weekly-trend-draft/`에 저장합니다. Docker 컨테이너에는 신규 리포트 초안 디렉토리만 마운트됩니다.

### 1. 단독 실행 (리포트 생성만)
이미지를 빌드하고 스크립트를 직접 실행합니다. 로컬의 `weekly-trend-draft` 디렉토리를 연결하여 결과를 확인합니다.

```bash
# 이미지 빌드
docker build -t github-report-generator .
mkdir -p weekly-trend-draft

# 컨테이너 실행 (API 키 방식)
docker run -it --rm \
  -e OPENAI_API_KEY="your-api-key" \
  -v "$(pwd)/weekly-trend-draft:/app/weekly-trend-draft" \
  github-report-generator

# 컨테이너 실행 (OpenAI 구독 로그인 방식, API 키 없음)
docker run -it --rm \
  -v ~/.codex/auth.json:/root/.codex/auth.json:ro \
  -v "$(pwd)/weekly-trend-draft:/app/weekly-trend-draft" \
  github-report-generator
```

- 결과는 `weekly-trend-draft/yyyy-mm-dd.md`로 생성됩니다.
- 덮어쓰려면 `OVERWRITE_WEEKLY_TREND=Y` 환경 변수를 추가하세요. `Y`/`N`, `y`/`n`, `yes`/`no` 형식을 지원합니다.

## run.sh 로 전체 파이프라인 실행
로컬에서 전체 프로세스(생성 → 검토 → 전송)를 한 번에 실행합니다. 내부적으로 Docker를 사용하여 리포트를 생성합니다.
- 필수: Node.js 22, Codex CLI, `AGIT_WEBHOOK`(Agit 웹훅) 환경 변수.
- 인증: `.env`에 `OPENAI_API_KEY`를 넣거나, 키가 없으면 `run.sh`가 자동으로 `~/.codex/auth.json` 파일만 읽기 전용으로 마운트해 실행합니다.
- 모델: 기본값은 `gpt-5.6-terra`입니다. 다른 모델을 사용하려면 `.env` 또는 실행 환경에 `CODEX_MODEL`을 지정하세요.
- 추론 수준: 기본적으로 선택한 모델의 기본값을 사용합니다. 명시하려면 `.env` 또는 실행 환경에 `CODEX_REASONING_EFFORT`를 지정하세요(예: `medium`).
- 실행:
```bash
./run.sh
```
- 동작:
  1. **리포트 생성**: **Docker 컨테이너**가 실행되어 주간 트렌드 리포트를 생성합니다. Codex SDK 가 네트워크 접근과 `danger-full-access` 샌드박스 모드로 실행됩니다.
  2. **사용자 승인**: 리포트 생성이 완료되면 사용자에게 계속 진행할지(`y/n`) 확인을 요청합니다. `weekly-trend-draft/` 디렉토리에서 결과를 직접 확인할 수 있습니다.
  3. **알림 및 정리**: 사용자가 승인(`y`)하면 Agit 웹훅으로 전송하고 생성된 리포트 파일을 정리합니다.

## Codex Skill 직접 실행 (CLI)
프로젝트 내에 등록된 스킬을 CLI에서 직접 실행할 수도 있습니다.
```bash
codex "$weekly-trend-report-writer"
```

## 사용 가능한 Skill 목록 확인
현재 프로젝트에서 사용 가능한 스킬 목록을 확인하려면 다음 스크립트를 실행하세요.
```bash
node scripts/skills.js
```
