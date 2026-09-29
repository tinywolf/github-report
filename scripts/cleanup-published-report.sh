#!/bin/bash
set -euo pipefail

# 초안의 보관 가능 여부를 확인하고, 발행 후 리포트를 연도별로 보관하며 검증용 원본을 삭제한다.
# run.sh가 전달한 초안 경로만 처리해 다른 파일을 정리하지 않도록 한다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
draft_dir="$ROOT_DIR/weekly-trend-draft"
check_only=false
if [[ "${1:-}" == "--check" ]]; then
  check_only=true
  shift
fi
if [[ "$#" -ne 1 ]]; then
  echo "사용법: $0 [--check] <리포트 절대 경로>" >&2
  exit 1
fi
report_path="$1"
report_name="${report_path##*/}"

if [[ ! "$report_name" =~ ^([0-9]{4})-[0-9]{2}-[0-9]{2}\.md$ ]] || \
   [[ "$report_path" != "$draft_dir/$report_name" ]]; then
  echo "Error: weekly-trend-draft의 날짜별 리포트만 정리할 수 있습니다: $report_path" >&2
  exit 1
fi

source_path="$draft_dir/${report_name%.md}.source.html"
archive_dir="$ROOT_DIR/weekly-trend/${report_name:0:4}"
archive_path="$archive_dir/$report_name"

if [[ ! -f "$report_path" || -L "$report_path" || ! -f "$source_path" || -L "$source_path" ]]; then
  echo "Error: 리포트 또는 검증용 원본이 없거나 일반 파일이 아닙니다." >&2
  exit 1
fi

if [[ -e "$archive_path" || -L "$archive_path" ]]; then
  echo "Error: 보관할 리포트가 이미 존재합니다: $archive_path" >&2
  exit 1
fi

if "$check_only"; then
  echo "[cleanup] 정리 가능: $archive_path"
  exit 0
fi

mkdir -p "$archive_dir"
mv "$report_path" "$archive_path"
rm "$source_path"
echo "[cleanup] 리포트 보관: $archive_path"
echo "[cleanup] 검증용 원본 삭제: $source_path"
