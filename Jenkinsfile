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

    stage('Check Changes') {
      steps {
        sh '''#!/bin/bash
          set -euo pipefail

          # 이전 성공 커밋이 없으면 안전하게 HEAD~1을 기준으로 설정
          BASE_COMMIT=${GIT_PREVIOUS_SUCCESSFUL_COMMIT:-HEAD~1}
          CURRENT_COMMIT=${GIT_COMMIT:-HEAD}

          echo "Checking for new files between $BASE_COMMIT and $CURRENT_COMMIT"

          # 새로 추가된(A) md 파일만 필터링하여 파일 목록 저장
          git diff --name-only --diff-filter=A "$BASE_COMMIT" "$CURRENT_COMMIT" | grep '^weekly-trend/.*\\.md$' > new_files.txt || true
          
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

          if [ -s new_files.txt ]; then
            echo "Processing detected files..."
            
            while IFS= read -r file; do
              if [ -f "$file" ]; then
                echo "Processing file: $file"
                
                # Use python3 to safely construct JSON payload with file content
                # This handles newlines and special characters correctly
                if command -v python3 &> /dev/null; then
                    PAYLOAD=$(python3 -c "import json, sys; print(json.dumps({'text': sys.stdin.read()}))" < "$file")
                else
                    echo "Error: python3 is required for JSON processing but not found."
                    exit 1
                fi

                echo "Sending report to Agit..."
                curl -X POST -H "Content-Type: application/json" \
                     -d "$PAYLOAD" \
                     https://agit.in/webhook/30350d02-a712-4054-94b1-db2804c0f05c || echo "Failed to send report"
                     
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
