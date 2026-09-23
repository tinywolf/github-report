import assert from "node:assert/strict";
import test from "node:test";
import { extractCodexSessionUsage } from "../src/codex-session.js";

test("ccusage 결과에서 현재 스레드의 모델과 사용량만 추출한다", () => {
  const report = {
    sessions: [
      {
        sessionId: "2026/09/23/rollout-2026-09-23T10-00-00-target-thread",
        models: {
          "gpt-6-sol": { isFallback: false },
          "gpt-6-luna": { isFallback: true },
        },
        inputTokens: 100,
        cachedInputTokens: 200,
        outputTokens: 30,
        reasoningOutputTokens: 10,
        totalTokens: 330,
        costUSD: 0.0123,
      },
      {
        sessionId: "2026/09/23/rollout-2026-09-23T10-01-00-other-thread",
        models: { "gpt-5.6-terra": { isFallback: false } },
        inputTokens: 900,
        cachedInputTokens: 800,
        outputTokens: 70,
        reasoningOutputTokens: 20,
        totalTokens: 1770,
        costUSD: 0.4567,
      },
    ],
  };

  assert.deepEqual(extractCodexSessionUsage(report, "target-thread"), {
    models: ["gpt-6-sol", "gpt-6-luna (추정)"],
    inputTokens: 100,
    cachedInputTokens: 200,
    outputTokens: 30,
    reasoningOutputTokens: 10,
    totalTokens: 330,
    costUSD: 0.0123,
  });
});

test("ccusage 결과에 현재 스레드가 없으면 실패한다", () => {
  assert.throws(
    () => extractCodexSessionUsage({ sessions: [] }, "missing-thread"),
    /세션을 하나로 특정할 수 없습니다/,
  );
});
