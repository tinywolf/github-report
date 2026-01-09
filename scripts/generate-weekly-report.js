import { Codex } from "@openai/codex-sdk";
import { config as loadEnv } from "dotenv";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
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
const args = process.argv.slice(2);

function resolveOutputPath() {
  const idx = args.findIndex((arg) => arg === "--output" || arg.startsWith("--output="));
  if (idx === -1) return null;

  // --output path 또는 --output=path 형태를 모두 허용한다.
  const arg = args[idx];
  if (arg === "--output") {
    const next = args[idx + 1];
    if (!next) {
      throw new Error("--output 옵션에 저장할 경로를 지정하세요.");
    }
    return path.resolve(repoRoot, next);
  }

  const [, value] = arg.split("=", 2);
  if (!value) {
    throw new Error("--output 옵션에 저장할 경로를 지정하세요.");
  }
  return path.resolve(repoRoot, value);
}

const customOutputPath = resolveOutputPath();
const targetOutputPath = customOutputPath || outputPath;

// 리포트 덮어쓰기를 제어: 기본/커스텀 경로 모두 OVERWRITE_WEEKLY_TREND=1 필요.
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

  if ((await pathExists(targetOutputPath)) && !process.env.OVERWRITE_WEEKLY_TREND) {
    throw new Error(
      `이미 ${targetOutputPath} 파일이 존재합니다. 덮어쓰려면 OVERWRITE_WEEKLY_TREND=1 환경 변수를 설정하세요.`,
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

  // Codex의 모든 이벤트 로그를 stdout으로 흘리면서 최종 응답을 수집한다.
  const { events } = await thread.runStreamed(prompt);
  let content = "";
  for await (const event of events) {
    // process.stdout.write(`${JSON.stringify(event)}\n`);
    if (event.type === "item.completed" && event.item.type === "agent_message") {
      content = event.item.text;
    }
    if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "Codex turn failed");
    }
  }
  content = (content || "").trim();
  if (!content) {
    throw new Error("Codex 응답이 비어 있어 리포트를 생성할 수 없습니다.");
  }

  await mkdir(path.dirname(targetOutputPath), { recursive: true });
  await writeFile(targetOutputPath, content, "utf8");

  // Jenkins에서 경로를 바로 읽어갈 수 있도록 STDOUT에 결과 파일 경로만 남긴다.
  process.stdout.write(targetOutputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
