import { Codex } from "@openai/codex-sdk";
import { config as loadEnv } from "dotenv";
import { readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  formatCommandExecutionLog,
  normalizeCommandLogLevel,
} from "./command-execution-log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
// .env 파일을 먼저 불러 Codex 실행에 필요한 키를 환경 변수로 주입한다.
loadEnv({ path: path.join(repoRoot, ".env") });
const outputDir = path.join(repoRoot, "weekly-trend");

const reportTimeZone = process.env.TZ || "UTC";
const defaultCodexModel = "gpt-5.5";
const commandLogLevel = normalizeCommandLogLevel(process.env.COMMAND_LOG_LEVEL);

function formatDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const datePartMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${datePartMap.year}-${datePartMap.month}-${datePartMap.day}`;
}

// 왜: toISOString()은 항상 UTC 기준이라 KST 자정 직후 실행 시 전날 파일명이 생성된다.
// 어떻게: 실행 환경에서 주어진 TZ를 명시적으로 사용해 리포트 날짜 스탬프를 만든다.
const todayStamp = formatDateInTimeZone(new Date(), reportTimeZone);
const outputPath = path.join(outputDir, `${todayStamp}.md`);

// 스트리밍 로그 제목만 이벤트 타입별로 색상 처리해 본문과 구분한다.
const ansiReset = "\x1b[0m";
const shouldUseAnsiColor = shouldUseLogColor();
const logTitleColorsByType = {
  agent_message: "\x1b[36m",
  reasoning: "\x1b[35m",
  command_execution: "\x1b[33m",
  file_change: "\x1b[32m",
  todo_list: "\x1b[34m",
  token_usage: "\x1b[90m",
};

function shouldUseLogColor() {
  if (process.env.NO_COLOR || process.env.FORCE_COLOR === "0") return false;
  if (process.env.FORCE_COLOR) return true;
  if (typeof process.stdout.hasColors === "function") return process.stdout.hasColors();

  return Boolean(process.stdout.isTTY && process.env.TERM !== "dumb");
}

function formatLogTitle(type, title) {
  if (!shouldUseAnsiColor) return title;

  const titleColor = logTitleColorsByType[type];
  if (!titleColor) return title;

  return `${titleColor}${title}${ansiReset}`;
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function parseOverwriteWeeklyTrend(value) {
  const normalizedValue = value?.trim().toLowerCase();
  if (!normalizedValue || ["n", "no"].includes(normalizedValue)) return false;
  if (["y", "yes"].includes(normalizedValue)) return true;

  throw new Error(
    "OVERWRITE_WEEKLY_TREND는 Y/N, y/n 또는 yes/no 형식으로 설정해야 합니다.",
  );
}

// 모델이 작성한 본문과 실행 환경에서 확정된 생성 정보를 분리해 메타데이터의 정확성을 보장한다.
async function addReportGenerationInfo(targetPath, model, reasoningEffort) {
  const reportContent = await readFile(targetPath, "utf8");
  const generationInfo = [
    "```",
    `생성 모델: ${model}`,
    `추론 수준: ${reasoningEffort || "모델 기본값"}`,
    "```",
  ].join("\n");

  await writeFile(targetPath, `${reportContent.trimEnd()}\n\n${generationInfo}\n`, "utf8");
}

// 스트리밍 이벤트 처리를 위한 핸들러 함수들
const handleItemCompleted = (item) => {
  switch (item.type) {
    case "agent_message":
      console.log(`${formatLogTitle(item.type, "Assistant")}: ${item.text}`);
      break;
    case "reasoning":
      console.log(`${formatLogTitle(item.type, "Reasoning")}: ${item.text}`);
      break;
    case "command_execution": {
      console.log(
        formatCommandExecutionLog(item, {
          commandLogLevel,
          shouldUseAnsiColor,
          formatLogTitle,
        }),
      );
      break;
    }
    case "file_change": {
      for (const change of item.changes) {
        console.log(`${formatLogTitle(item.type, "파일 변경")}: ${change.kind} ${change.path}`);
      }
      break;
    }
  }
};

const handleItemUpdated = (item) => {
  switch (item.type) {
    case "todo_list": {
      console.log(`${formatLogTitle(item.type, "할 일 목록")}:`);
      for (const todo of item.items) {
        console.log(`\t ${todo.completed ? "x" : " "} ${todo.text}`);
      }
      break;
    }
  }
};

const handleEvent = (event) => {
  switch (event.type) {
    case "item.completed":
      handleItemCompleted(event.item);
      break;
    case "item.updated":
    case "item.started":
      handleItemUpdated(event.item);
      break;
    case "turn.completed":
      console.log(
        `${formatLogTitle("token_usage", "토큰 사용량")}: 입력 ${event.usage.input_tokens}, 캐시된 입력 ${event.usage.cached_input_tokens}, 출력 ${
          event.usage.output_tokens
        }`,
      );
      break;
    case "turn.failed": {
      const errorMessage = event.error?.message || "Codex turn failed";
      console.error(`실행 실패: ${errorMessage}`);
      // 에러 발생 시 즉시 예외를 던져 루프를 중단시킨다.
      throw new Error(errorMessage);
    }
  }
};

async function main() {
  const shouldOverwriteWeeklyTrend = parseOverwriteWeeklyTrend(
    process.env.OVERWRITE_WEEKLY_TREND,
  );
  if (await pathExists(outputPath)) {
    if (!shouldOverwriteWeeklyTrend) {
      throw new Error(
        `이미 ${outputPath} 파일이 존재합니다. 덮어쓰려면 OVERWRITE_WEEKLY_TREND=Y 환경 변수를 설정하세요.`,
      );
    }

    await unlink(outputPath);
    console.log(`♻️ 기존 리포트 삭제: ${outputPath}`);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const codexModel = process.env.CODEX_MODEL?.trim() || defaultCodexModel;
  const codexReasoningEffort = process.env.CODEX_REASONING_EFFORT?.trim();
  if (apiKey) {
    console.log(`📡 API Key 로드됨: ${apiKey.slice(0, 4)}***`);
  } else {
    // 왜: OpenAI 구독 기반 로그인(Codex CLI 인증 정보)이 있으면 API 키 없이도 SDK 실행이 가능하다.
    // 어떻게: SDK 기본 인증 탐색 경로(~/.codex/auth.json 등)를 사용하도록 new Codex()로 초기화한다.
    console.log("🔐 OPENAI_API_KEY가 없어 기본 Codex 인증 정보(~/.codex/auth.json)를 사용합니다.");
  }
  console.log(`🧠 Codex 모델: ${codexModel}`);
  console.log(`🧠 Codex 추론 수준: ${codexReasoningEffort || "모델 기본값"}`);

  // Codex를 저장소 루트 컨텍스트에서 실행해 git 레포 기반 작업이 가능하도록 한다.
  const codex = apiKey ? new Codex({ apiKey }) : new Codex();
  // 왜: SDK/CLI 기본 모델이 계정에서 지원되지 않는 모델로 바뀌면 자동화가 실패한다.
  // 어떻게: 지원 모델을 명시하고, 필요 시 CODEX_MODEL 환경 변수로 런타임에 교체한다.
  const thread = codex.startThread({
    model: codexModel,
    ...(codexReasoningEffort ? { modelReasoningEffort: codexReasoningEffort } : {}),
    workingDirectory: repoRoot,
    // 네트워크 접근과 파일 쓰기가 필요한 스킬이므로 sandbox를 풀고 네트워크를 허용한다.
    sandboxMode: "danger-full-access",
    networkAccessEnabled: true,
    skipGitRepoCheck: true,
  });

  console.log("🚀 weekly-trend-report-writer 스킬을 실행하여 리포트를 생성합니다...");

  // 프롬프트 파일을 직접 읽는 대신 등록된 스킬(/weekly-trend-report-writer)을 호출한다.
  // runStreamed를 통해 실시간으로 진행 상황을 출력한다.
  // https://github.com/openai/codex/tree/main/sdk/typescript
  const { events } = await thread.runStreamed("$weekly-trend-report-writer");
  for await (const event of events) {
    handleEvent(event);
  }

  if (!(await pathExists(outputPath))) {
    throw new Error(`리포트 생성이 완료되었지만 ${outputPath} 파일을 찾을 수 없습니다.`);
  }
  await addReportGenerationInfo(outputPath, codexModel, codexReasoningEffort);
  console.log(`📝 리포트 생성 정보 추가: ${outputPath}`);

  console.log("✅ 리포트 생성이 완료되었습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
