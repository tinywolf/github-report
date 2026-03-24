#!/bin/bash
set -euo pipefail

# 왜: 로컬에서도 Jenkins 파이프라인과 동일한 흐름(생성→전송→정리)을 한 번에 실행하기 위함.
# 어떻게: .env를 로드한 뒤 분리된 파이프라인 스크립트를 순차 실행한다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🐳 Docker 샌드박스에서 리포트를 생성합니다..."

# .env 파일이 있으면 로드합니다.
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

# 인증 방식 분기:
# 1) OPENAI_API_KEY가 있으면 키 기반 인증
# 2) 키가 없으면 호스트 ~/.codex/auth.json 파일만 컨테이너 /root/.codex/auth.json으로 마운트하여 구독/로그인 기반 인증
declare -a docker_auth_args=()
if [ -n "${OPENAI_API_KEY:-}" ]; then
  echo "🔐 OPENAI_API_KEY 기반 인증으로 실행합니다."
  docker_auth_args+=(-e "OPENAI_API_KEY=$OPENAI_API_KEY")
else
  local_codex_auth_file="${HOME}/.codex/auth.json"
  if [ ! -f "$local_codex_auth_file" ]; then
    echo "❌ OPENAI_API_KEY가 없고 ${local_codex_auth_file} 파일도 없습니다."
    echo "   .env에 OPENAI_API_KEY를 설정하거나, Codex 로그인으로 ~/.codex/auth.json을 준비해 주세요."
    exit 1
  fi

  echo "🔐 OPENAI_API_KEY 없이 ~/.codex/auth.json 파일만 마운트해 실행합니다."
  docker_auth_args+=(-v "$local_codex_auth_file:/root/.codex/auth.json:ro")
fi

# 빌드 시 캐시를 활용하여 이미지를 준비합니다.
docker build -t github-report-generator .

docker run -it --rm \
  "${docker_auth_args[@]}" \
  -e TZ="${TZ:-Asia/Seoul}" \
  -e OVERWRITE_WEEKLY_TREND="${OVERWRITE_WEEKLY_TREND:-1}" \
  -v "$ROOT_DIR/weekly-trend:/app/weekly-trend" \
  github-report-generator

# 왜: 생성된 리포트 내용을 사용자가 직접 검토한 뒤 배포(전송) 여부를 결정하기 위함.
# 어떻게: read 명령어로 사용자 입력을 받아 'y'인 경우에만 다음 스크립트를 실행한다.
echo ""
echo "------------------------------------------------------------"
echo "리포트 생성이 완료되었습니다. 'weekly-trend/' 디렉토리에서 결과를 확인하세요."
echo "계속해서 다음 단계(아지트에 발행)를 진행하시겠습니까? (y/N)"
echo "------------------------------------------------------------"
read -r response < /dev/tty

if [[ "$response" != "y" ]]; then
  echo "작업이 사용자에 의해 중단되었습니다."
  exit 0
fi

scripts/publish-report.sh
