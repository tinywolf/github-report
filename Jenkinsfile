import groovy.json.JsonOutput

pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  environment {
    // Jenkins credentials ID로 등록된 Codex API 키를 환경 변수로 주입한다.
    CODEX_API_KEY = credentials('codex-api-key')
    OVERWRITE_WEEKLY_TREND = '1'
    GENERATED_REPORT_PATH = 'report.md'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Generate Weekly Trend Report') {
      steps {
        sh 'scripts/pipeline/generate-weekly-report.sh'
      }
    }

    stage('Process Reports') {
      steps {
        sh 'scripts/pipeline/process-report.sh'
      }
    }
  }

  post {
    always {
        sh 'scripts/pipeline/cleanup-report.sh'
    }
  }
}
