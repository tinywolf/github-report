#!/bin/bash
set -euo pipefail

# 왜: 생성된 리포트를 Agit 웹훅으로 전송하는 단계를 Jenkins와 로컬에서 동일하게 사용하기 위함.
# 어떻게: 입력 경로 검증 후 JSON 페이로드로 안전하게 감싸 curl로 전송한다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REPORT_PATH="${GENERATED_REPORT_PATH:-report.md}"

if [ -z "${AGIT_WEBHOOK:-}" ]; then
  echo "Error: AGIT_WEBHOOK environment variable is not set."
  exit 1
fi

if [ ! -s "$REPORT_PATH" ]; then
  echo "Error: $REPORT_PATH is missing or empty."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required for JSON processing but not found."
  exit 1
fi

PAYLOAD=$(python3 - <<'PYCODE'
import json
import os
from pathlib import Path

report_path = os.environ.get("GENERATED_REPORT_PATH", "report.md")
content = Path(report_path).read_text(encoding="utf-8")
# @group 태그로 그룹 멘션 후 본문을 전달한다.
print(json.dumps({"text": "@group\n" + content}, ensure_ascii=False))
PYCODE
)

echo "[process] Sending report to Agit..."
curl -sS -X POST -H "Content-Type: application/json" \
     -d "$PAYLOAD" \
     "$AGIT_WEBHOOK"

echo "[process] Done."
