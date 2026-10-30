# app-market-leaderboard-snapshot

A daily snapshot of one App Store top chart: free, paid or grossing, overall or one category, in any covered storefront. For each app you get the rank and its move since the previous chart day, rating, monthly download and revenue estimate ranges, live paid ads and how many App Store searches it ranks top 10 for. Run it every day with `--state` and it tells you which apps entered or left the chart since your last run and which moved most. It also prints the market findings that come with the same response: apps climbing while buying ads, new chart entrants, apps buying ads without charting, and viral apps that are not buying ads. Output is Markdown, CSV or JSON, and it can post a short summary to Slack or Discord.

Use it to keep a dated history of your category's chart, to spot a new rival the day it enters, or to feed a spreadsheet.

Node 18+, no dependencies. There is also a [browser version](https://fdarkaou.github.io/app-market-leaderboard-snapshot/) that renders a pasted response, lets you switch between the charts in it, and never sends it anywhere.

```
## App Store top free, Health & Fitness, US

Chart day 2026-10-29 (compared with 2026-10-28). 10 ranked apps in this response.

Gainers 3, losers 5, new entrants 1, new releases 1.

Since your last run (chart day 2026-10-22): 1 entered, 1 left. Entered: Example Run Coach (#8). Left: Example Habit Garden (was #8). Biggest moves: Example Water Log +13, Example Fasting Timer +11, Example Yoga Daily -3, Example Macro Counter -3, Example Period Diary -3.

Top climbers since the previous chart day: Example Fasting Timer ▲6 to #3, Example Water Log ▲6 to #6, Example Calorie Tracker ▲1 to #1.

| # | Move | App | Developer | Category | Rating (ratings) | Downloads / mo est. | Revenue / mo est. | Live ads (+7d) | Top-10 searches |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| 1 | ▲1 | [Example Calorie Tracker](https://apps.apple.com/app/id1000000100) | Example Labs | Health & Fitness | 4.7 (51.3k) | 400k–1.6M | $900k–$3.6M | 48 (+6) | 41 |
| 2 | ▼1 | [Example Step Counter](https://apps.apple.com/app/id1000000101) | Walk Co | Health & Fitness | 4.8 (128k) | 350k–1.4M | $120k–$500k |  | 30 |
| 3 | ▲6 | [Example Fasting Timer](https://apps.apple.com/app/id1000000102) | Fast Apps | Health & Fitness | 4.6 (22.1k) | 150k–620k | $200k–$820k | 31 (+9) | 12 |
| 4 | ▼1 | [Example Home Workout](https://apps.apple.com/app/id1000000103) | Gym Pocket | Health & Fitness | 4.5 (88k) | 120k–500k | $300k–$1.2M | 5 (+0) | 18 |
| 5 | = | [Example Sleep Sounds](https://apps.apple.com/app/id1000000104) | Night Owl Ltd | Health & Fitness | 4.4 (40.2k) | 90k–360k | < $5k |  |  |
| 6 | ▲6 | [Example Water Log](https://apps.apple.com/app/id1000000105) | Drop Studio | Health & Fitness | 4.3 (9.1k) | 60k–240k | < $5k |  | 4 |
...
```

(Example data from `examples/leaderboard.json`, not real apps.)

## Where the data comes from

The data comes from [PeekPanda](https://peekpanda.com), an iOS competitor catalogue that keeps dated App Store evidence for each app. The tool makes one call to [`GET /v1/market/leaderboard`](https://peekpanda.com/docs/market-leaderboard) with `country`, `categoryId` and `chartType`. That one response holds the three overall charts (free, paid, grossing), the chart you picked for a category (`viewChart`, null for `categoryId=all`), the market overview and one signals batch for every app shown. Each chart has at most 100 rows. Over MCP the same read is the `get_market` tool with action `leaderboard`. It only reads stored evidence and never starts collection.

You need a PeekPanda account and an API key. Each run is one call against your plan's daily API and MCP allowance; the [plans page](https://peekpanda.com/docs/plans-and-refreshes) lists the allowance per plan.

## Use it

```bash
git clone https://github.com/fdarkaou/app-market-leaderboard-snapshot && cd app-market-leaderboard-snapshot
export PEEKPANDA_TOKEN=...   # API key from Account → API keys. Keep it out of source control.

node cli.js                                              # top free, overall, US
node cli.js --country gb --chart grossing --top 50       # top grossing, overall, UK
node cli.js --category 6013 --chart free                 # top free in Health & Fitness, US
node cli.js --category 6013 --state hf-state.json        # what entered, left and moved since the last run
node cli.js --category 6013 --archive history            # also save history/us-6013-free-<chart day>.json
node cli.js --format csv > chart.csv                     # every row, with estimate low/mid/high columns
node cli.js --category 6013 --webhook "$SLACK_WEBHOOK_URL"   # Discord webhook URLs work too
```

Try it without an account on the bundled example:

```bash
node cli.js --file examples/leaderboard.json                       # the category chart in the response
node cli.js --file examples/leaderboard.json --category all --chart grossing
cp examples/previous.json /tmp/state.json && node cli.js --file examples/leaderboard.json --state /tmp/state.json
npm test
```

Options: `--country` (two lowercase letters, default `us`), `--category all|<Apple category id>` (default `all`), `--chart free|paid|grossing` (default `free`), `--top n` (Markdown rows, default 25), `--state <path>`, `--archive <dir>`, `--format md|csv|json`, `--webhook <url>`, `--file <path>` (a raw response or a saved report), `--tenancy`, `--api`. With `--file`, leave out `--category` to read the chart the response was asked for, or pass `--category all --chart paid` to read one of the overall charts in it. On `429 rate_limited` or `503 timeout` with a short `Retry-After` it waits and retries once; on `daily_call_limit` it stops.

## Ask an assistant instead

If your assistant is connected to the PeekPanda MCP server (`https://mcp.peekpanda.com/mcp`, OAuth sign-in or an API key), ask it to call `get_market` with:

```json
{ "request": { "action": "leaderboard", "query": { "country": "us", "categoryId": "6013", "chartType": "free" } } }
```

Then paste the result into the browser version, or save it and run `node cli.js --file`. The [MCP get started page](https://peekpanda.com/docs/mcp) shows how to connect.

## How to read it

- Ranks are dated public App Store chart observations. "Move" compares with the preceding stored chart day; "new" means the app was not on that day's chart. A move says the position changed, not why. See [leaderboards](https://peekpanda.com/docs/leaderboards).
- Grossing rank is a relative position, not a revenue amount.
- Download and revenue figures are PeekPanda monthly worldwide estimates, not measured results. `< $5k` means below the estimate floor. An empty cell means there is no estimate, not zero.
- Paid ads are collected per chosen app, so an empty ads cell means ads were not collected for that app, not that it runs none. `(+n)` is ads that started in the last 7 UTC days.
- "Top-10 searches" counts App Store searches where the app was observed in the top 10 results. It is a count of positions, not search volume.
- With `--state`, "entered" and "left" compare with your own last saved run of the same storefront, category and chart type, which may be more than one day ago.

## Daily snapshot in GitHub Actions

`.github/workflows/daily-leaderboard.yml` is an example job that runs every morning, keeps the last snapshot in the Actions cache, writes the report to the run summary, posts what changed to a webhook and saves the CSV and the dated JSON as an artifact. Add `PEEKPANDA_TOKEN` and `LEADERBOARD_WEBHOOK_URL` as repository secrets, set the repository variable `ENABLE_LEADERBOARD` to `true`, and set your own storefront, category and chart type in the file.

## License

MIT
