---
name: aactl
description: Use the aactl CLI to pull Artificial Analysis LLM benchmark data and compare models by intelligence index, output speed, latency, and price. Trigger on Artificial Analysis, artificialanalysis.ai, model comparison, cheapest model, fastest model, intelligence index, tokens per second, LLM pricing.
---

# aactl

Terminal access to Artificial Analysis model data: intelligence/coding/math indexes, output tokens/s, time to first token, and $/M token pricing for ~600 LLM variants.

## Quick start

Key must be configured once (`aactl doctor` tells you if it is):

```bash
printf "$AA_KEY" | aactl cfg set apiKey -
aactl doctor
```

```bash
aactl ls -s cost --min intelligence=60 -n 10       # cheapest models with index >= 60
aactl cmp claude-fable-5-1 gpt-5-6-sol grok-4-6 --json
aactl show gemini-3-8-flash
```

## Commands

- `ls|list` — table of models. `-s <metric>[:asc|desc]`, `-n <limit>`, `-c <creator...>`, `--search <text>`, `--min k=v...`, `--max k=v...`, `--columns <keys|all>`, `--all` (include rows missing data), `--wide`, `--full` (JSON: all benchmark scores).
- `cmp|compare [models...]` — side-by-side. `-u <url>` reads the `models=` param from an artificialanalysis.ai URL. Same `-s/--columns/--wide/--full`.
- `show <model>` — one model, every benchmark.
- `cfg|config path|ls|get|set|unset|import|export` — config; `apiKey` accepts stdin only.
- `doctor|check` — readiness (key, API reachability, cache). `--no-network` skips the probe.
- `skill` — prints this skill's install URL.

Model arguments: slug (`claude-opus-5`), exact name, or substring. Ambiguous substrings resolve to the base variant if one slug prefixes the others; otherwise the CLI warns and lists candidates.

## Metrics

`intelligence`, `coding`, `math`, `speed` (tok/s), `ttft` (s), `ttfa` (s, includes reasoning), `cost` (blended 3:1 $/M), `costIn`, `costOut`. Sorting defaults to better-first per metric.

## Global flags

- `--json` — one JSON object; errors also JSON (`{"error":{"message","exitCode"}}`).
- `--plain` — tab-separated, slug first, raw numbers, empty for missing.
- `--refresh` / `--offline` — bypass or force the 1h cache.
- `-q` / `-v`.

## Common errors

| exit | cause | fix |
| ---- | ----- | --- |
| 1 | no API key / generic | `printf key \| aactl cfg set apiKey -` |
| 2 | bad flag, unknown metric, no model matched | check `--help`, use fuller slug |
| 3 | HTTP 401/403 | regenerate key at artificialanalysis.ai/api |
| 4 | HTTP 429 | wait; cached data still works with `--offline` |
| 5 | network failure | retry, check `--endpoint` |
