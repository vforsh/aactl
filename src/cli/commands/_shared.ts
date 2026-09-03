import type { Command } from "commander";
import { loadModels } from "../../lib/api.ts";
import { METRIC_KEYS, assertMetric, type MetricKey } from "../../lib/models.ts";
import { DEFAULT_COLUMNS, log } from "../../lib/output.ts";
import { globalOpts, type GlobalOpts } from "../program.ts";

export async function loadForCommand(cmd: Command) {
  const g = globalOpts(cmd);
  const loaded = await loadModels({ refresh: g.refresh, offline: g.offline, log: (m) => log(g, m) });
  return { g, ...loaded };
}

export function parseColumns(spec: string | undefined): MetricKey[] {
  if (!spec) return DEFAULT_COLUMNS;
  if (spec === "all") return METRIC_KEYS;
  return spec.split(",").map((c) => {
    const k = c.trim();
    assertMetric(k);
    return k;
  });
}

export function useColor(g: GlobalOpts): boolean {
  return !g.plain && !g.json && process.stdout.isTTY === true && !process.env.NO_COLOR;
}
