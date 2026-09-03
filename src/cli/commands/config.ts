import type { Command } from "commander";
import {
  CONFIG_KEYS,
  ConfigSchema,
  SECRET_KEYS,
  assertKey,
  configPath,
  parseValue,
  readConfigFile,
  redact,
  resolveConfig,
  writeConfigFile,
  type Config,
} from "../../lib/config.ts";
import { UsageError } from "../../lib/errors.ts";
import { printJson } from "../../lib/output.ts";
import { globalOpts } from "../program.ts";

async function readStdin(): Promise<string> {
  const text = await Bun.stdin.text();
  return text.replace(/\r?\n$/, "");
}

export function registerConfig(program: Command): void {
  const cfg = program.command("config").alias("cfg").description("manage ~/.config/aactl/config.json (env AA_* overrides file)");

  cfg
    .command("path")
    .description("print config file path")
    .action(() => {
      process.stdout.write(`${configPath()}\n`);
    });

  cfg
    .command("list")
    .alias("ls")
    .description("show effective config with sources (secrets redacted)")
    .action(async (_o, cmd: Command) => {
      const g = globalOpts(cmd);
      const r = await resolveConfig();
      const { sources, ...values } = r;
      if (g.json) {
        printJson({ path: configPath(), values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, redact(k, v)])), sources });
        return;
      }
      for (const k of CONFIG_KEYS) {
        const v = values[k];
        const line = `${k}=${v === undefined ? "" : String(redact(k, v))}`;
        process.stdout.write(g.plain ? `${line}\n` : `${line}  (${sources[k]})\n`);
      }
    });

  cfg
    .command("get <keys...>")
    .description("print one or more effective values (secrets redacted unless --reveal)")
    .option("--reveal", "print secret values in full")
    .action(async (keys: string[], opts, cmd: Command) => {
      const g = globalOpts(cmd);
      const r = await resolveConfig();
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        assertKey(k);
        const v = r[k];
        out[k] = opts.reveal ? v : redact(k, v);
      }
      if (g.json) return printJson(out);
      for (const k of keys) process.stdout.write(keys.length > 1 ? `${k}=${out[k] ?? ""}\n` : `${out[k] ?? ""}\n`);
    });

  cfg
    .command("set <pairs...>")
    .description("set values: `set key value`, `set key -` (stdin), or `set k1=v1 k2=v2`. Secrets (apiKey) accept only stdin")
    .action(async (pairs: string[]) => {
      const file = await readConfigFile();
      const updates: [string, string][] = [];
      if (pairs.length === 2 && !pairs[0]!.includes("=")) {
        updates.push([pairs[0]!, pairs[1]!]);
      } else {
        for (const p of pairs) {
          const i = p.indexOf("=");
          if (i < 0) throw new UsageError(`expected key=value or "key value", got "${p}"`);
          updates.push([p.slice(0, i), p.slice(i + 1)]);
        }
      }
      for (const [k, v] of updates) {
        assertKey(k);
        let value = v;
        if (v === "-") value = await readStdin();
        else if (SECRET_KEYS.has(k)) throw new UsageError(`${k} is secret; pipe it: printf "<value>" | aactl cfg set ${k} -`);
        if (!value) throw new UsageError(`empty value for ${k}`);
        (file as Record<string, unknown>)[k] = parseValue(k, value);
      }
      await writeConfigFile(file);
      process.stderr.write(`updated ${updates.map(([k]) => k).join(", ")}\n`);
    });

  cfg
    .command("unset <keys...>")
    .description("remove keys from the config file")
    .action(async (keys: string[]) => {
      const file = await readConfigFile();
      for (const k of keys) {
        assertKey(k);
        delete file[k];
      }
      await writeConfigFile(file);
      process.stderr.write(`removed ${keys.join(", ")}\n`);
    });

  cfg
    .command("import")
    .description("replace config file with JSON from stdin (idempotent machine setup)")
    .option("--merge", "merge into existing file instead of replacing")
    .action(async (opts) => {
      const raw = await readStdin();
      let parsed: Config;
      try {
        parsed = ConfigSchema.parse(JSON.parse(raw));
      } catch (err) {
        throw new UsageError(`invalid config JSON: ${(err as Error).message}`);
      }
      const next = opts.merge ? { ...(await readConfigFile()), ...parsed } : parsed;
      await writeConfigFile(next);
      process.stderr.write(`imported ${Object.keys(parsed).length} keys\n`);
    });

  cfg
    .command("export")
    .description("print effective config as JSON (secrets included; for machine round-trips)")
    .action(async () => {
      const { sources: _s, ...values } = await resolveConfig();
      printJson(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)));
    });
}
