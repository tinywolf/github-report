import groovy.json.JsonOutput

pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  environment {
    // Jenkins credentials ID로 등록된 OpenAI API 키를 환경 변수로 주입한다.
    OPENAI_API_KEY = credentials('openai-api-key')
    OVERWRITE_WEEKLY_TREND = '1'

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

}
