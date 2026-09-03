import type { Command } from "commander";
import pc from "picocolors";
import { UsageError } from "../../lib/errors.ts";
import { METRICS, METRIC_KEYS, resolveModels } from "../../lib/models.ts";
import { cell, printJson, toJsonRow } from "../../lib/output.ts";
import { loadForCommand, useColor } from "./_shared.ts";

export function registerShow(program: Command): void {
  program
    .command("show <model>")
    .description("full details for one model, including every benchmark score")
    .action(async (query: string, _opts, cmd: Command) => {
      const { g, models } = await loadForCommand(cmd);
      const { found, missing } = resolveModels(models, [query]);
      const m = found[0];
      if (!m) throw new UsageError(`not found: ${missing[0] ?? query}`);

      if (g.json) {
        printJson(toJsonRow(m, true));
        return;
      }
      if (g.plain) {
        const lines = [
          `slug\t${m.slug}`,
          `name\t${m.name}`,
          `creator\t${m.creatorSlug}`,
          `releaseDate\t${m.releaseDate ?? ""}`,
          ...METRIC_KEYS.map((k) => `${k}\t${m[k] ?? ""}`),
          ...Object.entries(m.evaluations).map(([k, v]) => `eval.${k}\t${v ?? ""}`),
        ];
        process.stdout.write(`${lines.join("\n")}\n`);
        return;
      }

      const color = useColor(g);
      const h = (s: string) => (color ? pc.bold(s) : s);
      const d = (s: string) => (color ? pc.dim(s) : s);
      const out: string[] = [
        `${h(m.name)} ${d(`(${m.slug})`)}`,
        `${m.creator}${m.releaseDate ? d(` · released ${m.releaseDate}`) : ""}`,
        "",
        h("Headline"),
        ...METRIC_KEYS.map((k) => `  ${METRICS[k].label.padEnd(8)} ${cell(m, k).padStart(8)}`),
        "",
        h("Benchmarks"),
        ...Object.entries(m.evaluations)
          .filter(([k]) => !k.startsWith("artificial_analysis_"))
          .map(([k, v]) => `  ${k.padEnd(24)} ${v === null ? d("—") : fmtEval(v).padStart(7)}`),
      ];
      process.stdout.write(`${out.join("\n")}\n`);
    });
}

function fmtEval(v: number): string {
  return v <= 1 ? `${(v * 100).toFixed(1)}%` : v.toFixed(1);
}
