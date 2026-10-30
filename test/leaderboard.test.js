import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toReport, pickChart, diff, toCsv, toMarkdown, toChat, estimateText, moveText, gainers } from '../leaderboard.js';

const ex = JSON.parse(readFileSync(new URL('../examples/leaderboard.json', import.meta.url), 'utf8'));
const prev = JSON.parse(readFileSync(new URL('../examples/previous.json', import.meta.url), 'utf8'));

test('picks the category chart, or an overall chart when asked', () => {
  assert.equal(pickChart(ex).query.categoryId, '6013');
  assert.equal(pickChart(ex, { categoryId: 'all', chartType: 'grossing' }).query.chartType, 'grossing');
  assert.throws(() => pickChart(ex, { categoryId: '6014' }), /holds category 6013/);
  assert.equal(pickChart({ ...ex, viewChart: null }, { chartType: 'paid' }).query.chartType, 'paid');
});

test('joins signals by storeId and keeps "not collected" empty, never zero', () => {
  const rep = toReport(ex);
  assert.equal(rep.query.chartType, 'free');
  assert.equal(rep.categoryName, 'Health & Fitness');
  const top = rep.data[0];
  assert.equal(top.liveAds, 48);
  assert.equal(top.adsStartedLast7Days, 6);
  assert.equal(top.keywordsTop10, 41);
  const step = rep.data[1];
  assert.equal(step.liveAds, null); // paid: null in signals
  assert.equal(rep.data[4].keywordsTop10, null); // no signals row at all
});

test('estimates: range, below floor and missing', () => {
  const rep = toReport(ex);
  assert.equal(estimateText(rep.data[0].installs), '400k–1.6M');
  assert.equal(estimateText(rep.data[4].revenue, '$'), '< $5k');
  assert.equal(estimateText(rep.data[7].installs), '');
  const csv = toCsv(rep).split('\n');
  assert.ok(csv[5].includes(',below_floor,,,,5000,'));
});

test('moves: up, down, flat, new on the chart', () => {
  const rep = toReport(ex);
  assert.equal(moveText(rep.data[2], rep.previousDay), '▲6');
  assert.equal(moveText(rep.data[1], rep.previousDay), '▼1');
  assert.equal(moveText(rep.data[4], rep.previousDay), '=');
  assert.equal(moveText(rep.data[7], rep.previousDay), 'new');
  assert.equal(moveText(rep.data[7], null), '');
  assert.deepEqual(gainers(rep, 2).map((r) => r.name), ['Example Fasting Timer', 'Example Water Log']);
});

test('diff against your last saved run of the same chart', () => {
  const rep = toReport(ex);
  const d = diff(rep, prev);
  assert.equal(d.since, '2026-10-22');
  assert.deepEqual(d.entered.map((r) => r.name), ['Example Run Coach']);
  assert.deepEqual(d.left.map((r) => r.name), ['Example Habit Garden']);
  assert.equal(d.moved[0].name, 'Example Water Log');
  assert.equal(d.moved[0].sinceLastRun, 13);
  const other = diff(toReport(ex, { categoryId: 'all', chartType: 'paid' }), prev);
  assert.match(other.mismatch, /us\/6013\/free vs us\/all\/paid/);
});

test('saved reports pass through, and output mentions findings', () => {
  const rep = toReport(ex);
  const saved = JSON.parse(JSON.stringify(rep));
  assert.equal(toReport(saved), saved);
  const md = toMarkdown(rep, diff(rep, prev), 5);
  assert.match(md, /Climbing and buying ads \(climbingAndBuying\): 1/);
  assert.match(md, /…5 more rows/);
  assert.match(toChat(rep), /climbing and buying ads: Example Fasting Timer/);
});
