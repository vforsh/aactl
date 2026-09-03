import pc from "picocolors";
import { METRICS, type MetricKey, type Model } from "./models.ts";

export interface OutputMode {
  json: boolean;
  plain: boolean;
  quiet: boolean;
  verbose: boolean;
}

export function log(mode: OutputMode, msg: string): void {
  if (mode.verbose) process.stderr.write(`${pc.dim(msg)}\n`);
}

export function warn(mode: OutputMode, msg: string): void {
  if (!mode.quiet) process.stderr.write(`${pc.yellow("warn:")} ${msg}\n`);
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export const DEFAULT_COLUMNS: MetricKey[] = ["intelligence", "speed", "ttft", "cost"];

export function cell(m: Model, key: MetricKey): string {
  const v = m[key];
  return v === null ? "—" : METRICS[key].fmt(v);
}

const MAX_NAME = 56;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function renderTable(models: Model[], columns: MetricKey[], opts: { color: boolean; rank?: boolean; wide?: boolean }): string {
  const header = [...(opts.rank ? ["#"] : []), "Model", "Creator", ...columns.map((c) => METRICS[c].label)];
  const name = (m: Model) => (opts.wide ? m.name : truncate(m.name, MAX_NAME));
  const rows = models.map((m, i) => [...(opts.rank ? [String(i + 1)] : []), name(m), m.creator, ...columns.map((c) => cell(m, c))]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const numericFrom = (opts.rank ? 3 : 2);
  const fmtRow = (r: string[], isHeader: boolean) =>
    r
      .map((c, i) => {
        const w = widths[i] ?? c.length;
        const padded = i >= numericFrom || (opts.rank && i === 0) ? c.padStart(w) : c.padEnd(w);
        return isHeader && opts.color ? pc.bold(padded) : padded;
      })
      .join("  ");
  const lines = [fmtRow(header, true), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map((r) => fmtRow(r, false))];
  return lines.join("\n");
}

export function renderPlain(models: Model[], columns: MetricKey[]): string {
  return models.map((m) => [m.slug, ...columns.map((c) => (m[c] === null ? "" : String(m[c])))].join("\t")).join("\n");
}

export function toJsonRow(m: Model, full = false): Record<string, unknown> {
  const { evaluations, ...rest } = m;
  return full ? { ...rest, evaluations } : rest;
}
