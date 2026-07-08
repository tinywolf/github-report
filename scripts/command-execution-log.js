const ansiReset = "\x1b[0m";
const ansiDim = "\x1b[2m";

const defaultCommandOutputLimitsByResult = {
  success: {
    maxLines: 40,
    maxBytes: 12 * 1024,
    tailLines: 10,
  },
  failure: {
    maxLines: 160,
    maxBytes: 32 * 1024,
    tailLines: 40,
  },
};

// command_execution 이벤트를 터미널에서 읽기 좋은 rail 로그로 렌더링한다.
// 성공 출력은 제한과 dim 처리를 적용하고, 실패 출력은 더 넓게 보존해 원인 파악을 돕는다.
export function formatCommandExecutionLog(item, options = {}) {
  const {
    commandLogLevel = "default",
    shouldUseAnsiColor = false,
    formatLogTitle = (_type, title) => title,
    outputLimitsByResult = defaultCommandOutputLimitsByResult,
  } = options;
  const exitText = item.exit_code !== undefined ? ` 종료 코드: ${item.exit_code}.` : "";
  const isFailure = hasCommandExecutionFailed(item);
  const title = isFailure ? formatLogTitle(item.type, "명령어 실행") : "명령어 실행";
  const lines = [];

  appendPrefixedLines(lines, item.command, `${title}: `, "  ");
  lines.push(`결과: ${item.status}.${exitText}`);

  const output = item.aggregated_output?.trimEnd();
  if (output && commandLogLevel !== "summary") {
    const outputLimit = getCommandOutputLimit(commandLogLevel, isFailure, outputLimitsByResult);
    const outputSummary = outputLimit ? limitCommandOutput(output, outputLimit) : summarizeFullOutput(output);

    lines.push(formatCommandOutputHeader(outputSummary));
    appendPrefixedLines(lines, outputSummary.text, "", "");
  }

  const commandBlock = lines.map((line) => `  │ ${line}`).join("\n");
  return isFailure ? commandBlock : formatDimmedLog(commandBlock, shouldUseAnsiColor);
}

export function normalizeCommandLogLevel(value) {
  const normalizedValue = value?.trim().toLowerCase();
  if (normalizedValue === "full" || normalizedValue === "summary") return normalizedValue;

  return "default";
}

function formatDimmedLog(text, shouldUseAnsiColor) {
  if (!shouldUseAnsiColor) return text;

  return `${ansiDim}${text}${ansiReset}`;
}

function hasCommandExecutionFailed(item) {
  return item.status === "failed" || (item.exit_code !== undefined && item.exit_code !== 0);
}

function appendPrefixedLines(lines, text, firstPrefix, restPrefix = "") {
  const [firstLine = "", ...restLines] = text.split(/\r?\n/);
  lines.push(`${firstPrefix}${firstLine}`);

  for (const line of restLines) {
    lines.push(`${restPrefix}${line}`);
  }
}

function getCommandOutputLimit(commandLogLevel, isFailure, outputLimitsByResult) {
  if (commandLogLevel === "full") return null;

  return isFailure ? outputLimitsByResult.failure : outputLimitsByResult.success;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;

  return `${(bytes / 1024).toFixed(1)}KB`;
}

function sliceTextByBytes(text, maxBytes, fromEnd = false) {
  let usedBytes = 0;
  let result = "";
  const characters = Array.from(text);

  if (fromEnd) {
    for (let index = characters.length - 1; index >= 0; index -= 1) {
      const character = characters[index];
      const characterBytes = Buffer.byteLength(character, "utf8");
      if (usedBytes + characterBytes > maxBytes) break;

      result = `${character}${result}`;
      usedBytes += characterBytes;
    }
    return result;
  }

  for (const character of characters) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (usedBytes + characterBytes > maxBytes) break;

    result += character;
    usedBytes += characterBytes;
  }

  return result;
}

function truncateTextMiddleByBytes(text, maxBytes, marker) {
  const markerBlock = `\n${marker}\n`;
  const markerBytes = Buffer.byteLength(markerBlock, "utf8");
  if (markerBytes >= maxBytes) return sliceTextByBytes(marker, maxBytes);

  const availableBytes = maxBytes - markerBytes;
  const headBytes = Math.ceil(availableBytes * 0.75);
  const tailBytes = availableBytes - headBytes;

  return `${sliceTextByBytes(text, headBytes)}${markerBlock}${sliceTextByBytes(
    text,
    tailBytes,
    true,
  )}`;
}

function limitCommandOutput(output, limit) {
  const totalBytes = Buffer.byteLength(output, "utf8");
  const originalLines = output.split(/\r?\n/);
  let displayedLines = originalLines;
  let isTruncated = false;

  if (originalLines.length > limit.maxLines) {
    const markerLineCount = 1;
    const tailLineCount = Math.min(limit.tailLines, limit.maxLines - markerLineCount);
    const headLineCount = limit.maxLines - tailLineCount - markerLineCount;
    const omittedLineCount = originalLines.length - headLineCount - tailLineCount;

    displayedLines = [
      ...originalLines.slice(0, headLineCount),
      `[중간 ${omittedLineCount}줄 생략됨]`,
      ...originalLines.slice(-tailLineCount),
    ];
    isTruncated = true;
  }

  let displayedText = displayedLines.join("\n");
  if (Buffer.byteLength(displayedText, "utf8") > limit.maxBytes) {
    const marker = `[출력 일부가 ${formatBytes(limit.maxBytes)} 제한으로 생략됨]`;
    displayedText = truncateTextMiddleByBytes(displayedText, limit.maxBytes, marker);
    isTruncated = true;
  }

  return {
    text: displayedText,
    isTruncated,
    totalBytes,
    totalLines: originalLines.length,
    displayedBytes: Buffer.byteLength(displayedText, "utf8"),
    displayedLines: displayedText.split(/\r?\n/).length,
  };
}

function summarizeFullOutput(output) {
  return {
    text: output,
    isTruncated: false,
    totalBytes: Buffer.byteLength(output, "utf8"),
    totalLines: output.split(/\r?\n/).length,
    displayedBytes: Buffer.byteLength(output, "utf8"),
    displayedLines: output.split(/\r?\n/).length,
  };
}

function formatCommandOutputHeader(outputSummary) {
  if (!outputSummary.isTruncated) return "출력:";

  return `출력: ${outputSummary.totalLines}줄, ${formatBytes(
    outputSummary.totalBytes,
  )} 중 ${outputSummary.displayedLines}줄, ${formatBytes(outputSummary.displayedBytes)} 표시`;
}
