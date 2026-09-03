import { buildProgram } from "./cli/program.ts";
import { CliError } from "./lib/errors.ts";

export async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    const json = argv.includes("--json");
    const exitCode = err instanceof CliError ? err.exitCode : 1;
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      process.stdout.write(`${JSON.stringify({ error: { message, exitCode } })}\n`);
    } else {
      process.stderr.write(`error: ${message}\n`);
    }
    process.exit(exitCode);
  }
}
