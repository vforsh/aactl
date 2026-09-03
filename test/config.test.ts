import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPath, parseValue, readConfigFile, redact, resolveConfig, writeConfigFile } from "../src/lib/config.ts";

process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "aactl-test-"));

describe("config", () => {
  test("path respects XDG_CONFIG_HOME", () => {
    expect(configPath()).toBe(join(process.env.XDG_CONFIG_HOME!, "aactl", "config.json"));
  });
  test("round-trip and precedence env > file > default", async () => {
    expect(await readConfigFile()).toEqual({});
    await writeConfigFile({ apiKey: "aa_secret_value_1234", retries: 5 });
    process.env.AA_RETRIES = "7";
    const r = await resolveConfig();
    expect(r.retries).toBe(7);
    expect(r.sources.retries).toBe("env");
    expect(r.sources.apiKey).toBe("file");
    expect(r.sources.endpoint).toBe("default");
    delete process.env.AA_RETRIES;
  });
  test("parseValue validates ints and keys", () => {
    expect(parseValue("timeout", "5000")).toBe(5000);
    expect(() => parseValue("timeout", "x")).toThrow(/integer/);
    expect(() => parseValue("nope", "1")).toThrow(/unknown config key/);
  });
  test("redact hides secrets only", () => {
    expect(redact("apiKey", "aa_secret_value_1234")).toBe("aa_s…1234");
    expect(redact("endpoint", "https://x")).toBe("https://x");
  });
});
