# Node.js 22 LTS 버전을 베이스 이미지로 사용합니다.
FROM node:22-slim

# git은 저장소 컨텍스트를 파악하는 데 필요하므로 설치합니다.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates ripgrep jq curl unzip zip procps less fd-find \
 && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리를 설정합니다.
WORKDIR /app

# 종속성 파일을 먼저 복사하여 캐싱을 활용합니다.
COPY package*.json ./

# 왜: 종속성 설치 시 clean install을 권장합니다.
RUN npm ci

# 전체 소스 코드를 복사합니다.
COPY . .

# 리포트 출력 디렉토리와 인증 파일 마운트 경로를 보장합니다.
RUN mkdir -p weekly-trend /root/.codex

# 기본 환경 변수 설정 (런타임에 -e 옵션으로 덮어쓰기 권장)
ENV OPENAI_API_KEY=""
ENV OVERWRITE_WEEKLY_TREND=0

# 주간 리포트 생성 스크립트를 기본 명령으로 설정합니다.
CMD ["npm", "run", "generate:weekly-report"]
