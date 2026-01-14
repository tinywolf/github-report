#!/bin/bash
set -euo pipefail

# 왜: Jenkins/로컬 어디서든 동일하게 리포트를 생성하기 위한 재사용 스크립트.
# 어떻게: npm 의존성을 설치한 뒤 Codex 스크립트를 실행하고 결과 경로를 stdout에 남긴다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# .env에 정의된 환경 변수들을 모두 export하여 하위 스크립트에서 사용 가능하게 한다.
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  source ".env"
  set +a
fi

: "${OPENAI_API_KEY:?OPENAI_API_KEY 가 필요합니다. .env 또는 환경 변수로 설정하세요.}"

export OVERWRITE_WEEKLY_TREND="${OVERWRITE_WEEKLY_TREND:-1}"

echo "[generate] npm ci 실행 중..."
npm ci

echo "[generate] 리포트 생성 중..."
node scripts/generate-weekly-report.js
