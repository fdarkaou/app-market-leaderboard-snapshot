#!/usr/bin/env node
// App Store leaderboard snapshot on the PeekPanda API. Node 18+, no dependencies.
// One call to GET /v1/market/leaderboard per run: one chart (free, paid or grossing; overall or one category) plus market findings.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { toReport, toMarkdown, toCsv, toChat, diff, CHART_TYPES } from './leaderboard.js';

const HELP = `Usage:
  PEEKPANDA_TOKEN=... node cli.js [options]
  node cli.js --file leaderboard.json [options]

Options:
  --country <cc>           Apple storefront, two lowercase letters (default us)
  --category <all|id>      all = overall chart (default), or an Apple category id such as 6013 (Health & Fitness)
  --chart free|paid|grossing  chart type (default free)
  --top <n>                rows to print in Markdown (default 25; CSV and JSON keep every row)
  --state <path>           compare with the report saved at this path (entered, left, biggest moves), then save this run there
  --archive <dir>          also save this run as <dir>/<country>-<category>-<chart>-<chart day>.json (a dated history)
  --format md|csv|json     output format (default md; json is this tool's report, which --file and --state accept)
  --webhook <url>          also POST a short summary to a Slack or Discord incoming webhook
  --tenancy <value>        x-genviral-tenancy header (default personal)
  --api <url>              API base (default https://api.peekpanda.com)
  --file <path>            read a saved response (raw API response or a report) instead of calling the API`;

function parse(argv) {
  const o = { format: 'md', tenancy: 'personal', api: 'https://api.peekpanda.com', top: '25' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else throw new Error(`Unexpected argument "${a}". See --help.`);
  }
  return o;
}

async function getLeaderboard(o, retried = false) {
  const token = process.env.PEEKPANDA_TOKEN;
  if (!token) throw new Error('Set PEEKPANDA_TOKEN to a PeekPanda API key (Account → API keys). Never commit it.');
  const url = new URL('/v1/market/leaderboard', o.api);
  url.searchParams.set('country', o.country);
  url.searchParams.set('categoryId', o.category);
  url.searchParams.set('chartType', o.chart);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-genviral-tenancy': o.tenancy, Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code ?? '';
    const retry = Number(res.headers.get('retry-after'));
    // 429 rate_limited and 503 timeout carry Retry-After: wait once and send the same read again. daily_call_limit waits until 00:00 UTC.
    if ((res.status === 429 || res.status === 503) && code !== 'daily_call_limit' && !retried && retry > 0 && retry <= 60) {
      await new Promise((r) => setTimeout(r, retry * 1000));
      return getLeaderboard(o, true);
    }
    throw new Error(`PeekPanda API ${res.status} ${code}: ${body?.error?.message ?? res.statusText}`);
  }
  return res.json();
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help) { console.log(HELP); return; }
  // Calling the API: defaults us / all / free. Reading a file: unset means "the chart this response was asked for".
  if (!o.file) { o.country ??= 'us'; o.category ??= 'all'; o.chart ??= 'free'; }
  if (o.country != null && !/^[a-z]{2}$/.test(o.country)) throw new Error('--country must be two lowercase letters, like us or gb');
  if (o.category != null && !/^(all|\d+)$/.test(o.category)) throw new Error('--category must be all or a numeric Apple category id');
  if (o.chart != null && !CHART_TYPES.includes(o.chart)) throw new Error('--chart must be free, paid or grossing');
  const top = Number(o.top);
  if (!Number.isInteger(top) || top < 1) throw new Error('--top must be a whole number of 1 or more');

  const raw = o.file ? JSON.parse(await readFile(o.file, 'utf8')) : await getLeaderboard(o);
  const report = toReport(raw, { chartType: o.chart, categoryId: o.category, fetchedAt: o.file ? null : new Date().toISOString() });

  let d = null;
  if (o.state) {
    const prev = await readFile(o.state, 'utf8').then(JSON.parse).catch(() => null);
    d = diff(report, prev);
    await writeFile(o.state, JSON.stringify(report, null, 2));
  }
  if (o.archive) {
    await mkdir(o.archive, { recursive: true });
    const q = report.query;
    await writeFile(join(o.archive, `${q.country}-${q.categoryId}-${q.chartType}-${report.chartDay ?? 'unknown'}.json`), JSON.stringify(report, null, 2));
  }

  if (o.format === 'json') console.log(JSON.stringify(report, null, 2));
  else if (o.format === 'csv') console.log(toCsv(report));
  else console.log(toMarkdown(report, d, top) + '\n\nRanks are dated public App Store chart observations; a move compares with the preceding stored chart day. Download and revenue figures are PeekPanda monthly worldwide estimates, not measured results; an empty cell means no estimate, not zero. Empty ad cells mean paid ads were not collected for that app.');

  if (o.webhook) {
    const text = toChat(report, d);
    const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(o.webhook);
    const r = await fetch(o.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isDiscord ? { content: text.slice(0, 1900) } : { text }) });
    if (!r.ok) throw new Error(`Webhook returned ${r.status}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
