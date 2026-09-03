import { Command } from "commander";
import pkg from "../../package.json";
import { registerCompare } from "./commands/compare.ts";
import { registerConfig } from "./commands/config.ts";
import { registerDoctor } from "./commands/doctor.ts";
import { registerList } from "./commands/list.ts";
import { registerShow } from "./commands/show.ts";
import { registerSkill } from "./commands/skill.ts";
import type { OutputMode } from "../lib/output.ts";

export interface GlobalOpts extends OutputMode {
  refresh: boolean;
  offline: boolean;
}

export function globalOpts(cmd: Command): GlobalOpts {
  const o = cmd.optsWithGlobals() as Partial<GlobalOpts>;
  return {
    json: Boolean(o.json),
    plain: Boolean(o.plain),
    quiet: Boolean(o.quiet),
    verbose: Boolean(o.verbose),
    refresh: Boolean(o.refresh),
    offline: Boolean(o.offline),
  };
}

export function buildProgram(): Command {
  const program = new Command()
    .name("aactl")
    .description("Artificial Analysis LLM data: compare models by intelligence, speed, and cost")
    .version(pkg.version)
    .option("--json", "machine-readable JSON output")
    .option("--plain", "stable tab-separated lines")
    .option("-q, --quiet", "suppress warnings")
    .option("-v, --verbose", "diagnostics to stderr")
    .option("--refresh", "bypass cache and refetch from API")
    .option("--offline", "use cache only, never hit the network")
    .showHelpAfterError()
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });

  registerList(program);
  registerCompare(program);
  registerShow(program);
  registerConfig(program);
  registerDoctor(program);
  registerSkill(program);
  return program;
}
