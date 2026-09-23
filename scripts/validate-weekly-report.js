import * as cheerio from "cheerio";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// 모델이 수집한 원본·작성 리포트·검증 시점의 최신 페이지를 독립적으로 비교하는 발행 게이트다.
const githubOrigin = "https://github.com";
const weeklyTrendingUrl = `${githubOrigin}/trending?since=weekly`;
const missingLanguageLabels = new Set(["", "-", "N/A", "없음", "알 수 없음"]);

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseCount(value, fieldName) {
  const matchedValue = value.match(/[\d,]+/u)?.[0];
  if (!matchedValue) {
    throw new Error(`${fieldName} 값을 찾을 수 없습니다: ${normalizeWhitespace(value)}`);
  }

  return Number.parseInt(matchedValue.replaceAll(",", ""), 10);
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function canonicalRepositoryFromHref(href) {
  const repositoryUrl = new URL(href, githubOrigin);
  const pathSegments = repositoryUrl.pathname.split("/").filter(Boolean);
  if (repositoryUrl.origin !== githubOrigin || pathSegments.length !== 2) {
    throw new Error(`유효하지 않은 GitHub 저장소 URL입니다: ${href}`);
  }

  const name = pathSegments.map(decodeURIComponent).join("/");
  return { name, url: `${githubOrigin}/${name}` };
}

/** GitHub Trending 원본 HTML에서 화면에 표시된 저장소와 수치를 순서대로 추출한다. */
export function parseTrendingRepositories(html) {
  const $ = cheerio.load(html);
  const repositories = $("article.Box-row")
    .map((index, article) => {
      const repositoryLink = $(article).find("h2 a").first();
      const href = repositoryLink.attr("href");
      if (!href) {
        throw new Error(`${index + 1}번째 Trending 항목에서 저장소 링크를 찾을 수 없습니다.`);
      }

      const repository = canonicalRepositoryFromHref(href);
      const language = normalizeWhitespace(
        $(article).find('[itemprop="programmingLanguage"]').first().text(),
      );
      const totalStarsText = $(article).find('a[href$="/stargazers"]').first().text();
      const weeklyStarsText = $(article)
        .find("span")
        .filter((_, element) => /stars?\s+this\s+week/iu.test($(element).text()))
        .first()
        .text();

      if (!totalStarsText || !weeklyStarsText) {
        throw new Error(`${repository.name}의 스타 수를 원본 HTML에서 찾을 수 없습니다.`);
      }

      return {
        ...repository,
        language: language || null,
        totalStars: parseCount(totalStarsText, `${repository.name} 누적 스타`),
        weeklyStars: parseCount(weeklyStarsText, `${repository.name} 주간 스타`),
      };
    })
    .get();

  if (repositories.length === 0) {
    throw new Error("GitHub Trending 원본 HTML에서 저장소 목록을 찾을 수 없습니다.");
  }

  return repositories;
}

function findSection(lines, heading) {
  const startIndex = lines.findIndex((line) => line === heading);
  if (startIndex < 0) return null;

  const nextHeadingOffset = lines.slice(startIndex + 1).findIndex((line) => /^##\s/u.test(line));
  const endIndex = nextHeadingOffset < 0 ? lines.length : startIndex + 1 + nextHeadingOffset;
  return { lines: lines.slice(startIndex + 1, endIndex) };
}

function parseReportRepositories(sectionLines, issues) {
  const repositories = [];

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    const repositoryMatch = line.match(
      /^> \[([^\]]+)\]\((https:\/\/github\.com\/[^)\s]+)\) {2}$/u,
    );
    if (!repositoryMatch) continue;

    const [, displayedName, href] = repositoryMatch;
    let canonicalRepository;
    try {
      canonicalRepository = canonicalRepositoryFromHref(href);
    } catch (error) {
      issues.push(`[형식] ${error.message}`);
      continue;
    }

    const metadataLine = sectionLines[index + 1] ?? "";
    const metadataMatch = metadataLine.match(
      /^> 언어: (.+?) \| 누적 ★: ([\d,]+) \| 주간 ★: ([\d,]+) {2}$/u,
    );
    if (!metadataMatch) {
      issues.push(`[형식] ${displayedName}의 언어·스타 정보 행 형식이 올바르지 않습니다.`);
      continue;
    }

    const summaryLine = sectionLines[index + 2] ?? "";
    if (!/^> 요약: \S/u.test(summaryLine)) {
      issues.push(`[형식] ${displayedName}의 요약이 없거나 형식이 올바르지 않습니다.`);
      continue;
    }

    repositories.push({
      name: displayedName,
      url: canonicalRepository.url,
      language: metadataMatch[1].trim(),
      totalStars: parseCount(metadataMatch[2], `${displayedName} 누적 스타`),
      weeklyStars: parseCount(metadataMatch[3], `${displayedName} 주간 스타`),
    });
  }

  const possibleEntryCount = sectionLines.filter((line) => /^> \[/u.test(line)).length;
  if (possibleEntryCount !== repositories.length) {
    issues.push(
      `[형식] 저장소 항목 ${possibleEntryCount}개 중 ${repositories.length}개만 올바른 형식으로 해석되었습니다.`,
    );
  }

  return repositories;
}

function validateReportFormat(markdown, reportPath) {
  const issues = [];
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const expectedHeadings = ["## 1. 개요", "## 2. 리포지토리", "## 3. 주요 리포지토리 분석"];
  const actualHeadings = lines.filter((line) => /^##\s/u.test(line));

  if (actualHeadings.join("\n") !== expectedHeadings.join("\n")) {
    issues.push(
      `[형식] H2 제목은 다음 순서로 각각 한 번만 있어야 합니다: ${expectedHeadings.join(", ")}`,
    );
  }

  const reportDate = path.basename(reportPath, path.extname(reportPath));
  const expectedTitle = `# GitHub 주간 트렌드 리포트 (${reportDate})`;
  if (lines[0] !== expectedTitle) {
    issues.push(`[형식] 첫 줄 제목은 "${expectedTitle}"이어야 합니다.`);
  }

  if (lines.some((line) => /^#{3,}\s/u.test(line))) {
    issues.push("[형식] H3 이하 제목은 사용할 수 없습니다.");
  }
  if (lines.some((line) => /^\s*[-+]\s+/u.test(line) || /^\s*\d+\.\s+/u.test(line))) {
    issues.push("[형식] 불릿 또는 번호 목록은 사용할 수 없습니다.");
  }
  if (lines.some((line) => /!\[[^\]]*\]\(/u.test(line))) {
    issues.push("[형식] 이미지는 사용할 수 없습니다.");
  }

  const repositorySection = findSection(lines, "## 2. 리포지토리");
  if (!repositorySection) {
    issues.push("[형식] 리포지토리 섹션을 찾을 수 없습니다.");
    return { issues, repositories: [] };
  }

  const repositories = parseReportRepositories(repositorySection.lines, issues);
  const duplicateNames = repositories
    .map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    issues.push(`[형식] 중복 저장소가 있습니다: ${[...new Set(duplicateNames)].join(", ")}`);
  }

  const analysisSection = findSection(lines, "## 3. 주요 리포지토리 분석");
  if (analysisSection) {
    const analyzedRepositories = analysisSection.lines
      .map((line) =>
        line.match(/^> \*\*\[([^\]]+)\]\((https:\/\/github\.com\/[^)\s]+)\)\*\* {2}$/u),
      )
      .filter(Boolean)
      .map((match) => match[1]);

    if (analyzedRepositories.length > 3) {
      issues.push(`[형식] 주요 리포지토리 분석은 최대 3개여야 합니다: ${analyzedRepositories.length}개`);
    }

    const repositoryNames = new Set(repositories.map(({ name }) => name));
    const unknownRepositories = analyzedRepositories.filter((name) => !repositoryNames.has(name));
    if (unknownRepositories.length > 0) {
      issues.push(
        `[형식] 주요 분석에 리포지토리 목록에 없는 저장소가 있습니다: ${unknownRepositories.join(", ")}`,
      );
    }
  }

  return { issues, repositories };
}

function compareRepositoryIdentity(expected, actual, issuePrefix) {
  const issues = [];
  if (expected.length !== actual.length) {
    issues.push(`${issuePrefix} 저장소 개수가 다릅니다: 기준 ${expected.length}개, 비교 대상 ${actual.length}개`);
  }

  const maximumLength = Math.max(expected.length, actual.length);
  for (let index = 0; index < maximumLength; index += 1) {
    const expectedRepository = expected[index];
    const actualRepository = actual[index];
    if (!expectedRepository) {
      issues.push(`${issuePrefix} ${index + 1}위에 불필요한 저장소가 있습니다: ${actualRepository.name}`);
      continue;
    }
    if (!actualRepository) {
      issues.push(`${issuePrefix} ${index + 1}위 저장소가 누락되었습니다: ${expectedRepository.name}`);
      continue;
    }
    if (expectedRepository.name !== actualRepository.name) {
      issues.push(
        `${issuePrefix} ${index + 1}위 저장소가 다릅니다: 기준 ${expectedRepository.name}, 비교 대상 ${actualRepository.name}`,
      );
    }
    if (expectedRepository.url !== actualRepository.url) {
      issues.push(
        `${issuePrefix} ${index + 1}위 URL이 다릅니다: 기준 ${expectedRepository.url}, 비교 대상 ${actualRepository.url}`,
      );
    }
  }

  return issues;
}

function compareReportToSnapshot(snapshotRepositories, reportRepositories) {
  const issues = compareRepositoryIdentity(
    snapshotRepositories,
    reportRepositories,
    "[원본 정합성]",
  );

  const comparableLength = Math.min(snapshotRepositories.length, reportRepositories.length);
  for (let index = 0; index < comparableLength; index += 1) {
    const expected = snapshotRepositories[index];
    const actual = reportRepositories[index];
    if (expected.name !== actual.name) continue;

    const languageMatches = expected.language
      ? expected.language === actual.language
      : missingLanguageLabels.has(actual.language);
    if (!languageMatches) {
      issues.push(
        `[원본 정합성] ${expected.name}의 언어가 다릅니다: 기준 ${expected.language ?? "없음"}, 리포트 ${actual.language}`,
      );
    }
    if (expected.totalStars !== actual.totalStars) {
      issues.push(
        `[원본 정합성] ${expected.name}의 누적 스타가 다릅니다: 기준 ${formatCount(expected.totalStars)}, 리포트 ${formatCount(actual.totalStars)}`,
      );
    }
    if (expected.weeklyStars !== actual.weeklyStars) {
      issues.push(
        `[원본 정합성] ${expected.name}의 주간 스타가 다릅니다: 기준 ${formatCount(expected.weeklyStars)}, 리포트 ${formatCount(actual.weeklyStars)}`,
      );
    }
  }

  return issues;
}

/** 저장된 원본, 작성된 리포트, 검증 시점의 원본을 서로 비교해 실패 사유를 분리한다. */
export function validateReportAgainstSources({
  reportMarkdown,
  reportPath,
  snapshotHtml,
  freshHtml,
}) {
  const report = validateReportFormat(reportMarkdown, reportPath);
  const snapshotRepositories = parseTrendingRepositories(snapshotHtml);
  const freshRepositories = parseTrendingRepositories(freshHtml);
  const issues = [
    ...report.issues,
    ...compareReportToSnapshot(snapshotRepositories, report.repositories),
    ...compareRepositoryIdentity(freshRepositories, snapshotRepositories, "[최신성]"),
  ];

  return {
    issues,
    reportRepositories: report.repositories,
    snapshotRepositories,
    freshRepositories,
  };
}

async function fetchFreshTrendingPage() {
  const response = await fetch(weeklyTrendingUrl, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
      "User-Agent": "github-report-validator/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub Trending 조회 실패: HTTP ${response.status} ${response.statusText}`);
  }

  const finalUrl = new URL(response.url);
  if (
    finalUrl.origin !== githubOrigin ||
    finalUrl.pathname !== "/trending" ||
    finalUrl.searchParams.get("since") !== "weekly"
  ) {
    throw new Error(`GitHub Trending이 아닌 페이지로 이동했습니다: ${response.url}`);
  }

  return response.text();
}

function repositoryIdentity(repositories) {
  return repositories.map(({ name, url }) => `${name}\t${url}`).join("\n");
}

/** 파일과 최신 페이지를 검증하며, 최신 목록이 변동 중이면 원인을 별도 오류로 표시한다. */
export async function validateWeeklyReport({ reportPath, sourcePath }) {
  const [reportMarkdown, snapshotHtml, firstFreshHtml] = await Promise.all([
    readFile(reportPath, "utf8"),
    readFile(sourcePath, "utf8"),
    fetchFreshTrendingPage(),
  ]);
  let validation = validateReportAgainstSources({
    reportMarkdown,
    reportPath,
    snapshotHtml,
    freshHtml: firstFreshHtml,
  });

  const freshnessIssues = validation.issues.filter((issue) => issue.startsWith("[최신성]"));
  if (freshnessIssues.length > 0) {
    const secondFreshHtml = await fetchFreshTrendingPage();
    const firstRepositories = parseTrendingRepositories(firstFreshHtml);
    const secondRepositories = parseTrendingRepositories(secondFreshHtml);
    validation = validateReportAgainstSources({
      reportMarkdown,
      reportPath,
      snapshotHtml,
      freshHtml: secondFreshHtml,
    });

    if (repositoryIdentity(firstRepositories) !== repositoryIdentity(secondRepositories)) {
      validation.issues.push(
        "[최신성] 연속 조회 사이에 GitHub Trending 목록이 변경되었습니다. 원본을 다시 수집해 리포트를 생성해야 합니다.",
      );
    }
  }

  return validation;
}

function formatDateInTimeZone(date, timeZone) {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function parseArguments(argumentsToParse) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const today = formatDateInTimeZone(new Date(), process.env.TZ || "UTC");
  const defaults = {
    reportPath: path.join(repoRoot, "weekly-trend-draft", `${today}.md`),
    sourcePath: path.join(repoRoot, "weekly-trend-draft", `${today}.source.html`),
  };

  for (let index = 0; index < argumentsToParse.length; index += 1) {
    const argument = argumentsToParse[index];
    const value = argumentsToParse[index + 1];
    if (argument === "--report" && value) {
      defaults.reportPath = path.resolve(value);
      index += 1;
    } else if (argument === "--source" && value) {
      defaults.sourcePath = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`지원하지 않는 인자입니다: ${argument}`);
    }
  }

  return defaults;
}

async function main() {
  const paths = parseArguments(process.argv.slice(2));
  console.log(`🔎 리포트 검증: ${paths.reportPath}`);
  console.log(`🔎 수집 원본 검증: ${paths.sourcePath}`);
  console.log(`🔎 최신 목록 조회: ${weeklyTrendingUrl}`);

  const result = await validateWeeklyReport(paths);
  if (result.issues.length > 0) {
    console.error(`❌ 리포트 검증 실패 (${result.issues.length}건)`);
    for (const issue of result.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ 리포트 검증 통과: 저장소 ${result.reportRepositories.length}개`);
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(`❌ 리포트 검증 중 오류가 발생했습니다: ${error.message}`);
    process.exit(1);
  });
}
