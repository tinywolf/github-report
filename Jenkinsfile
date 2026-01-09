import groovy.json.JsonOutput

pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  triggers {
    githubPush()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Generate Weekly Report') {
      steps {
        script {
          sh '''#!/bin/bash
            set -euo pipefail
            npm ci
          '''

          env.GENERATED_REPORT_PATH = sh(
            script: '''#!/bin/bash
              set -euo pipefail
              node scripts/generate-weekly-report.js
            ''',
            returnStdout: true
          ).trim()

          echo "Generated report path: ${env.GENERATED_REPORT_PATH}"
        }
      }
    }

    stage('Check Changes') {
      steps {
        sh '''#!/bin/bash
          set -euo pipefail

          # 이전 성공 커밋이 없으면 안전하게 HEAD~1을 기준으로 설정
          BASE_COMMIT=${GIT_PREVIOUS_SUCCESSFUL_COMMIT:-HEAD~1}
          CURRENT_COMMIT=${GIT_COMMIT:-HEAD}

          echo "Checking for new files between $BASE_COMMIT and $CURRENT_COMMIT"

          # 새로 추가된(A) md 파일과 Codex가 생성한 최신 리포트를 함께 수집
          : > new_files.txt
          git diff --name-only --diff-filter=A "$BASE_COMMIT" "$CURRENT_COMMIT" | grep '^weekly-trend/.*\\.md$' >> new_files.txt || true

          if [ -n "${GENERATED_REPORT_PATH:-}" ] && [ -f "$GENERATED_REPORT_PATH" ]; then
             if ! grep -Fxq "$GENERATED_REPORT_PATH" new_files.txt; then
               echo "$GENERATED_REPORT_PATH" >> new_files.txt
             fi
          fi

          sort -u new_files.txt -o new_files.txt

          if [ -s new_files.txt ]; then
             echo "Found new files:"
             cat new_files.txt
          else
             echo "No new weekly-trend files found."
          fi
        '''
      }
    }

    stage('Process Reports') {
      steps {
        sh '''#!/bin/bash
          set -euo pipefail


            if [ -z "${AGIT_WEBHOOK:-}" ]; then
              echo "Error: AGIT_WEBHOOK environment variable is not set."
              exit 1
            fi

            if [ -s new_files.txt ]; then
              echo "Processing detected files..."
              
              while IFS= read -r file; do
                if [ -f "$file" ]; then
                  echo "Processing file: $file"
                  
                  # Use python3 to safely construct JSON payload with file content
                  # This handles newlines and special characters correctly
                  if command -v python3 &> /dev/null; then
                      PAYLOAD=$(python3 -c "import json, sys; content = sys.stdin.read(); print(json.dumps({'text': '@group\\n' + content}))" < "$file")
                  else
                      echo "Error: python3 is required for JSON processing but not found."
                      exit 1
                  fi

                  echo "Sending report to Agit..."
                  curl -X POST -H "Content-Type: application/json" \
                       -d "$PAYLOAD" \
                       "$AGIT_WEBHOOK" || echo "Failed to send report"
                     
                echo ""
                echo "Done."
              fi
            done < new_files.txt
          else
            echo "Skipping processing: No new files."
          fi
        '''
      }
    }
  }

  post {
    always {
        sh 'rm -f new_files.txt'
    }
  }
}
