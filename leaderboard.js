// Pure helpers for the App Store leaderboard snapshot. Works in Node and in the browser (index.html imports it).
// Input: one GET /v1/market/leaderboard response. Output: a dated report (one chart + market findings), Markdown, CSV, chat text, diff.

export const CHART_TYPES = ['free', 'paid', 'grossing'];

export function compact(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const a = Math.abs(n);
  const t = (x) => (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString();
  if (a >= 1e9) return t(n / 1e9) + 'B';
  if (a >= 1e6) return t(n / 1e6) + 'M';
  if (a >= 1e3) return t(n / 1e3) + 'k';
  return String(Math.round(n));
}

// A monthly estimate is a range, below_floor (under a ceiling) or missing. Missing stays empty, never zero.
export function estimate(e) {
  if (!e) return { kind: null, low: null, mid: null, high: null, ceiling: null };
  if (e.kind === 'range' && e.range) return { kind: 'range', low: e.range.low ?? null, mid: e.range.mid ?? null, high: e.range.high ?? null, ceiling: null };
  if (e.kind === 'below_floor') return { kind: 'below_floor', low: null, mid: null, high: null, ceiling: e.ceiling ?? null };
  return { kind: e.kind ?? null, low: null, mid: null, high: null, ceiling: null };
}
export function estimateText(e, prefix = '') {
  if (e.kind === 'range') return `${prefix}${compact(e.low)}–${prefix}${compact(e.high)}`;
  if (e.kind === 'below_floor') return e.ceiling != null ? `< ${prefix}${compact(e.ceiling)}` : 'below floor';
  return '';
}

// The chart this report is about. With categoryId "all" it is charts[chartType] (free, paid or grossing overall).
// With a category id, or with nothing asked, it is the category-selected viewChart when the response has one.
export function pickChart(raw, { chartType, categoryId } = {}) {
  const view = raw?.viewChart ?? null;
  if (categoryId !== 'all' && view) {
    if (categoryId != null && String(view.query?.categoryId) !== String(categoryId)) throw new Error(`This response holds category ${view.query?.categoryId}, not ${categoryId}.`);
    return view;
  }
  if (categoryId != null && categoryId !== 'all') throw new Error(`This response has no chart for category ${categoryId}.`);
  return raw?.charts?.[chartType ?? 'free'] ?? null;
}

const num = (v) => (Number.isFinite(v) ? v : null);

// Normalise a raw leaderboard response, or pass through a report this tool saved earlier.
export function toReport(raw, opts = {}) {
  if (raw?.kind === 'peekpanda-leaderboard-snapshot') return raw;
  const chart = pickChart(raw, opts);
  const chartType = chart?.query?.chartType ?? opts.chartType ?? 'free';
  if (!chart) throw new Error('No chart found. Expected a GET /v1/market/leaderboard response with charts and viewChart.');
  const q = chart.query ?? {};
  const sig = new Map((raw.signals?.apps ?? []).map((a) => [String(a.storeId), a]));
  const ov = raw.overview ?? {};
  const rows = (chart.data ?? []).map((r) => {
    const s = sig.get(String(r.storeId));
    const est = r.estimates ?? {};
    return {
      rank: num(r.rank), previousRank: num(r.previousRank), movement: num(r.movement), status: r.status ?? '',
      storeId: String(r.storeId), name: r.name ?? '(no name)', developer: r.developer ?? '',
      categoryName: r.categoryName ?? '', releaseDate: r.releaseDate ?? '',
      price: num(r.price), currency: r.currency ?? '', rating: num(r.rating), ratingCount: num(r.ratingCount),
      installs: estimate(est.monthlyInstalls), revenue: estimate(est.monthlyRevenue), estimateCurrency: est.currency ?? 'USD',
      // null signals mean "not collected", not zero.
      liveAds: num(s?.paid?.liveAds), adsStartedLast7Days: num(s?.paid?.startedLast7Days),
      history: (r.history ?? []).filter((h) => h?.day).map((h) => ({ day: h.day, rank: num(h.rank) })),
      organicViews: num(s?.organic?.views), keywordsTop10: num(s?.keywords?.top10), bestKeyword: s?.keywords?.best?.query ?? '',
    };
  });
  const pick = (list, f) => (list ?? []).map(f);
  const place = (p) => (p ? { rank: p.rank ?? null, previousRank: p.previousRank ?? null, chartType: p.chartType ?? '', categoryName: p.categoryName ?? '' } : null);
  const f = ov.findings ?? {};
  return {
    kind: 'peekpanda-leaderboard-snapshot',
    query: { country: q.country ?? opts.country ?? 'us', categoryId: String(q.categoryId ?? opts.categoryId ?? 'all'), chartType: q.chartType ?? chartType },
    categoryName: (chart.coverage?.categories ?? []).find((c) => String(c.id) === String(q.categoryId))?.name ?? (q.categoryId === 'all' ? 'Overall' : rows[0]?.categoryName ?? ''),
    chartDay: chart.snapshot?.day ?? ov.chart?.day ?? null,
    previousDay: chart.snapshot?.previousDay ?? ov.chart?.previousDay ?? null,
    snapshotStale: Boolean(chart.snapshot?.stale),
    projection: { computedAt: raw.projection?.computedAt ?? null, stale: Boolean(raw.projection?.stale) },
    fetchedAt: opts.fetchedAt ?? null,
    summary: chart.summary ?? null,
    pulse: ov.pulse ? {
      liveAds: num(ov.pulse.paid?.liveAds), advertisers: num(ov.pulse.paid?.advertisers), adsStartedLast7Days: num(ov.pulse.paid?.startedLast7Days),
      organicPosts: num(ov.pulse.organic?.posts), organicMatchedApps: num(ov.pulse.organic?.matchedApps), rankedKeywords: num(ov.pulse.keywords?.rankedKeywords),
    } : null,
    findings: {
      climbingAndBuying: pick(f.climbingAndBuying, (a) => ({ storeId: a.storeId, name: a.name, placement: place(a.placement), liveAds: a.liveAds ?? null, startedLast7Days: a.startedLast7Days ?? null })),
      newEntrants: pick(f.newEntrants, (a) => ({ storeId: a.storeId, name: a.name, rank: a.rank ?? null, categoryName: a.categoryName ?? '', hasAds: a.hasAds, hasOrganic: a.hasOrganic, hasKeywords: a.hasKeywords })),
      buyingNotCharting: pick(f.buyingNotCharting, (a) => ({ storeId: a.storeId, name: a.name, liveAds: a.liveAds ?? null, placement: place(a.placement) })),
      viralNotBuying: pick(f.viralNotBuying, (a) => ({ storeId: a.storeId, name: a.name, matchedPosts: a.matchedPosts ?? null, views: a.views ?? null })),
    },
    data: rows,
  };
}

const key = (rep) => `${rep.query.country}/${rep.query.categoryId}/${rep.query.chartType}`;

// Compare with the report saved by your last run of the same chart: apps that entered, left, and moved most.
export function diff(rep, previous) {
  if (!previous) return null;
  const prev = toReport(previous);
  if (key(prev) !== key(rep)) return { mismatch: `${key(prev)} vs ${key(rep)}`, entered: [], left: [], moved: [] };
  const before = new Map(prev.data.map((r) => [r.storeId, r]));
  const now = new Set(rep.data.map((r) => r.storeId));
  const moved = rep.data
    .filter((r) => before.has(r.storeId) && r.rank != null && before.get(r.storeId).rank != null && before.get(r.storeId).rank !== r.rank)
    .map((r) => ({ ...r, sinceLastRun: before.get(r.storeId).rank - r.rank }))
    .sort((a, b) => Math.abs(b.sinceLastRun) - Math.abs(a.sinceLastRun));
  return { since: prev.chartDay, entered: rep.data.filter((r) => !before.has(r.storeId)), left: [...before.values()].filter((r) => !now.has(r.storeId)), moved };
}

// previousDay is the chart day the move compares with; with one and no previous rank, the app is new on the chart.
export function moveText(r, previousDay = null) {
  if (r.status && r.status !== 'ranked') return r.status;
  if (r.movement == null) return r.previousRank == null && previousDay && r.rank != null ? 'new' : '';
  return r.movement > 0 ? `▲${r.movement}` : r.movement < 0 ? `▼${-r.movement}` : '=';
}
const appLink = (r) => `https://apps.apple.com/app/id${r.storeId}`;
const usd = (r) => (r.estimateCurrency === 'USD' ? '$' : '');
const title = (rep) => `App Store top ${rep.query.chartType}, ${rep.categoryName || rep.query.categoryId}, ${rep.query.country.toUpperCase()}`;
const clean = (s) => String(s ?? '').replace(/\|/g, '/');

export function gainers(rep, n = 5) {
  return rep.data.filter((r) => r.movement > 0).sort((a, b) => b.movement - a.movement).slice(0, n);
}

export function toMarkdown(rep, d = null, top = 25) {
  const out = [`## ${title(rep)}`, ''];
  out.push(`Chart day ${rep.chartDay ?? '?'} (compared with ${rep.previousDay ?? 'no earlier day'})${rep.snapshotStale || rep.projection.stale ? ' — marked stale by PeekPanda' : ''}. ${rep.data.length} ranked apps in this response.`);
  const s = rep.summary;
  if (s) out.push('', `Gainers ${s.gainers ?? '?'}, losers ${s.losers ?? '?'}, new entrants ${s.newEntrants ?? '?'}, new releases ${s.newReleases ?? '?'}.`);
  if (d?.mismatch) out.push('', `State file is for a different chart (${d.mismatch}); no comparison.`);
  else if (d) {
    out.push('', `Since your last run (chart day ${d.since ?? '?'}): ${d.entered.length} entered, ${d.left.length} left.` +
      (d.entered.length ? ' Entered: ' + d.entered.map((r) => `${r.name} (#${r.rank})`).join(', ') + '.' : '') +
      (d.left.length ? ' Left: ' + d.left.map((r) => `${r.name} (was #${r.rank})`).join(', ') + '.' : '') +
      (d.moved.length ? ' Biggest moves: ' + d.moved.slice(0, 5).map((r) => `${r.name} ${r.sinceLastRun > 0 ? '+' : ''}${r.sinceLastRun}`).join(', ') + '.' : ''));
  }
  const g = gainers(rep);
  if (g.length) out.push('', 'Top climbers since the previous chart day: ' + g.map((r) => `${r.name} ▲${r.movement} to #${r.rank}`).join(', ') + '.');
  const isNew = new Set(d?.entered?.map((r) => r.storeId) ?? []);
  out.push('', '| # | Move | App | Developer | Category | Rating (ratings) | Downloads / mo est. | Revenue / mo est. | Live ads (+7d) | Top-10 searches |', '| ---: | --- | --- | --- | --- | --- | --- | --- | --- | ---: |');
  for (const r of rep.data.slice(0, top)) {
    const rating = (r.rating != null ? `${Math.round(r.rating * 10) / 10}` : '') + (r.ratingCount != null ? ` (${compact(r.ratingCount)})` : '');
    const ads = r.liveAds == null ? '' : `${r.liveAds}${r.adsStartedLast7Days != null ? ` (+${r.adsStartedLast7Days})` : ''}`;
    out.push(`| ${r.rank ?? ''} | ${moveText(r, rep.previousDay)} | [${clean(r.name)}](${appLink(r)})${isNew.has(r.storeId) ? ' 🆕' : ''} | ${clean(r.developer)} | ${clean(r.categoryName)} | ${rating} | ${estimateText(r.installs)} | ${estimateText(r.revenue, usd(r))} | ${ads} | ${r.keywordsTop10 ?? ''} |`);
  }
  if (rep.data.length > top) out.push('', `…${rep.data.length - top} more rows (raise --top, or use --format csv).`);
  const f = rep.findings;
  const sect = (h, list, fmt) => { if (list.length) out.push('', `### ${h}: ${list.length}`, '', ...list.map((a) => `- ${fmt(a)}`)); };
  const pl = (p) => (p ? `#${p.rank} ${p.chartType} in ${p.categoryName}${p.previousRank != null ? ` (was #${p.previousRank})` : ''}` : 'not on a stored chart');
  out.push('', `## Market findings, ${rep.query.country.toUpperCase()}`);
  if (rep.pulse) out.push('', `Paid-ad pulse: ${rep.pulse.liveAds ?? '?'} live ads from ${rep.pulse.advertisers ?? '?'} advertisers, ${rep.pulse.adsStartedLast7Days ?? '?'} started in the last 7 days. Organic: ${rep.pulse.organicPosts ?? '?'} stored posts matched to ${rep.pulse.organicMatchedApps ?? '?'} apps.`);
  sect('Climbing and buying ads (climbingAndBuying)', f.climbingAndBuying, (a) => `${a.name}: ${pl(a.placement)}, ${a.liveAds ?? '?'} live ads, ${a.startedLast7Days ?? '?'} started in 7 days`);
  sect('New chart entrants (newEntrants)', f.newEntrants, (a) => `${a.name}: #${a.rank ?? '?'} (${a.categoryName}); ads ${a.hasAds ? 'yes' : 'none stored'}, organic ${a.hasOrganic ? 'yes' : 'none stored'}, keywords ${a.hasKeywords ? 'yes' : 'none stored'}`);
  sect('Buying ads, not charting (buyingNotCharting)', f.buyingNotCharting, (a) => `${a.name}: ${a.liveAds ?? '?'} live ads, ${pl(a.placement)}`);
  sect('Viral organic, not buying ads (viralNotBuying)', f.viralNotBuying, (a) => `${a.name}: ${a.matchedPosts ?? '?'} posts, ${compact(a.views)} views as last counted`);
  return out.join('\n');
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const CSV_COLUMNS = ['chartDay', 'country', 'categoryId', 'chartType', 'rank', 'previousRank', 'movement', 'status', 'storeId', 'name', 'developer', 'categoryName', 'releaseDate', 'price', 'rating', 'ratingCount',
  'installsKind', 'installsLow', 'installsMid', 'installsHigh', 'installsCeiling', 'revenueKind', 'revenueLow', 'revenueMid', 'revenueHigh', 'revenueCeiling', 'liveAds', 'adsStartedLast7Days', 'organicViews', 'keywordsTop10', 'bestKeyword'];
export function toCsv(rep) {
  const val = (r, k) => {
    if (k === 'chartDay') return rep.chartDay;
    if (k in rep.query) return rep.query[k];
    const m = k.match(/^(installs|revenue)(Kind|Low|Mid|High|Ceiling)$/);
    if (m) return r[m[1]][m[2][0].toLowerCase() + m[2].slice(1)];
    return r[k];
  };
  return [CSV_COLUMNS.join(','), ...rep.data.map((r) => CSV_COLUMNS.map((k) => csvCell(val(r, k))).join(','))].join('\n');
}

export function toChat(rep, d = null, top = 5) {
  const lines = [`*${title(rep)}*, chart day ${rep.chartDay ?? '?'}`];
  for (const r of rep.data.slice(0, top)) lines.push(`${r.rank}. ${r.name} ${moveText(r, rep.previousDay)} ${appLink(r)}`);
  const g = gainers(rep, 3);
  if (g.length) lines.push('climbers: ' + g.map((r) => `${r.name} ▲${r.movement} to #${r.rank}`).join(', '));
  if (d && !d.mismatch) lines.push(`since last run: entered ${d.entered.length ? d.entered.map((r) => `${r.name} #${r.rank}`).join(', ') : 'none'}; left ${d.left.length ? d.left.map((r) => r.name).join(', ') : 'none'}`);
  const cb = rep.findings.climbingAndBuying;
  if (cb.length) lines.push('climbing and buying ads: ' + cb.slice(0, 3).map((a) => a.name).join(', '));
  return lines.join('\n');
}
