#!/bin/bash
set -euo pipefail

# 왜: 로컬에서도 Jenkins 파이프라인과 동일한 흐름(생성→전송→정리)을 한 번에 실행하기 위함.
# 어떻게: .env를 로드한 뒤 분리된 파이프라인 스크립트를 순차 실행한다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# .env에 정의된 환경 변수들을 모두 export하여 하위 스크립트에서 사용 가능하게 한다.
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  source ".env"
  set +a
fi

: "${CODEX_API_KEY:?CODEX_API_KEY 가 필요합니다. .env 또는 환경 변수로 설정하세요.}"
: "${AGIT_WEBHOOK:?AGIT_WEBHOOK 이 필요합니다. .env 또는 환경 변수로 설정하세요.}"

export OVERWRITE_WEEKLY_TREND="${OVERWRITE_WEEKLY_TREND:-1}"
export GENERATED_REPORT_PATH="${GENERATED_REPORT_PATH:-report.md}"

scripts/pipeline/generate-weekly-report.sh
scripts/pipeline/process-report.sh
scripts/pipeline/cleanup-report.sh
