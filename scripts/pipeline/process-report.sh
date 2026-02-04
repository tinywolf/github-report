#!/bin/bash
set -euo pipefail

# 왜: 생성된 리포트를 Agit 웹훅으로 전송하는 단계를 Jenkins와 로컬에서 동일하게 사용하기 위함.
# 어떻게: 입력 경로 검증 후 JSON 페이로드로 안전하게 감싸 curl로 전송한다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# .env에 정의된 환경 변수들을 모두 export하여 하위 스크립트에서 사용 가능하게 한다.
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  source ".env"
  set +a
fi

: "${AGIT_WEBHOOK:?AGIT_WEBHOOK 이 필요합니다. .env 또는 환경 변수로 설정하세요.}"

REPORT_PATH="${REPORT_PATH:-weekly-trend/$(date +%Y-%m-%d).md}"

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

export REPORT_PATH
# 페이로드가 클 경우를 대비해 변수가 아닌 임시 파일을 사용한다.
PAYLOAD_FILE=$(mktemp)
trap 'rm -f "$PAYLOAD_FILE"' EXIT

python3 - <<'PYCODE' > "$PAYLOAD_FILE"
import json
import os
from pathlib import Path

report_path = os.environ.get("REPORT_PATH")
content = Path(report_path).read_text(encoding="utf-8")
# @group 태그로 그룹 멘션 후 본문을 전달한다.
print(json.dumps({"text": "@group\n" + content}, ensure_ascii=False))
PYCODE

echo "[process] Sending report to Agit..."

curl -sS -X POST -H "Content-Type: application/json" \
     --data-binary "@$PAYLOAD_FILE" \
     "$AGIT_WEBHOOK"

echo "[process] Done."
