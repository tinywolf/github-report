import fs from 'node:fs';
import path from 'node:path';

const workspaceDir = path.resolve('.');
const repoRoot = path.resolve('../../../..');
const reportDir = path.join(repoRoot, 'weekly-trend');
const outputDir = path.join(workspaceDir, 'output');

const W = 1600;
const H = 900;

const colors = {
  bg: '#f8fafc',
  panel: '#ffffff',
  ink: '#101828',
  slate: '#344054',
  muted: '#667085',
  faint: '#e4e7ec',
  faint2: '#eef2f6',
  teal: '#0f9f9a',
  blue: '#2563eb',
  orange: '#f97316',
  green: '#16a34a',
  purple: '#7c3aed',
  yellow: '#d97706',
  red: '#dc2626',
  navy: '#101828',
};

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

function formatK(value) {
  const number = Number(value);
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function text(lines, x, y, opts = {}) {
  const {
    size = 24,
    fill = colors.ink,
    weight = 600,
    anchor = 'start',
    lineHeight = 1.26,
    opacity = 1,
    cls = '',
  } = opts;
  return lines
    .map((line, i) => {
      const dy = i * size * lineHeight;
      return `<text class="${cls}" x="${x}" y="${y + dy}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${esc(line)}</text>`;
    })
    .join('\n');
}

function card(x, y, w, h, opts = {}) {
  const { fill = colors.panel, stroke = '#d9e2ef', rx = 26, shadow = true } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"${shadow ? ' filter="url(#shadow)"' : ''}/>`;
}

function baseSvg(title, subtitle, body, footer = 'Source: local weekly-trend reports, 2026-01-07 ~ 2026-05-27') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="shadow" x="-18%" y="-18%" width="136%" height="136%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${colors.teal}"/>
      <stop offset="45%" stop-color="${colors.orange}"/>
      <stop offset="100%" stop-color="${colors.blue}"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: "Apple SD Gothic Neo", "Noto Sans CJK KR", "Pretendard", Arial, sans-serif; letter-spacing: 0; }
    .mono { font-family: "SFMono-Regular", Consolas, monospace; }
  </style>
  <rect width="${W}" height="${H}" fill="${colors.bg}"/>
  <rect x="72" y="72" width="94" height="8" rx="4" fill="url(#accent)"/>
  ${text([title], 72, 132, { size: 46, weight: 860 })}
  ${text([subtitle], 74, 176, { size: 22, fill: colors.muted, weight: 560 })}
  ${body}
  ${text([footer], 72, 846, { size: 16, fill: '#98a2b3', weight: 560 })}
</svg>`;
}

function parseEntries() {
  const files = fs
    .readdirSync(reportDir)
    .filter((file) => /^2026-0[1-5]-\d{2}\.md$/.test(file))
    .sort();

  const entries = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(reportDir, file), 'utf8');
    const lines = content.split(/\r?\n/);
    let current = null;

    // 기존 리포트 표기 변형을 허용하기 위해 저장소 링크 행과 메타 행을 분리해서 읽는다.
    for (const line of lines) {
      const repoMatch = line.match(/^>\s*\[([^\]]+)\]\((https:\/\/github\.com\/[^\)]+)\)/);
      if (repoMatch) {
        current = {
          date: file.replace('.md', ''),
          month: file.slice(5, 7),
          name: repoMatch[1].replace(/\s+\/\s+/g, '/').trim(),
          url: repoMatch[2],
          lang: 'N/A',
          weekly: 0,
        };
        entries.push(current);
        continue;
      }

      const infoMatch = line.match(/^>\s*언어:\s*([^|]+)\|\s*누적 ★:\s*([^|]+)\|\s*주간 ★:\s*([\d,]+)/);
      if (infoMatch && current) {
        current.lang = infoMatch[1].trim();
        current.weekly = Number(infoMatch[3].replace(/,/g, ''));
      }
    }
  }

  return { files, entries };
}

const { files, entries } = parseEntries();
const uniqueRepos = new Set(entries.map((entry) => entry.name.toLowerCase()));
const totalWeeklyStars = entries.reduce((sum, entry) => sum + entry.weekly, 0);

function byMonth() {
  const map = new Map();
  for (const entry of entries) {
    if (!map.has(entry.month)) {
      map.set(entry.month, { month: entry.month, entries: 0, unique: new Set(), weekly: 0 });
    }
    const row = map.get(entry.month);
    row.entries += 1;
    row.unique.add(entry.name.toLowerCase());
    row.weekly += entry.weekly;
  }
  return [...map.values()].map((row) => ({ ...row, unique: row.unique.size }));
}

function repoAggregate() {
  const map = new Map();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: entry.name, dates: new Map(), count: 0, maxWeekly: 0, totalWeekly: 0, lang: entry.lang });
    }
    const item = map.get(key);
    item.count += 1;
    item.dates.set(entry.date, entry.weekly);
    item.maxWeekly = Math.max(item.maxWeekly, entry.weekly);
    item.totalWeekly += entry.weekly;
  }
  return [...map.values()];
}

function languageCounts(list = entries) {
  const map = new Map();
  for (const entry of list) map.set(entry.lang, (map.get(entry.lang) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function repoLabel(name, max = 28) {
  if (name.length <= max) return name;
  const repo = name.split('/').at(-1);
  return repo.length > max ? `${repo.slice(0, max - 3)}...` : repo;
}

function chartNarrative() {
  const months = byMonth();
  const stages = [
    { m: '1월', title: '도구 대중화', proof: 'opencode · claude-code', question: '쓸 수 있나?', color: colors.teal },
    { m: '2월', title: '실무 적용', proof: 'shannon · claude-mem', question: '어디에 붙이나?', color: colors.orange },
    { m: '3월', title: '운영 체계', proof: 'superpowers · deer-flow', question: '안전하게 굴리나?', color: colors.blue },
    { m: '4월', title: '팀 실행 환경', proof: 'oh-my-codex · hermes-agent', question: '팀이 반복하나?', color: colors.purple },
    { m: '5월', title: '맥락 인프라', proof: 'codegraph · agentmemory', question: '무엇을 기억하나?', color: colors.green },
  ];

  const x0 = 96;
  const y = 306;
  const gap = 292;
  const stageSvg = stages
    .map((stage, index) => {
      const stat = months[index];
      const x = x0 + index * gap;
      const h = 292;
      const top = y + (index % 2 === 0 ? 0 : 34);
      const arrow =
        index < stages.length - 1
          ? `<path d="M ${x + 220} ${top + 114} L ${x + 272} ${top + 114}" stroke="#cbd5e1" stroke-width="6" stroke-linecap="round"/>
<path d="M ${x + 272} ${top + 114} L ${x + 254} ${top + 96} M ${x + 272} ${top + 114} L ${x + 254} ${top + 132}" stroke="#cbd5e1" stroke-width="6" stroke-linecap="round"/>`
          : '';
      return `<g>
${card(x, top, 222, h, { rx: 24 })}
<rect x="${x}" y="${top}" width="222" height="10" rx="5" fill="${stage.color}"/>
${text([stage.m], x + 28, top + 56, { size: 27, fill: stage.color, weight: 880 })}
${text(wrapText(stage.title, 10), x + 28, top + 103, { size: 26, weight: 880, lineHeight: 1.08 })}
<rect x="${x + 28}" y="${top + 132}" width="160" height="34" rx="17" fill="${stage.color}" opacity="0.12"/>
${text([`${stat.entries}개 · ${stat.unique}개 고유`], x + 44, top + 155, { size: 15, fill: stage.color, weight: 840 })}
${text(wrapText(stage.proof, 17), x + 28, top + 204, { size: 17, fill: colors.slate, weight: 700, lineHeight: 1.22 })}
${text(wrapText(stage.question, 16), x + 28, top + 260, { size: 17, fill: colors.ink, weight: 850, lineHeight: 1.2 })}
</g>
${arrow}`;
    })
    .join('\n');

  const summary = `<g>
<rect x="250" y="738" width="1100" height="62" rx="31" fill="${colors.navy}"/>
${text(['1~5월의 결론: 에이전트는 도구에서 업무 맥락을 가진 인프라로 이동'], 800, 778, { size: 23, fill: '#ffffff', weight: 850, anchor: 'middle' })}
</g>`;

  return baseSvg(
    '2026년 1~5월 GitHub 트렌드: 에이전트의 진화',
    `${files.length}개 주간 리포트 · ${entries.length}개 항목 · ${uniqueRepos.size}개 고유 저장소`,
    `${stageSvg}\n${summary}`,
  );
}

function chartMonthlyPulse() {
  const rows = byMonth();
  const maxWeekly = Math.max(...rows.map((row) => row.weekly));
  const maxEntries = Math.max(...rows.map((row) => row.entries));
  const x0 = 150;
  const chartY = 266;
  const groupW = 250;
  const chartH = 380;

  const columns = rows
    .map((row, index) => {
      const x = x0 + index * groupW;
      const weeklyH = (row.weekly / maxWeekly) * chartH;
      const entryH = (row.entries / maxEntries) * chartH;
      return `<g>
<rect x="${x + 38}" y="${chartY + chartH - weeklyH}" width="72" height="${weeklyH}" rx="18" fill="${colors.blue}"/>
<rect x="${x + 126}" y="${chartY + chartH - entryH}" width="48" height="${entryH}" rx="16" fill="${colors.teal}" opacity="0.88"/>
${text([`${formatK(row.weekly)}`], x + 74, chartY + chartH - weeklyH - 18, { size: 18, fill: colors.blue, weight: 860, anchor: 'middle' })}
${text([`${row.entries}개`], x + 150, chartY + chartH - entryH - 18, { size: 16, fill: colors.teal, weight: 840, anchor: 'middle' })}
${text([`${Number(row.month)}월`], x + 104, chartY + chartH + 48, { size: 25, fill: colors.ink, weight: 880, anchor: 'middle' })}
${text([`${row.unique}개 고유`], x + 104, chartY + chartH + 78, { size: 15, fill: colors.muted, weight: 680, anchor: 'middle' })}
</g>`;
    })
    .join('\n');

  const grid = [0, 100000, 200000, 300000, 400000].map((tick) => {
    const y = chartY + chartH - (tick / maxWeekly) * chartH;
    return `<line x1="126" y1="${y}" x2="1408" y2="${y}" stroke="${colors.faint}" stroke-width="1.6"/>
${text([formatK(tick)], 114, y + 6, { size: 14, fill: colors.muted, weight: 650, anchor: 'end' })}`;
  }).join('\n');

  const legend = `<g>
<rect x="1180" y="226" width="20" height="20" rx="6" fill="${colors.blue}"/>
${text(['주간 스타 합계'], 1210, 243, { size: 17, fill: colors.slate, weight: 700 })}
<rect x="1180" y="260" width="20" height="20" rx="6" fill="${colors.teal}" opacity="0.88"/>
${text(['리포트 항목 수'], 1210, 277, { size: 17, fill: colors.slate, weight: 700 })}
</g>`;

  const callout = `<g>
${card(1000, 666, 444, 90, { fill: '#111827', stroke: '#111827', rx: 28 })}
${text(['5월은 항목 수와 관심 강도가 동시에 최고치'], 1222, 706, { size: 23, fill: '#ffffff', weight: 860, anchor: 'middle' })}
${text(['65개 항목 · 52개 고유 저장소 · 410k 주간 ★'], 1222, 738, { size: 17, fill: '#cbd5e1', weight: 650, anchor: 'middle' })}
</g>`;

  return baseSvg(
    '월별 트렌드 펄스: 5월에 밀도와 관심이 재가속',
    `1~5월 주간 스타 합계 ${formatNumber(totalWeeklyStars)} · 막대 라벨은 실제값`,
    `${grid}\n${columns}\n${legend}\n${callout}`,
  );
}

function chartLanguageShift() {
  const overall = languageCounts();
  const top = overall.slice(0, 7);
  const other = overall.slice(7).reduce((sum, [, count]) => sum + count, 0);
  const rows = other ? [...top, ['Other', other]] : top;
  const max = Math.max(...rows.map(([, count]) => count));
  const total = entries.length;
  const chartX = 250;
  const chartY = 250;
  const barMax = 660;
  const rowGap = 59;
  const palette = [colors.green, colors.blue, colors.yellow, colors.purple, colors.orange, colors.teal, '#94a3b8', '#b8c2d1'];

  const bars = rows.map(([lang, count], index) => {
    const y = chartY + index * rowGap;
    const w = (count / max) * barMax;
    const pct = ((count / total) * 100).toFixed(1).replace('.0', '');
    return `<g>
${text([lang], chartX - 36, y + 30, { size: 22, fill: colors.ink, weight: 830, anchor: 'end' })}
<rect x="${chartX}" y="${y}" width="${barMax}" height="38" rx="19" fill="#e8eef6"/>
<rect x="${chartX}" y="${y}" width="${w}" height="38" rx="19" fill="${palette[index]}"/>
${text([`${count}개`], chartX + w + 18, y + 27, { size: 19, fill: colors.ink, weight: 850 })}
${text([`${pct}%`], chartX + barMax + 138, y + 27, { size: 17, fill: colors.muted, weight: 720, anchor: 'end' })}
</g>`;
  }).join('\n');

  const q1 = entries.filter((entry) => ['01', '02', '03'].includes(entry.month));
  const aprMay = entries.filter((entry) => ['04', '05'].includes(entry.month));
  const rustQ1 = q1.filter((entry) => entry.lang === 'Rust').length;
  const rustLater = aprMay.filter((entry) => entry.lang === 'Rust').length;
  const rustQ1Pct = Math.round((rustQ1 / q1.length) * 1000) / 10;
  const rustLaterPct = Math.round((rustLater / aprMay.length) * 1000) / 10;
  const pyTs = (overall.find(([lang]) => lang === 'Python')?.[1] || 0) + (overall.find(([lang]) => lang === 'TypeScript')?.[1] || 0);

  const side = `<g>
${card(1080, 284, 370, 176)}
${text([`${Math.round((pyTs / total) * 100)}%`], 1140, 358, { size: 66, fill: colors.blue, weight: 900 })}
${text(['Python + TypeScript'], 1144, 402, { size: 22, fill: colors.ink, weight: 860 })}
${text(wrapText('Python은 모델·데이터, TypeScript는 UI·브라우저 경험을 주도합니다.', 24), 1144, 438, { size: 17, fill: colors.slate, weight: 650, lineHeight: 1.28 })}
</g>
<g>
${card(1080, 498, 370, 160)}
${text(['Rust의 후반부 부상'], 1144, 542, { size: 23, fill: colors.ink, weight: 870 })}
${text([`1분기 ${rustQ1Pct}% → 4~5월 ${rustLaterPct}%`], 1144, 584, { size: 26, fill: colors.orange, weight: 900 })}
${text(wrapText('터미널, 로컬 실행, 고성능 개발 도구가 늘며 Rust 비중이 커졌습니다.', 27), 1144, 624, { size: 16, fill: colors.slate, weight: 650, lineHeight: 1.26 })}
</g>`;

  return baseSvg(
    '언어 분포: Python·TypeScript 양강, Rust는 후반부에 부상',
    '2026년 1~5월 트렌드 항목 226개 기준',
    `${bars}\n${side}`,
  );
}

function chartRepeatHeatmap() {
  const rows = repoAggregate()
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || b.maxWeekly - a.maxWeekly)
    .slice(0, 15);

  const gridX = 642;
  const gridY = 242;
  const colW = 48;
  const rowH = 36;
  const maxWeekly = Math.max(...rows.map((row) => row.maxWeekly));
  const monthColors = { '01': colors.teal, '02': colors.orange, '03': colors.blue, '04': colors.purple, '05': colors.green };

  const monthGroups = [];
  for (const month of ['01', '02', '03', '04', '05']) {
    const idxs = files.map((file, i) => [file, i]).filter(([file]) => file.slice(5, 7) === month).map(([, i]) => i);
    monthGroups.push({ month, start: Math.min(...idxs), end: Math.max(...idxs), count: idxs.length });
  }

  const bands = monthGroups.map((group) => {
    const x = gridX + group.start * colW - 22;
    const w = group.count * colW - 8;
    return `<rect x="${x}" y="202" width="${w}" height="24" rx="12" fill="${monthColors[group.month]}" opacity="0.14"/>
${text([`${Number(group.month)}월`], x + w / 2, 220, { size: 14, fill: monthColors[group.month], weight: 900, anchor: 'middle' })}`;
  }).join('\n');

  const headers = files.map((file, i) => text([file.replace('.md', '').slice(5)], gridX + i * colW, 252, {
    size: 13,
    fill: colors.muted,
    weight: 760,
    anchor: 'middle',
  })).join('\n');

  const heat = rows.map((row, r) => {
    const y = gridY + 38 + r * rowH;
    const fill = row.count >= 5 ? colors.orange : row.maxWeekly >= 15000 ? colors.blue : colors.teal;
    const label = repoLabel(row.name, 31);
    const dots = files.map((file, c) => {
      const date = file.replace('.md', '');
      const weekly = row.dates.get(date) || 0;
      const x = gridX + c * colW;
      if (!weekly) return `<circle cx="${x}" cy="${y}" r="5.5" fill="#e3e9f2"/>`;
      const radius = 7 + Math.sqrt(weekly / maxWeekly) * 15;
      const labelText = weekly >= 10000 ? formatK(weekly) : '';
      return `<circle cx="${x}" cy="${y}" r="${radius.toFixed(1)}" fill="${fill}" opacity="0.92"/>
${labelText ? text([labelText], x, y + 4, { size: 10, fill: '#fff', weight: 900, anchor: 'middle' }) : ''}`;
    }).join('\n');
    return `<g>
${text([label], 106, y + 7, { size: 19, fill: colors.ink, weight: 820 })}
${text([`${row.count}회 · 최대 ${formatK(row.maxWeekly)}`], 552, y + 7, { size: 15, fill: colors.muted, weight: 730, anchor: 'end' })}
${dots}
</g>`;
  }).join('\n');

  return baseSvg(
    '반복 등장 프로젝트: 오래 간 신호는 “에이전트 운영 체계”',
    '점 크기는 해당 주간 스타 증가량, 10k 이상은 숫자 표기',
    `${bands}\n${headers}\n${heat}`,
  );
}

function chartStarSpikes() {
  const top = [...entries].sort((a, b) => b.weekly - a.weekly).slice(0, 15);
  const max = top[0].weekly;
  const chartX = 610;
  const chartY = 220;
  const barMax = 820;
  const rowH = 38;

  const grid = [0, 20000, 40000, 60000, 80000, 92000].map((tick) => {
    const x = chartX + (tick / max) * barMax;
    return `<line x1="${x}" y1="198" x2="${x}" y2="790" stroke="${colors.faint}" stroke-width="1.4"/>
${text([formatK(tick)], x, 820, { size: 14, fill: colors.muted, weight: 700, anchor: 'middle' })}`;
  }).join('\n');

  const bars = top.map((entry, i) => {
    const y = chartY + i * rowH;
    const w = (entry.weekly / max) * barMax;
    const fill = i === 0 ? colors.red : i < 5 ? colors.orange : i < 10 ? colors.blue : colors.teal;
    return `<g>
${text([String(i + 1)], 92, y + 25, { size: 16, fill: colors.muted, weight: 800, anchor: 'middle' })}
${text([repoLabel(entry.name, 28)], 128, y + 25, { size: 18, fill: colors.ink, weight: 820 })}
${text([entry.date.slice(5)], 508, y + 25, { size: 15, fill: colors.muted, weight: 720, anchor: 'end' })}
<rect x="${chartX}" y="${y}" width="${barMax}" height="27" rx="13.5" fill="#e4ebf5"/>
<rect x="${chartX}" y="${y}" width="${w}" height="27" rx="13.5" fill="${fill}"/>
${text([formatNumber(entry.weekly)], chartX + w + 16, y + 21, { size: 17, fill: colors.ink, weight: 850 })}
</g>`;
  }).join('\n');

  const callout = `<g>
${card(1024, 92, 432, 86, { fill: colors.navy, stroke: colors.navy, rx: 28 })}
${text(['상위권은 세 갈래로 압축'], 1064, 130, { size: 22, fill: '#fff', weight: 860 })}
${text(['스킬 · 터미널 에이전트 · 코드 이해 그래프'], 1064, 160, { size: 17, fill: '#d0d5dd', weight: 680 })}
</g>`;

  return baseSvg(
    '주간 스타 급등 Top 15',
    '최대 이상치 openclaw 이후, 5월에는 스킬·터미널·코드 이해 도구가 상위권을 재편',
    `${grid}\n${bars}\n${callout}`,
  );
}

function chartInfraMap() {
  const layers = [
    {
      title: '코드·문서 이해',
      desc: '그래프 색인 · 영향도 분석 · 온보딩 탐색',
      repos: ['codegraph', 'Understand-Anything', 'PageIndex', 'react-doctor'],
      color: colors.green,
    },
    {
      title: '기억과 개인 맥락',
      desc: '세션 지속성 · 개인 데이터 · 로컬 우선 메모리',
      repos: ['agentmemory', 'openhuman', 'claude-mem', 'OpenViking'],
      color: colors.teal,
    },
    {
      title: '실행 환경과 절차',
      desc: '터미널 · 하네스 · 스킬 · 팀 워크플로',
      repos: ['warp', 'DeepSeek-TUI', 'superpowers', 'mattpocock/skills'],
      color: colors.blue,
    },
    {
      title: '도메인 업무 패키지',
      desc: '금융 · 연구 · 콘텐츠 · OSINT 자동화',
      repos: ['financial-services', 'TradingAgents', 'academic-research-skills', 'ViMax'],
      color: colors.orange,
    },
  ];

  const rows = layers.map((layer, i) => {
    const y = 238 + i * 126;
    const chips = layer.repos.map((repo, j) => {
      const x = 860 + (j % 2) * 270;
      const cy = y + 18 + Math.floor(j / 2) * 40;
      return `<rect x="${x}" y="${cy}" width="236" height="31" rx="15.5" fill="${layer.color}" opacity="0.12"/>
${text([repo], x + 118, cy + 22, { size: 15, fill: layer.color, weight: 860, anchor: 'middle' })}`;
    }).join('\n');
    return `<g>
${card(142, y, 1320, 96, { rx: 24 })}
<rect x="142" y="${y}" width="14" height="96" rx="7" fill="${layer.color}"/>
${text([layer.title], 198, y + 41, { size: 29, fill: colors.ink, weight: 900 })}
${text([layer.desc], 198, y + 72, { size: 19, fill: colors.muted, weight: 680 })}
${chips}
</g>`;
  }).join('\n');

  const rail = `<g>
<path d="M 84 716 C 84 582, 84 432, 84 246" stroke="url(#accent)" stroke-width="8" stroke-linecap="round"/>
<path d="M 84 246 L 66 278 M 84 246 L 102 278" stroke="${colors.teal}" stroke-width="8" stroke-linecap="round"/>
${text(['업무 맥락'], 82, 224, { size: 17, fill: colors.muted, weight: 800, anchor: 'middle' })}
${text(['실행 기반'], 82, 746, { size: 17, fill: colors.muted, weight: 800, anchor: 'middle' })}
</g>`;

  const thesis = `<g>
<rect x="310" y="742" width="980" height="58" rx="29" fill="${colors.navy}"/>
${text(['5월 이후의 승부처: 에이전트가 “무엇을 알고 기억하는가”'], 800, 780, { size: 24, fill: '#fff', weight: 860, anchor: 'middle' })}
</g>`;

  return baseSvg(
    '에이전트 업무 인프라 맵',
    '1~5월 반복 등장 저장소와 주요 분석 섹션을 기반으로 재구성',
    `${rail}\n${rows}\n${thesis}`,
  );
}

function writeSvg(name, svg) {
  fs.writeFileSync(path.join(outputDir, name), svg, 'utf8');
}

const charts = [
  ['01-narrative-evolution.svg', chartNarrative()],
  ['02-monthly-pulse.svg', chartMonthlyPulse()],
  ['03-language-shift.svg', chartLanguageShift()],
  ['04-repeat-heatmap.svg', chartRepeatHeatmap()],
  ['05-star-spikes.svg', chartStarSpikes()],
  ['06-agent-infra-map.svg', chartInfraMap()],
];

fs.mkdirSync(outputDir, { recursive: true });
for (const [name, svg] of charts) writeSvg(name, svg);

const readme = `# 2026년 1~5월 GitHub 트렌드 발표용 시각 자료

생성 기준: weekly-trend/2026-01-07.md ~ weekly-trend/2026-05-27.md

- 리포트 수: ${files.length}
- 항목 수: ${entries.length}
- 고유 저장소 수: ${uniqueRepos.size}
- 주간 스타 합계: ${formatNumber(totalWeeklyStars)}

## 파일
${charts.map(([name]) => `- ${name}`).join('\n')}
`;

fs.writeFileSync(path.join(outputDir, 'README.md'), readme, 'utf8');
console.log(charts.map(([name]) => path.join(outputDir, name)).join('\n'));
