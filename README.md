# 깃헙 주간 트렌드 리포트

## 실행 방법 (Docker 샌드박스)
보안과 일관된 환경을 위해 모든 리포트 생성은 **Docker 컨테이너 내부**에서 수행됩니다.
필수: Docker 설치, `OPENAI_API_KEY` 환경 변수 설정 (또는 `.env` 파일).

### 1. 단독 실행 (리포트 생성만)
이미지를 빌드하고 스크립트를 직접 실행합니다. 로컬의 `weekly-trend` 디렉토리를 연결하여 결과를 확인합니다.

```bash
# 이미지 빌드
docker build -t github-report-generator .

# 컨테이너 실행
docker run -it --rm \
  -e OPENAI_API_KEY="your-api-key" \
  -v $(pwd)/weekly-trend:/app/weekly-trend \
  github-report-generator
```

- 결과는 `weekly-trend/yyyy-mm-dd.md`로 생성됩니다.
- 덮어쓰려면 `OVERWRITE_WEEKLY_TREND=1` 환경 변수를 추가하세요.

## run.sh 로 전체 파이프라인 실행
로컬에서 전체 프로세스(생성 → 검토 → 전송)를 한 번에 실행합니다. 내부적으로 Docker를 사용하여 리포트를 생성합니다.
- 필수: Node.js 18+, Codex CLI, `OPENAI_API_KEY`와 `AGIT_WEBHOOK`(Agit 웹훅) 환경 변수. `.env.example`을 복사해 값을 채우면 자동으로 로드됩니다.
- 실행:
```bash
./run.sh
```
- 동작:
  1. **리포트 생성**: **Docker 컨테이너**가 실행되어 주간 트렌드 리포트를 생성합니다. Codex SDK 가 네트워크 접근과 `danger-full-access` 샌드박스 모드로 실행됩니다.
  2. **사용자 승인**: 리포트 생성이 완료되면 사용자에게 계속 진행할지(`y/n`) 확인을 요청합니다. `weekly-trend/` 디렉토리에서 결과를 직접 확인할 수 있습니다.
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
