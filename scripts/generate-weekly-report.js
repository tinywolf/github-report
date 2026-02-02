import { Codex } from "@openai/codex-sdk";
import { config as loadEnv } from "dotenv";
import { readFile, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
// .env 파일을 먼저 불러 Codex 실행에 필요한 키를 환경 변수로 주입한다.
loadEnv({ path: path.join(repoRoot, ".env") });
const outputDir = path.join(repoRoot, "weekly-trend");

const todayStamp = new Date().toISOString().slice(0, 10);
const outputPath = path.join(outputDir, `${todayStamp}.md`);

// 리포트 덮어쓰기를 제어: OVERWRITE_WEEKLY_TREND=1 필요.
async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

// 스트리밍 이벤트 처리를 위한 핸들러 함수들
const handleItemCompleted = (item) => {
  switch (item.type) {
    case "agent_message":
      console.log(`Assistant: ${item.text}`);
      break;
    case "reasoning":
      console.log(`Reasoning: ${item.text}`);
      break;
    case "command_execution": {
      const exitText = item.exit_code !== undefined ? ` 종료 코드: ${item.exit_code}.` : "";
      console.log(`명령어 실행: ${item.command} ${item.status}.${exitText}`);
      break;
    }
    case "file_change": {
      for (const change of item.changes) {
        console.log(`파일 변경: ${change.kind} ${change.path}`);
      }
      break;
    }
  }
};

const handleItemUpdated = (item) => {
  switch (item.type) {
    case "todo_list": {
      console.log(`할 일 목록:`);
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
        `토큰 사용량: 입력 ${event.usage.input_tokens}, 캐시된 입력 ${event.usage.cached_input_tokens}, 출력 ${event.usage.output_tokens}`,
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
  if ((await pathExists(outputPath)) && !process.env.OVERWRITE_WEEKLY_TREND) {
    throw new Error(
      `이미 ${outputPath} 파일이 존재합니다. 덮어쓰려면 OVERWRITE_WEEKLY_TREND=1 환경 변수를 설정하세요.`,
    );
  }

  // Codex를 저장소 루트 컨텍스트에서 실행해 git 레포 기반 작업이 가능하도록 한다.
  const codex = new Codex();
  // 네트워크 접근과 파일 쓰기가 필요한 스킬이므로 sandbox를 풀고 네트워크를 허용한다.
  const thread = codex.startThread({
    workingDirectory: repoRoot,
    sandboxMode: "danger-full-access",
    networkAccessEnabled: true,
  });

  console.log("🚀 weekly-trend-report-writer 스킬을 실행하여 리포트를 생성합니다...");

  // 프롬프트 파일을 직접 읽는 대신 등록된 스킬(/weekly-trend-report-writer)을 호출한다.
  // runStreamed를 통해 실시간으로 진행 상황을 출력한다.
  // https://github.com/openai/codex/tree/main/sdk/typescript
  const { events } = await thread.runStreamed("$weekly-trend-report-writer");
  for await (const event of events) {
    handleEvent(event);
  }

  console.log("✅ 리포트 생성이 완료되었습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
