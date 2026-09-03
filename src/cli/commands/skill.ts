import type { Command } from "commander";
import { printJson } from "../../lib/output.ts";
import { globalOpts } from "../program.ts";

const SKILL_URL = "https://github.com/vforsh/aactl/tree/main/skill/aactl";

export function registerSkill(program: Command): void {
  program
    .command("skill")
    .description("print the agent skill install location")
    .action((_o, cmd: Command) => {
      const g = globalOpts(cmd);
      if (g.json) return printJson({ url: SKILL_URL, install: `npx skills add ${SKILL_URL}` });
      process.stdout.write(g.plain ? `${SKILL_URL}\n` : `${SKILL_URL}\n\ninstall: npx skills add ${SKILL_URL}\n`);
    });
}
