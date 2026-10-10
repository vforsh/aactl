import type { Command } from "commander";
import { filterModels, parseBounds, parseSort, sortModels } from "../../lib/models.ts";
import { printJson, renderPlain, renderTable, toJsonRow } from "../../lib/output.ts";
import { loadForCommand, parseColumns, useColor } from "./_shared.ts";

export function registerList(program: Command): void {
  program
    .command("list")
    .alias("ls")
    .description("list models with intelligence/speed/cost, filterable and sortable")
    .option("-s, --sort <spec>", "metric to sort by: intelligence|coding|math|agentic|speed|ttft|ttfa|cost|costIn|costOut|costTask|value|cacheHit, optional :asc|:desc", "intelligence")
    .option("-n, --limit <n>", "max rows", (v) => Number(v), 30)
    .option("-c, --creator <names...>", "filter by creator slug/name (e.g. openai anthropic)")
    .option("--search <text>", "substring match on name/slug")
    .option("--min <key=value...>", "lower bound, e.g. --min intelligence=60 speed=100")
    .option("--max <key=value...>", "upper bound, e.g. --max cost=2")
    .option("--columns <keys>", "comma-separated metrics or 'all' (default: intelligence,speed,ttft,cost,costTask,value)")
    .option("--all", "include models missing intelligence/speed/cost data")
    .option("--wide", "do not truncate long model names")
    .option("--full", "with --json: include all available evaluation scores (individual benchmarks require Pro)")
    .action(async (opts, cmd: Command) => {
      const { g, models, source, fetchedAt, tier, intelligenceIndexVersion } = await loadForCommand(cmd);
      const sort = parseSort(opts.sort);
      const columns = parseColumns(opts.columns);
      const filtered = filterModels(models, {
        creator: opts.creator,
        search: opts.search,
        min: parseBounds(opts.min),
        max: parseBounds(opts.max),
        requireAll: !opts.all,
      });
      const rows = sortModels(filtered, sort).slice(0, opts.limit > 0 ? opts.limit : undefined);

      if (g.json) {
        printJson({ source, fetchedAt, tier, intelligenceIndexVersion, total: filtered.length, shown: rows.length, sort, models: rows.map((m) => toJsonRow(m, Boolean(opts.full))) });
      } else if (g.plain) {
        process.stdout.write(`${renderPlain(rows, columns)}\n`);
      } else {
        process.stdout.write(`${renderTable(rows, columns, { color: useColor(g), rank: true, wide: Boolean(opts.wide) })}\n`);
        if (!g.quiet) process.stderr.write(`${rows.length}/${filtered.length} models · sorted by ${sort.key} ${sort.desc ? "desc" : "asc"} · ${source} ${fetchedAt}\n`);
      }
    });
}
