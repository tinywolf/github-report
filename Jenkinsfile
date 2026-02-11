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
        // Docker 샌드박스에서 리포트를 생성합니다.
        sh '''
          docker build -t github-report-generator .
          docker run --rm \
            -e OPENAI_API_KEY=${OPENAI_API_KEY} \
            -e OVERWRITE_WEEKLY_TREND=${OVERWRITE_WEEKLY_TREND} \
            -v ${WORKSPACE}/weekly-trend:/app/weekly-trend \
            github-report-generator
        '''
      }
    }

    stage('Process Reports') {
      steps {
        sh 'scripts/pipeline/process-report.sh'
      }
    }
  }

}
