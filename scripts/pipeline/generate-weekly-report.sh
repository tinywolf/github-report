#!/bin/bash
set -euo pipefail

# 왜: Jenkins/로컬 어디서든 동일하게 리포트를 생성하기 위한 재사용 스크립트.
# 어떻게: npm 의존성을 설치한 뒤 Codex 스크립트를 실행하고 결과 경로를 stdout에 남긴다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_PATH="${GENERATED_REPORT_PATH:-report.md}"

echo "[generate] npm ci 실행 중..."
npm ci

echo "[generate] Codex 리포트 생성 중..."
node scripts/generate-weekly-report.js --output "$OUTPUT_PATH"

echo "$OUTPUT_PATH"
