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

    stage('Scrape report') {
      steps {
        sh '''#!/bin/bash
          set -euo pipefail

          find weekly-trend -name "*.md" -exec echo {} \;
        '''
      }
    }
  }
}
