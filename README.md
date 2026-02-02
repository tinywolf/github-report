# 깃헙 주간 트렌드 리포트

## 실행 방법 (Codex SDK)
필수: Node.js 18+, Codex CLI, `OPENAI_API_KEY` 환경 변수 설정.

```bash
npm ci
cp .env.example .env   # 필요한 경우 .env를 만들고 OPENAI_API_KEY 값을 채웁니다.
```

`.env`를 사용하지 않는다면 아래처럼 직접 환경 변수를 지정합니다.

```bash
npm ci
OPENAI_API_KEY=*** npm run generate:weekly-report
```

- 결과는 `weekly-trend/yyyy-mm-dd.md`로 생성됩니다.
- `.env` 파일이 있으면 스크립트가 자동으로 로드합니다.
- 본 프로젝트는 **Codex Skills**(`$weekly-trend-report-writer`)를 사용하여 리포트를 생성합니다.
- 같은 날짜 파일이 이미 있거나 지정한 경로가 존재하면 실패하며, 덮어쓰려면 `OVERWRITE_WEEKLY_TREND=1`을 추가합니다.
- 리포트 생성을 위해 Codex를 `danger-full-access` 수준의 샌드박스로 실행하며, 네트워크 접근이 필요합니다. 신뢰된 환경에서만 실행하세요.

### 특정 경로로 저장 (덮어쓰기 허용)
```bash
OPENAI_API_KEY=*** npm run generate:weekly-report -- --output custom-dir/custom-report.md
```

- `--output`으로 지정한 경로에 저장하며, 덮어쓰려면 `OVERWRITE_WEEKLY_TREND=1`을 같이 설정해야 합니다.

```bash
OVERWRITE_WEEKLY_TREND=1 OPENAI_API_KEY=*** npm run generate:weekly-report
```

## run.sh 로 전체 파이프라인 실행 (bash)
- 필수: Node.js 18+, Codex CLI, `OPENAI_API_KEY`와 `AGIT_WEBHOOK`(Agit 웹훅) 환경 변수. `.env.example`을 복사해 값을 채우면 자동으로 로드됩니다.
- 실행:
```bash
./run.sh
```
- 동작:
  1. **리포트 생성**: `generate-weekly-report.sh`가 실행되어 주간 트렌드 리포트를 생성합니다.
  2. **사용자 승인**: 리포트 생성이 완료되면 사용자에게 계속 진행할지(`y/n`) 확인을 요청합니다. `weekly-trend/` 디렉토리에서 결과를 직접 확인할 수 있습니다.
  3. **알림 및 정리**: 사용자가 승인(`y`)하면 Agit 웹훅으로 전송하고 생성된 리포트 파일을 정리합니다.
- Codex 리포트 생성 단계에서 네트워크 접근과 `danger-full-access` 샌드박스가 필요하니 신뢰된 환경에서만 실행하세요.

## Codex Skill 직접 실행 (CLI)
프로젝트 내에 등록된 스킬을 CLI에서 직접 실행할 수도 있습니다.
```bash
codex --sandbox danger-full-access "$weekly-trend-report-writer"
```

## 사용 가능한 Skill 목록 확인
현재 프로젝트에서 사용 가능한 스킬 목록을 확인하려면 다음 스크립트를 실행하세요.
```bash
node scripts/skills.js
```
