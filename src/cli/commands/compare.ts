import type { Command } from "commander";
import { UsageError } from "../../lib/errors.ts";
import { parseSort, resolveModels, slugsFromUrl, sortModels } from "../../lib/models.ts";
import { printJson, renderPlain, renderTable, toJsonRow, warn } from "../../lib/output.ts";
import { loadForCommand, parseColumns, useColor } from "./_shared.ts";

export function registerCompare(program: Command): void {
  program
    .command("compare [models...]")
    .alias("cmp")
    .description("side-by-side comparison of named models (slug, name, or unique substring)")
    .option("-u, --url <url>", "artificialanalysis.ai URL; takes its models= parameter")
    .option("-s, --sort <spec>", "sort metric (default: keep given order)")
    .option("--columns <keys>", "comma-separated metrics or 'all'")
    .option("--wide", "do not truncate long model names")
    .option("--full", "with --json: include all available evaluation scores (individual benchmarks require Pro)")
    .action(async (queries: string[], opts, cmd: Command) => {
      const wanted = [...(opts.url ? slugsFromUrl(opts.url) : []), ...queries];
      if (wanted.length === 0) throw new UsageError("give at least one model or --url");
      const { g, models, source, fetchedAt, tier, intelligenceIndexVersion } = await loadForCommand(cmd);
      const { found, missing } = resolveModels(models, wanted);
      for (const m of missing) warn(g, `not found: ${m}`);
      if (found.length === 0) throw new UsageError("no models matched");
      const rows = opts.sort ? sortModels(found, parseSort(opts.sort)) : found;
      const columns = parseColumns(opts.columns);

      if (g.json) {
        printJson({ source, fetchedAt, tier, intelligenceIndexVersion, missing, models: rows.map((m) => toJsonRow(m, Boolean(opts.full))) });
      } else if (g.plain) {
        process.stdout.write(`${renderPlain(rows, columns)}\n`);
      } else {
        process.stdout.write(`${renderTable(rows, columns, { color: useColor(g), wide: Boolean(opts.wide) })}\n`);
      }
    });
}
