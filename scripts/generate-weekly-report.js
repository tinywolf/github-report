import { Codex } from "@openai/codex-sdk";
import { spawn } from "child_process";
import { config as loadEnv } from "dotenv";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  formatCommandExecutionLog,
  normalizeCommandLogLevel,
} from "./command-execution-log.js";
import { readCodexSessionUsage } from "./codex-session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
// .env 파일을 먼저 불러 Codex 실행에 필요한 키를 환경 변수로 주입한다.
loadEnv({ path: path.join(repoRoot, ".env") });
const outputDir = path.join(repoRoot, "weekly-trend-draft");

const reportTimeZone = process.env.TZ || "UTC";
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
const sourcePath = path.join(outputDir, `${todayStamp}.source.html`);

// 스트리밍 로그 제목만 이벤트 타입별로 색상 처리해 본문과 구분한다.
const ansiReset = "\x1b[0m";
const shouldUseAnsiColor = shouldUseLogColor();
const logTitleColorsByType = {
  agent_message: "\x1b[36m",
  reasoning: "\x1b[35m",
  web_search: "\x1b[94m",
  mcp_tool_call: "\x1b[96m",
  command_execution: "\x1b[33m",
  file_change: "\x1b[32m",
  todo_list: "\x1b[34m",
  error: "\x1b[31m",
  lifecycle: "\x1b[90m",
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

async function removeFileIfExists(targetPath) {
  if (await pathExists(targetPath)) await unlink(targetPath);
}

// 모델의 자체 검증 결과를 신뢰하지 않고 호스트 프로세스가 종료 코드로 최종 판정한다.
async function validateGeneratedReport() {
  const validatorPath = path.join(__dirname, "validate-weekly-report.js");
  await new Promise((resolve, reject) => {
    const validator = spawn(
      process.execPath,
      [validatorPath, "--report", outputPath, "--source", sourcePath],
      { stdio: "inherit" },
    );
    validator.once("error", reject);
    validator.once("exit", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`리포트 검증기가 종료 코드 ${exitCode}로 실패했습니다.`));
    });
  });
}

function parseOverwriteWeeklyTrend(value) {
  const normalizedValue = value?.trim().toLowerCase();
  if (!normalizedValue || ["n", "no"].includes(normalizedValue)) return false;
  if (["y", "yes"].includes(normalizedValue)) return true;

  throw new Error(
    "OVERWRITE_WEEKLY_TREND는 Y/N, y/n 또는 yes/no 형식으로 설정해야 합니다.",
  );
}

// 모델과 추론 수준은 리포트에 기록하고 ccusage 사용량은 콘솔에 출력한다.
async function addReportGenerationInfo(targetPath, threadId, reasoningEffort) {
  const reportContent = await readFile(targetPath, "utf8");
  let usage;
  try {
    usage = await readCodexSessionUsage(threadId);
  } catch (error) {
    console.warn(`⚠️ ccusage에서 생성 정보를 확인하지 못했습니다: ${error.message}`);
  }
  const generationInfo = [
    "```",
    `생성 모델: ${usage?.models.join(", ") ?? "확인 불가"}`,
    `추론 수준: ${reasoningEffort || "모델 기본값"}`,
    "```",
  ].join("\n");

  await writeFile(targetPath, `${reportContent.trimEnd()}\n\n${generationInfo}\n`, "utf8");

  const formatTokenCount = (value) =>
    Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("en-US") : "확인 불가";
  const costUSD = Number.isFinite(usage?.costUSD)
    ? `$${usage.costUSD.toFixed(4)}`
    : "확인 불가";
  console.log(
    [
      "📊 Codex 세션 사용량:",
      `  입력 토큰: ${formatTokenCount(usage?.inputTokens)}`,
      `  캐시된 입력 토큰: ${formatTokenCount(usage?.cachedInputTokens)}`,
      `  출력 토큰: ${formatTokenCount(usage?.outputTokens)}`,
      `  추론 출력 토큰: ${formatTokenCount(usage?.reasoningOutputTokens)}`,
      `  전체 토큰: ${formatTokenCount(usage?.totalTokens)}`,
      `  비용 (USD): ${costUSD}`,
    ].join("\n"),
  );
}

// 스트리밍 이벤트 처리를 위한 핸들러 함수들
const logTodoList = (item) => {
  console.log(`${formatLogTitle(item.type, "할 일 목록")}:`);
  for (const todo of item.items) {
    console.log(`\t ${todo.completed ? "x" : " "} ${todo.text}`);
  }
};

// MCP 인자와 결과에는 비밀값이나 대용량 본문이 포함될 수 있어 식별자, 상태, 오류만 출력한다.
const logMcpToolCall = (item, lifecycle) => {
  const message = `${formatLogTitle(item.type, `MCP 도구 ${lifecycle}`)}: ${item.server}.${
    item.tool
  } (${item.status})`;

  if (item.error?.message) {
    console.warn(`${message} - ${item.error.message}`);
    return;
  }

  console.log(message);
};

const logUnknownItem = (item, lifecycle) => {
  const itemId = item.id ? ` (${item.id})` : "";
  console.warn(
    `${formatLogTitle("lifecycle", `알 수 없는 항목 ${lifecycle}`)}: ${item.type}${itemId}`,
  );
};

const handleItemCompleted = (item) => {
  switch (item.type) {
    case "agent_message":
      console.log(`${formatLogTitle(item.type, "Assistant")}: ${item.text}`);
      break;
    case "reasoning":
      console.log(`${formatLogTitle(item.type, "Reasoning")}: ${item.text}`);
      break;
    case "web_search":
      console.log(`${formatLogTitle(item.type, "웹 검색")}: ${item.query}`);
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
    case "mcp_tool_call":
      logMcpToolCall(item, "완료");
      break;
    case "todo_list":
      logTodoList(item);
      break;
    case "error":
      console.warn(`${formatLogTitle(item.type, "경고")}: ${item.message}`);
      break;
    default:
      logUnknownItem(item, "완료");
  }
};

const handleItemStarted = (item) => {
  switch (item.type) {
    case "command_execution":
      console.log(`${formatLogTitle(item.type, "명령어 실행 시작")}: ${item.command}`);
      break;
    case "mcp_tool_call":
      logMcpToolCall(item, "시작");
      break;
    case "web_search":
      console.log(`${formatLogTitle(item.type, "웹 검색 시작")}: ${item.query}`);
      break;
    case "todo_list":
      logTodoList(item);
      break;
    case "file_change":
      console.log(
        `${formatLogTitle(item.type, "파일 변경 시작")}: ${item.changes.length}개 변경`,
      );
      break;
    case "error":
      console.warn(`${formatLogTitle(item.type, "경고")}: ${item.message}`);
      break;
    case "agent_message":
    case "reasoning":
      console.log(`${formatLogTitle("lifecycle", "항목 시작")}: ${item.type} (${item.id})`);
      break;
    default:
      logUnknownItem(item, "시작");
  }
};

const handleItemUpdated = (item) => {
  switch (item.type) {
    case "todo_list":
      logTodoList(item);
      break;
    case "mcp_tool_call":
      logMcpToolCall(item, "업데이트");
      break;
    case "command_execution":
    case "file_change":
      console.log(
        `${formatLogTitle(item.type, "항목 업데이트")}: ${item.type} (${item.status})`,
      );
      break;
    case "web_search":
      console.log(`${formatLogTitle(item.type, "웹 검색 업데이트")}: ${item.query}`);
      break;
    case "error":
      console.warn(`${formatLogTitle(item.type, "경고")}: ${item.message}`);
      break;
    case "agent_message":
    case "reasoning":
      console.log(`${formatLogTitle("lifecycle", "항목 업데이트")}: ${item.type} (${item.id})`);
      break;
    default:
      logUnknownItem(item, "업데이트");
  }
};

const handleEvent = (event) => {
  switch (event.type) {
    case "thread.started":
      console.log(`${formatLogTitle("lifecycle", "스레드 시작")}: ${event.thread_id}`);
      break;
    case "turn.started":
      console.log(formatLogTitle("lifecycle", "턴 시작"));
      break;
    case "item.completed":
      handleItemCompleted(event.item);
      break;
    case "item.updated":
      handleItemUpdated(event.item);
      break;
    case "item.started":
      handleItemStarted(event.item);
      break;
    case "turn.completed":
      console.log(
        `${formatLogTitle("token_usage", "토큰 사용량")}: 입력 ${
          event.usage.input_tokens
        }, 캐시된 입력 ${event.usage.cached_input_tokens}, 캐시 쓰기 ${
          event.usage.cache_write_input_tokens
        }, 출력 ${event.usage.output_tokens}, 추론 출력 ${event.usage.reasoning_output_tokens}`,
      );
      break;
    case "turn.failed": {
      const errorMessage = event.error?.message || "Codex turn failed";
      console.error(`실행 실패: ${errorMessage}`);
      // 에러 발생 시 즉시 예외를 던져 루프를 중단시킨다.
      throw new Error(errorMessage);
    }
    case "error":
      console.error(`${formatLogTitle("error", "스트림 오류")}: ${event.message}`);
      throw new Error(event.message);
    default:
      console.warn(
        `${formatLogTitle("lifecycle", "알 수 없는 이벤트")}: ${event.type || "unknown"}`,
      );
  }
};

async function main() {
  // 신규 체크아웃이나 직접 실행에서도 과거 리포트 보관소와 분리된 출력 경로를 보장한다.
  await mkdir(outputDir, { recursive: true });

  const shouldOverwriteWeeklyTrend = parseOverwriteWeeklyTrend(
    process.env.OVERWRITE_WEEKLY_TREND,
  );
  const outputExists = await pathExists(outputPath);
  const sourceExists = await pathExists(sourcePath);
  if (outputExists || sourceExists) {
    if (!shouldOverwriteWeeklyTrend) {
      throw new Error(
        "오늘 날짜의 리포트 또는 수집 원본이 이미 존재합니다. 덮어쓰려면 OVERWRITE_WEEKLY_TREND=Y 환경 변수를 설정하세요.",
      );
    }

    await removeFileIfExists(outputPath);
    await removeFileIfExists(sourcePath);
    console.log(`♻️ 기존 리포트와 수집 원본 삭제: ${todayStamp}`);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const codexModel = process.env.CODEX_MODEL?.trim();
  const codexReasoningEffort = process.env.CODEX_REASONING_EFFORT?.trim();
  if (apiKey) {
    console.log(`📡 API Key 로드됨: ${apiKey.slice(0, 4)}***`);
  } else {
    // 왜: OpenAI 구독 기반 로그인(Codex CLI 인증 정보)이 있으면 API 키 없이도 SDK 실행이 가능하다.
    // 어떻게: SDK 기본 인증 탐색 경로(~/.codex/auth.json 등)를 사용하도록 new Codex()로 초기화한다.
    console.log("🔐 OPENAI_API_KEY가 없어 기본 Codex 인증 정보(~/.codex/auth.json)를 사용합니다.");
  }
  console.log(`🧠 Codex 모델: ${codexModel || "SDK 기본값"}`);
  console.log(`🧠 Codex 추론 수준: ${codexReasoningEffort || "모델 기본값"}`);

  // Codex를 저장소 루트 컨텍스트에서 실행해 git 레포 기반 작업이 가능하도록 한다.
  const codex = apiKey ? new Codex({ apiKey }) : new Codex();
  // CODEX_MODEL을 지정한 경우에만 모델을 전달하고, 없으면 Codex SDK의 선택을 따른다.
  const thread = codex.startThread({
    ...(codexModel ? { model: codexModel } : {}),
    ...(codexReasoningEffort ? { modelReasoningEffort: codexReasoningEffort } : {}),
    workingDirectory: repoRoot,
    // 비대화형 자동화에서는 승인 대기 대신 허용된 권한 안에서 실행하거나 실패한다.
    approvalPolicy: "never",
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
  if (!(await pathExists(sourcePath))) {
    throw new Error(`원본 수집이 완료되었지만 ${sourcePath} 파일을 찾을 수 없습니다.`);
  }

  await validateGeneratedReport();
  await addReportGenerationInfo(outputPath, thread.id, codexReasoningEffort);
  console.log(`📝 리포트 생성 정보 추가: ${outputPath}`);

  console.log("✅ 리포트 생성이 완료되었습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
