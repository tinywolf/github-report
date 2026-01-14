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
const promptPath = path.join(repoRoot, "weekly-trend-report-prompt.md");
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

async function main() {
  const basePrompt = await readFile(promptPath, "utf8");
  if (!basePrompt.trim()) {
    throw new Error("weekly-trend-report-prompt.md 내용이 비어 있습니다.");
  }
  const prompt = basePrompt.trim();
  // Codex에게 전달할 프롬프트를 읽어 텍스트 그대로 전달한다.

  if ((await pathExists(outputPath)) && !process.env.OVERWRITE_WEEKLY_TREND) {
    throw new Error(
      `이미 ${outputPath} 파일이 존재합니다. 덮어쓰려면 OVERWRITE_WEEKLY_TREND=1 환경 변수를 설정하세요.`,
    );
  }

  // Codex를 저장소 루트 컨텍스트에서 실행해 git 레포 기반 작업이 가능하도록 한다.
  const codex = new Codex();
  // 네트워크 접근이 필요한 프롬프트이므로 sandbox를 풀어주고 네트워크 허용을 명시한다.
  const thread = codex.startThread({
    workingDirectory: repoRoot,
    sandboxMode: "danger-full-access",
    networkAccessEnabled: true,
  });

  // Codex의 모든 이벤트 로그를 stdout으로 흘리면서 최종 응답을 기다린다.
  const { events } = await thread.runStreamed(prompt);
  for await (const event of events) {
    if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "Codex turn failed");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
