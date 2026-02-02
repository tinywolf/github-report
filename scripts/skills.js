import { Codex } from "@openai/codex-sdk";
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// .env 파일을 불러와 API 키 등을 설정한다.
loadEnv({ path: path.join(repoRoot, ".env") });

async function main() {
    const codex = new Codex();
    const thread = codex.startThread({
        workingDirectory: repoRoot,
    });

    console.log("-----------------------------------------");
    console.log("🔍 현재 프로젝트에서 사용 가능한 Skill 목록을 조회 중입니다...");
    console.log("-----------------------------------------");

    // Codex의 /skills 슬래시 커맨드를 호출하여 가용한 스킬 목록을 가져온다.
    // 이 방식은 Codex SDK를 통해 에이전트에게 직접 목록을 요청하는 가장 표준적인 방법이다.
    const turn = await thread.run("/skills");

    console.log("\n[결과]");
    console.log(turn.finalResponse);
    console.log("\n-----------------------------------------");
    console.log("✅ 조회가 완료되었습니다.");
}

main().catch((error) => {
    console.error("오류 발생:", error);
    process.exit(1);
});
