# 깃헙 주간 트렌드 리포트

## 실행 방법 (Codex SDK)
필수: Node.js 18+, Codex CLI, `CODEX_API_KEY` 환경 변수 설정.

```bash
npm ci
cp .env.example .env   # 필요한 경우 .env를 만들고 CODEX_API_KEY 값을 채웁니다.
```

`.env`를 사용하지 않는다면 아래처럼 직접 환경 변수를 지정합니다.

```bash
npm ci
CODEX_API_KEY=*** npm run generate:weekly-report
```

- 결과는 `weekly-trend/yyyy-mm-dd.md`로 생성됩니다.
- `.env` 파일이 있으면 스크립트가 자동으로 로드합니다.
- 같은 날짜 파일이 이미 있거나 `--output`으로 지정한 경로가 존재하면 실패하며, 덮어쓰려면 `OVERWRITE_WEEKLY_TREND=1`을 추가합니다.
- 리포트 생성을 위해 Codex를 `--sandbox danger-full-access` 수준으로 실행하며, 네트워크 접근이 필요합니다. 신뢰된 환경에서만 실행하세요.

### 특정 경로로 저장 (덮어쓰기 허용)
```bash
CODEX_API_KEY=*** npm run generate:weekly-report -- --output custom-dir/custom-report.md
```

- `--output`으로 지정한 경로에 저장하며, 덮어쓰려면 `OVERWRITE_WEEKLY_TREND=1`을 같이 설정해야 합니다.

```bash
OVERWRITE_WEEKLY_TREND=1 CODEX_API_KEY=*** npm run generate:weekly-report
```

## run.sh 로 전체 파이프라인 실행 (bash)
- 필수: Node.js 18+, Codex CLI, python3, `CODEX_API_KEY`와 `AGIT_WEBHOOK`(Agit 웹훅) 환경 변수. `.env.example`을 복사해 값을 채우면 자동으로 로드됩니다.
- 선택: `GENERATED_REPORT_PATH`(기본 `report.md`), `OVERWRITE_WEEKLY_TREND`(기본 `1`)로 출력 경로와 덮어쓰기 여부를 조정할 수 있습니다.
- 실행:
```bash
./run.sh
```
- 동작: 리포트를 생성 → Agit 웹훅으로 전송 → 생성된 리포트 파일을 정리합니다.
- Codex 리포트 생성 단계에서 네트워크 접근과 `--sandbox danger-full-access`가 필요하니 신뢰된 환경에서만 실행하세요.

## 프롬프트를 직접 실행해서 weekly-trend 에 파일 저장 (Codex CLI)
```bash
codex -a never --sandbox danger-full-access "$(cat weekly-trend-report-prompt-cli.md)"
```
