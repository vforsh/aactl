import { access, constants, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { languageModelsUrl } from "../../lib/api.ts";
import { cachePath, configPath, readConfigFile, resolveConfig } from "../../lib/config.ts";
import { printJson } from "../../lib/output.ts";
import { globalOpts } from "../program.ts";

type Status = "OK" | "WARN" | "FAIL";
interface Check {
  name: string;
  status: Status;
  detail: string;
  hint?: string;
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .alias("check")
    .description("read-only readiness check: runtime, config, key, API reachability, cache")
    .option("--no-network", "skip the API probe")
    .action(async (opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const checks: Check[] = [];

      checks.push({ name: "bun", status: "OK", detail: `Bun ${Bun.version}` });

      try {
        await readConfigFile();
        checks.push({ name: "config", status: "OK", detail: configPath() });
      } catch (err) {
        checks.push({ name: "config", status: "FAIL", detail: (err as Error).message, hint: "fix or delete the config file" });
      }

      const cfg = await resolveConfig().catch(() => null);
      if (!cfg) {
        checks.push({ name: "apiKey", status: "FAIL", detail: "config unreadable" });
      } else if (!cfg.apiKey) {
        checks.push({ name: "apiKey", status: "FAIL", detail: "not set", hint: 'printf "<key>" | aactl cfg set apiKey -  (free key: https://artificialanalysis.ai/api)' });
      } else {
        checks.push({ name: "apiKey", status: "OK", detail: `set via ${cfg.sources.apiKey}` });
      }

      if (cfg && opts.network !== false) {
        const url = languageModelsUrl(cfg.endpoint);
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), Math.min(cfg.timeout, 10_000));
        try {
          const res = await fetch(url, { headers: cfg.apiKey ? { "x-api-key": cfg.apiKey } : {}, signal: ctl.signal });
          if (res.ok) checks.push({ name: "api", status: "OK", detail: `HTTP ${res.status} ${url}` });
          else if (res.status === 401) checks.push({ name: "api", status: "FAIL", detail: "HTTP 401: key rejected", hint: "check key at https://artificialanalysis.ai/api" });
          else if (res.status === 403) checks.push({ name: "api", status: "FAIL", detail: "HTTP 403: access denied", hint: "check the key's organization and API subscription" });
          else if (res.status === 429) checks.push({ name: "api", status: "WARN", detail: "HTTP 429 rate limited", hint: "cache still works; retry later" });
          else checks.push({ name: "api", status: "FAIL", detail: `HTTP ${res.status}` });
        } catch (err) {
          checks.push({ name: "api", status: "FAIL", detail: `unreachable: ${(err as Error).message}` });
        } finally {
          clearTimeout(t);
        }
      }

      const cache = cachePath();
      try {
        const s = await stat(cache);
        const age = Math.round((Date.now() - s.mtimeMs) / 1000);
        checks.push({ name: "cache", status: "OK", detail: `${cache} (${age}s old, ${Math.round(s.size / 1024)} KiB)` });
      } catch {
        try {
          await access(dirname(dirname(cache)), constants.W_OK);
          checks.push({ name: "cache", status: "WARN", detail: "no cache yet", hint: "first `aactl list` will populate it" });
        } catch {
          checks.push({ name: "cache", status: "FAIL", detail: `cannot write ${dirname(cache)}` });
        }
      }

      const overall: Status = checks.some((c) => c.status === "FAIL") ? "FAIL" : checks.some((c) => c.status === "WARN") ? "WARN" : "OK";
      if (g.json) printJson({ status: overall, checks });
      else if (g.plain) for (const c of checks) process.stdout.write(`${c.status}\t${c.name}\t${c.detail}\n`);
      else {
        const paint = (s: Status) => (s === "OK" ? pc.green(s) : s === "WARN" ? pc.yellow(s) : pc.red(s));
        for (const c of checks) process.stdout.write(`${paint(c.status).padEnd(4)} ${c.name.padEnd(8)} ${c.detail}${c.hint ? pc.dim(`  → ${c.hint}`) : ""}\n`);
        process.stdout.write(`\n${paint(overall)}\n`);
      }
      if (overall === "FAIL") process.exit(1);
    });
}
