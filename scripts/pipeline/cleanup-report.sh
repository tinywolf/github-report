#!/bin/bash
set -euo pipefail

# 왜: 파이프라인 실행 후 워크스페이스를 깨끗하게 유지하기 위해 생성된 리포트를 삭제한다.
# 어떻게: 환경 변수에 지정된 경로(기본 report.md)를 안전하게 삭제한다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REPORT_PATH="${GENERATED_REPORT_PATH:-report.md}"

rm -f "$REPORT_PATH"
