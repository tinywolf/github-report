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
            echo "==================================================="
            
            while IFS= read -r file; do
              if [ -f "$file" ]; then
                echo "Processing file: $file"
                echo "---------------------------------------------------"
                cat "$file"
                echo ""
                echo "---------------------------------------------------"
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
