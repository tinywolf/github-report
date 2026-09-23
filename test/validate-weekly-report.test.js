import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTrendingRepositories,
  validateReportAgainstSources,
} from "../scripts/validate-weekly-report.js";

function trendingHtml(repositories) {
  return repositories
    .map(
      ({ name, language, totalStars, weeklyStars }) => `
        <article class="Box-row">
          <h2><a href="/${name}">${name}</a></h2>
          ${language ? `<span itemprop="programmingLanguage">${language}</span>` : ""}
          <a href="/${name}/stargazers">${totalStars}</a>
          <span>${weeklyStars} stars this week</span>
        </article>`,
    )
    .join("\n");
}

const repositories = [
  {
    name: "example/alpha",
    language: "TypeScript",
    totalStars: "1,234",
    weeklyStars: "321",
  },
  {
    name: "example/beta",
    language: null,
    totalStars: "900",
    weeklyStars: "87",
  },
];

const validReport = `# GitHub 주간 트렌드 리포트 (2026-09-23)

## 1. 개요
검증용 개요입니다.

## 2. 리포지토리
> [example/alpha](https://github.com/example/alpha)  
> 언어: TypeScript | 누적 ★: 1,234 | 주간 ★: 321  
> 요약: 첫 번째 저장소입니다.
>  
> [example/beta](https://github.com/example/beta)  
> 언어: N/A | 누적 ★: 900 | 주간 ★: 87  
> 요약: 두 번째 저장소입니다.

## 3. 주요 리포지토리 분석
> **[example/alpha](https://github.com/example/alpha)**  
> 상세 분석입니다.
`;

test("GitHub Trending HTML에서 저장소 필드를 추출한다", () => {
  assert.deepEqual(parseTrendingRepositories(trendingHtml(repositories)), [
    {
      name: "example/alpha",
      url: "https://github.com/example/alpha",
      language: "TypeScript",
      totalStars: 1234,
      weeklyStars: 321,
    },
    {
      name: "example/beta",
      url: "https://github.com/example/beta",
      language: null,
      totalStars: 900,
      weeklyStars: 87,
    },
  ]);
});

test("리포트, 수집 원본, 최신 목록이 일치하면 통과한다", () => {
  const html = trendingHtml(repositories);
  const result = validateReportAgainstSources({
    reportMarkdown: validReport,
    reportPath: "/tmp/2026-09-23.md",
    snapshotHtml: html,
    freshHtml: html,
  });

  assert.deepEqual(result.issues, []);
});

test("주간 스타를 잘못 해석하면 원본 정합성 오류를 반환한다", () => {
  const invalidReport = validReport.replace("주간 ★: 321", "주간 ★: 12");
  const html = trendingHtml(repositories);
  const result = validateReportAgainstSources({
    reportMarkdown: invalidReport,
    reportPath: "/tmp/2026-09-23.md",
    snapshotHtml: html,
    freshHtml: html,
  });

  assert.ok(result.issues.some((issue) => issue.includes("주간 스타가 다릅니다")));
});

test("검증 시점에 스타 수만 증가한 경우 최신 목록 검증은 통과한다", () => {
  const snapshotHtml = trendingHtml(repositories);
  const freshHtml = trendingHtml(
    repositories.map((repository) => ({
      ...repository,
      totalStars: String(Number.parseInt(repository.totalStars.replaceAll(",", ""), 10) + 10),
      weeklyStars: String(Number.parseInt(repository.weeklyStars, 10) + 10),
    })),
  );
  const result = validateReportAgainstSources({
    reportMarkdown: validReport,
    reportPath: "/tmp/2026-09-23.md",
    snapshotHtml,
    freshHtml,
  });

  assert.deepEqual(result.issues, []);
});

test("검증 시점의 저장소 순서가 바뀌면 최신성 오류를 반환한다", () => {
  const snapshotHtml = trendingHtml(repositories);
  const freshHtml = trendingHtml([...repositories].reverse());
  const result = validateReportAgainstSources({
    reportMarkdown: validReport,
    reportPath: "/tmp/2026-09-23.md",
    snapshotHtml,
    freshHtml,
  });

  assert.ok(result.issues.some((issue) => issue.startsWith("[최신성]")));
});
