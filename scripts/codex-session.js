import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ccusage의 세션 집계에서 현재 Codex 스레드의 모델과 사용량을 찾는다.
export function extractCodexSessionUsage(report, threadId) {
  if (!threadId) throw new Error("Codex 스레드 ID가 없습니다.");
  const sessions = report.sessions?.filter((session) =>
    session.sessionId?.endsWith(`-${threadId}`),
  );
  if (sessions?.length !== 1) {
    throw new Error(`ccusage 결과에서 Codex 세션을 하나로 특정할 수 없습니다: ${threadId}`);
  }

  const session = sessions[0];
  const models = Object.entries(session.models ?? {}).map(([model, usage]) =>
    usage?.isFallback ? `${model} (추정)` : model,
  );
  if (models.length === 0) throw new Error(`ccusage 결과에 모델 정보가 없습니다: ${threadId}`);
  return {
    models,
    inputTokens: session.inputTokens,
    cachedInputTokens: session.cachedInputTokens,
    outputTokens: session.outputTokens,
    reasoningOutputTokens: session.reasoningOutputTokens,
    totalTokens: session.totalTokens,
    costUSD: session.costUSD,
  };
}

// 생성 완료 후 ccusage를 한 번 실행해 해당 스레드의 모델과 사용량을 읽는다.
export async function readCodexSessionUsage(threadId) {
  const { stdout } = await execFileAsync(
    "npx",
    ["-y", "ccusage@latest", "codex", "session", "--json"],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return extractCodexSessionUsage(JSON.parse(stdout), threadId);
}
