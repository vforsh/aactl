# aactl

CLI for [Artificial Analysis](https://artificialanalysis.ai) LLM data. Compare models by intelligence, speed, and cost from the terminal instead of squinting at scatter plots.

## Install

```bash
git clone https://github.com/vforsh/aactl.git ~/dev/aactl
cd ~/dev/aactl && bun install && bun link
```

## Auth

Get a free key at <https://artificialanalysis.ai/api>, then pipe it in (never pass secrets as argv):

```bash
printf "aa_..." | aactl cfg set apiKey -
aactl doctor
```

`AA_API_KEY` env var overrides the config file.

## Usage

```bash
aactl ls                                   # top 30 by intelligence index
aactl ls -s cost --min intelligence=60     # cheapest models scoring 60+
aactl ls -s value --min intelligence=55    # best intelligence per dollar actually spent
aactl ls -s speed -c openai anthropic -n 10
aactl ls --columns all --wide              # every headline metric, untruncated names
aactl cmp claude-fable-5-1 gpt-5-6-sol grok-4-6 -s cost
aactl cmp --url "https://artificialanalysis.ai/models?models=a%2Cb%2Cc"   # paste a site URL
aactl show claude-opus-5                   # every benchmark score
aactl ls --json | jq '.models[] | select(.speed > 200) | .slug'
```

Model arguments accept a slug, an exact name, or a substring. An ambiguous substring resolves to the base variant when one slug prefixes the rest (`opus-5` → `claude-opus-5`).

### Metrics

| key            | meaning                                          |
| -------------- | ------------------------------------------------ |
| `intelligence` | Artificial Analysis Intelligence Index           |
| `coding`       | Artificial Analysis Coding Index                 |
| `math`         | Artificial Analysis Math Index                   |
| `speed`        | median output tokens/s                           |
| `ttft`         | median time to first token, seconds              |
| `ttfa`         | median time to first answer token (incl. reasoning) |
| `cost`         | blended $/M tokens, 3:1 input:output             |
| `costIn`       | $/M input tokens                                 |
| `costOut`      | $/M output tokens                                |
| `costTask`     | $ per Intelligence Index task, from tokens the model actually burned (reasoning included) |
| `value`        | `intelligence / costTask`: index points per dollar |
| `agentic`      | Artificial Analysis Agentic Index                |
| `cacheHit`     | $/M cached input tokens                          |

`costTask` is the honest cost axis: a verbose reasoner with cheap tokens can cost more per task than a terse expensive one. `show` additionally prints cache-write pricing and the total dollars to run the full index suite.

Sort specs: `cost` (better first), `cost:desc`, `-speed` (worse first).

### Cache

Data comes from two feeds merged by slug: `/data/llms/models` (full benchmark set) and the paginated `/language/models/free` (per-task cost, cache pricing, agentic index). One refresh is about five requests. Responses are cached at `~/.cache/aactl/models.json` for `cacheTtl` seconds (default 3600). `--refresh` refetches, `--offline` never hits the network. The free tier allows 100 requests per day on the language feed.

## Global flags

`--json` (single JSON object on stdout), `--plain` (tab-separated, slug first), `-q`, `-v`, `--refresh`, `--offline`.

## Config

```bash
aactl cfg ls                      # effective config with sources, secrets redacted
aactl cfg set cacheTtl=600 retries=3
aactl cfg get endpoint cacheTtl
aactl cfg export | aactl cfg import   # machine round-trip
```

Keys: `apiKey`, `endpoint`, `timeout`, `retries`, `cacheTtl`. Env: `AA_API_KEY`, `AA_ENDPOINT`, `AA_TIMEOUT`, `AA_RETRIES`, `AA_CACHE_TTL`.

## Exit codes

| code | meaning                    |
| ---- | -------------------------- |
| 0    | ok                         |
| 1    | generic failure / doctor FAIL |
| 2    | usage error                |
| 3    | API key rejected           |
| 4    | rate limited               |
| 5    | network failure after retries |

## Development

```bash
bun run typecheck && bun test
```
