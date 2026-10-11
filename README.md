# secureframe-cli

Command-line interface for the Secureframe API. It lists and gets cloud resources and sends raw API requests. It is not an official Secureframe product.

## Install

Requires Node.js 22 or newer.

```bash
npm install -g @zakiaziz/secureframe-cli
bun add -g @zakiaziz/secureframe-cli
cd secureframe-cli && bun run build && bun link
```

## Quick start

```bash
secureframe setup
# List the first page of cloud resources as a table.
secureframe cloud-resources list --page-size 25 --format human
# List every AWS cloud resource in one region.
secureframe cloud-resources list --filter 'vendor_name:AWS AND region:us-east-1' --all
# Get one cloud resource with its owner.
secureframe cloud-resources get 6f1c2d3e-8a4b-4c5d-9e0f-1a2b3c4d5e6f --include owner
```

## Commands

### cloud-resources

| Command | Description | Options |
| --- | --- | --- |
| secureframe cloud-resources list | List cloud resources. | --filter QUERY, --include RESOURCE, --relationships, --page-size N, --cursor TOKEN, --all, --max-items N |
| secureframe cloud-resources get CLOUD_RESOURCE_ID | Get one cloud resource. | --include RESOURCE, --relationships |

### setup

| Command | Description | Options |
| --- | --- | --- |
| secureframe setup [NAME] | Create and activate a profile. | --api-key-file PATH, --api-secret-file PATH, --base-url URL, --region REGION, --from-env |

### profiles

| Command | Description | Options |
| --- | --- | --- |
| secureframe profiles list | List saved profiles. | None |
| secureframe profiles get NAME | Get one saved profile with secrets redacted. | None |
| secureframe profiles create NAME | Create a profile without activating it. | --api-key-file PATH, --api-secret-file PATH, --base-url URL, --region REGION |
| secureframe profiles update NAME | Update fields of a profile. | --api-key-file PATH, --api-secret-file PATH, --base-url URL, --region REGION, --clear-base-url, --clear-region |
| secureframe profiles delete NAME | Delete a profile. | None |
| secureframe profiles use NAME | Make a profile the active profile. | None |

### config

| Command | Description | Options |
| --- | --- | --- |
| secureframe config list | List every configuration key. | None |
| secureframe config get KEY | Get one configuration value. | None |
| secureframe config set KEY VALUE | Set one configuration value. | None |
| secureframe config unset KEY | Remove one configuration value. | None |
| secureframe config path | Get the configuration paths. | None |

### auth

| Command | Description | Options |
| --- | --- | --- |
| secureframe auth verify | Verify the API key and API secret. | None |

### api

| Command | Description | Options |
| --- | --- | --- |
| secureframe api request METHOD PATH | Send a raw API request. | --query KEY=VALUE, --file PATH, --yes, --dry-run |

### completions

| Command | Description | Options |
| --- | --- | --- |
| secureframe completions SHELL | Print a shell completion script. | None |

## Global options

| Option | Description |
| --- | --- |
| -h, --help | Show help. Uses no credentials or network. |
| --version | Print the executable name and version. |
| --profile NAME | Select a saved profile. |
| --format FORMAT | Output format. Allowed: json, pretty, human. Default: json. |
| --color WHEN | Color for pretty and human output. Allowed: auto, always, never. Default: auto. |
| -q, --quiet | Suppress progress and notices. Results and errors still print. |
| -v, --verbose | Print redacted diagnostics to stderr. |
| --no-input | Never prompt. Fail when input is missing. |
| --timeout DURATION | Per-request timeout in ms, s, or m, from 1ms to 10m. Default: 30s. |

Network commands (the resource commands, `auth verify`, and `api request`) accept every option except `--version`. Local commands (`setup`, `profiles`, and `config`) accept `--help`, `--format`, `--color`, `--quiet`, `--verbose`, and `--no-input`. `completions` accepts only `--help`. With no command, only `--help`, `--version`, `--verbose`, and `--quiet` apply, and `--version` with a command word fails.

## Authentication

Create an API key in Secureframe Console at **Your Profile > Company settings > API keys**. Secureframe shows the API secret once.

```bash
secureframe setup work --api-key-file ./secureframe-api-key.txt --api-secret-file ./secureframe-api-secret.txt
secureframe auth verify
```

`setup [NAME]` creates a profile (default name: `default`) and makes it the active profile. It fails when the profile exists. If activation fails after the profile is written, the profile stays saved and `setup` exits 8 with `PARTIAL_FAILURE`. In a terminal without `--no-input`, `setup` prompts for a missing API key or API secret with hidden input. Secrets are never command-line values: pass `--api-key-file PATH` and `--api-secret-file PATH` (`-` reads stdin), set `SECUREFRAME_API_KEY` and `SECUREFRAME_API_SECRET`, or enter them at the prompt. `setup --from-env` copies `SECUREFRAME_API_KEY`, `SECUREFRAME_API_SECRET`, `SECUREFRAME_BASE_URL`, and `SECUREFRAME_REGION` into the profile and cannot be combined with `--api-key-file`, `--api-secret-file`, `--base-url`, or `--region`.

| Variable | Purpose |
| --- | --- |
| `SECUREFRAME_PROFILE` | Select a saved profile. |
| `SECUREFRAME_API_KEY` | Secureframe API key. |
| `SECUREFRAME_API_SECRET` | Secureframe API secret. |
| `SECUREFRAME_BASE_URL` | API base URL. Default: `https://api.secureframe.com`. |
| `SECUREFRAME_REGION` | API region, `us` or `uk`. Chooses the base URL. |
| `XDG_CONFIG_HOME` | Configuration root when it is an absolute path. Otherwise `~/.config`. |
| `NO_COLOR` | Disables color with `--color auto` when set and nonempty. |
| `CI` | Disables prompts when nonempty and not `0` or `false`. |

The US API is `https://api.secureframe.com`, the default. For the UK API, set the region to `uk` with `--region` on `setup` or `profiles create|update`, `config set region`, or `SECUREFRAME_REGION`. The region chooses `https://api-uk.secureframe.com`. A base URL from the same source wins over the region.

A `SECUREFRAME_` variable that is set but empty, a malformed `SECUREFRAME_PROFILE`, and an invalid `SECUREFRAME_BASE_URL` fail with `CONFIGURATION_ERROR` and name the variable. None of them falls through to the next source.

Precedence:

1. Profile selection: `--profile`, `SECUREFRAME_PROFILE`, then `activeProfile` in `config.json`. A selected or active profile that does not exist fails with `CONFIGURATION_ERROR`, with no fallback.
2. Credentials: `SECUREFRAME_API_KEY` and `SECUREFRAME_API_SECRET`, then the selected profile. The key and secret come whole from the first source that sets either one. A partial pair fails with `AUTHENTICATION_REQUIRED`.
3. Base URL and region: `SECUREFRAME_BASE_URL` or `SECUREFRAME_REGION`, the selected profile, `baseUrl` or `region` in `config.json`, then the default. Within one source a base URL beats the region.

`secureframe auth verify` sends `GET /cloud_resources?page=1&per_page=1`. Success proves that Secureframe accepted the API key and API secret for that read. The check returns no account identity and does not prove complete permission coverage. Cloud integrations must be connected in Secureframe before `/cloud_resources` returns their inventory.

## Output and errors

The default output format is `json`: one compact, uncolored line on stdout with the envelope `{"data":...,"meta":{...}}`. `--format pretty` prints the same document indented, with syntax highlighting when color applies. `--format human` prints tables for collections and labeled fields for one resource. Errors go to stderr in the selected format. Help, `--version`, and `completions` print plain text.

`data` is an object for one resource, an array for a collection, or `null`, and keeps Secureframe's field names. `meta` is always present. `cloud-resources get` prints the Secureframe response body as `data`: the cloud resource is `data.data`, and related resources requested with `--include` are `data.included`.

| `meta` key | When |
| --- | --- |
| `next_cursor` | Paginated collection reads. A string, or `null` when no page remains. |
| `has_more` | Paginated collection reads. |
| `provider` | Collection metadata from Secureframe: `total` when reported, and `included` when `--include` returns related resources, deduplicated by `type` and `id` across pages. |
| `dry_run`, `validation` | Dry-run previews. `validation` is `local`. |

Errors print one document on stderr, for example `{"error":{"code":"RATE_LIMITED","message":"...","hint":"...","retryable":true,"provider":{"status":429}}}`. Optional keys are `hint`, `outcome` (`unknown` when a mutation may have applied), `provider` (`status`, `code`, `request_id`, `retry_after_seconds`), `details`, and `partial`. `--format human` prints `Error [CODE]: message` and `Hint: ...`.

| Exit | Error codes |
| --- | --- |
| 0 | Success, including empty collections. |
| 1 | `UNEXPECTED_ERROR`, `PROVIDER_ERROR`, `INVALID_RESPONSE`, `UNSUPPORTED_RESPONSE` |
| 2 | `INVALID_ARGUMENT`, `INVALID_REQUEST` |
| 3 | `CONFIGURATION_ERROR`, `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_FAILED` |
| 4 | `PERMISSION_DENIED` |
| 5 | `NOT_FOUND` |
| 6 | `CONFLICT` |
| 7 | `RATE_LIMITED`, `TRANSIENT_FAILURE` |
| 8 | `PARTIAL_FAILURE` |
| 9 | `CONFIRMATION_REQUIRED`, `CONFIRMATION_DECLINED` |
| 130 | `INTERRUPTED` |

IDs are opaque strings. Options accept `--name value` and `--name=value`, and `--` ends options. Unknown commands, options, extra arguments, invalid values, and conflicting options fail with exit code 2 before any request.

Mutations (`api request` with `POST`, `PUT`, `PATCH`, or `DELETE`) need confirmation. The CLI validates arguments first, then resolves credentials (exit 3 when missing), then asks for confirmation. In a terminal, it shows the profile, operation, request, and effect, then prompts. `--yes` confirms without a prompt. With `--no-input`, a non-terminal stdin or stderr, or CI mode, a missing confirmation exits 9. Ctrl-C or end of input at a prompt exits 130 with `INTERRUPTED`. `--dry-run` prints a redacted preview of the request, with headers in the order `Authorization`, `Accept`, `Content-Type`, and sends nothing. It needs no credentials. Preview success does not guarantee that the request succeeds.

Reads make up to 3 attempts on HTTP 429, 500, 502, 503, 504, network errors, and timeouts, waiting 250 ms, then 500 ms, or the `Retry-After` value up to 10 seconds. A `Retry-After` above 10 seconds is not waited on: the command fails with `RATE_LIMITED` and `provider.retry_after_seconds`. Mutations make one attempt. `--timeout` applies to each attempt. `--verbose` writes redacted request, response, and retry diagnostics to stderr.

## Pagination

Secureframe paginates by page number. `cloud-resources list` fetches one page by default. `--page-size` is limited to 100, and the default is 100. Secureframe does not document an ordering, and the CLI never sorts.

`meta.next_cursor` is the next page number as a string, or `null` on the last page. `--cursor TOKEN` resumes from a previous `meta.next_cursor`, with or without `--all`, and is valid only with the same `--page-size`. It must be a page number from 1 to 90071992547408. `--all` follows every page. `--max-items N` (with `--all`) stops after N items and must be a multiple of the page size, so the read stops on a page boundary and `meta.next_cursor` resumes it.

```bash
secureframe cloud-resources list --all --max-items 500 > resources.json
secureframe cloud-resources list --all --cursor "$(jq -r '.meta.next_cursor' resources.json)"
```

A repeated page, a page larger than requested, or a short page before the reported total on the first page fails with `INVALID_RESPONSE` and exit 1. The same failure on a later page exits 8 with `PARTIAL_FAILURE` and `error.details.cause` set to `INVALID_RESPONSE`. Any other failure after at least one page also exits 8. `error.partial.data` holds the items read so far, and `error.partial.next_cursor` is the page to resume from.

## Raw API access

```bash
secureframe api request GET /controls --query per_page=100
secureframe api request PUT /tests/8f2a1c4d-5b6e-4f70-9a8b-0c1d2e3f4a5b --file ./request.json --dry-run
```

Methods: `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH`, `DELETE`. `PATH` starts with a single `/` and has no scheme, host, query string, fragment, whitespace, or `.` and `..` segments. Add query parameters with the repeatable `--query KEY=VALUE`. `--file PATH` sends a JSON body as `application/json` (`-` reads stdin). `--file`, `--yes`, and `--dry-run` are rejected on `GET`, `HEAD`, and `OPTIONS`. The CLI sends the selected credentials in the `Authorization` header only to the configured API origin, and redirects fail. JSON responses print as parsed, other text prints as a JSON string, an empty body prints `null`, and binary responses fail with `UNSUPPORTED_RESPONSE`. Non-2xx responses use the same error mapping as other commands.

## Configuration

Files live in `$XDG_CONFIG_HOME/secureframe` when `XDG_CONFIG_HOME` is an absolute path, and in `~/.config/secureframe` otherwise.

```text
secureframe/
  config.json            {"activeProfile": "work", "baseUrl": "https://...", "region": "uk"}
  profiles/NAME.json     {"apiKey": "...", "apiSecret": "...", "baseUrl": "https://...", "region": "uk"}
```

Keys are camelCase. Files use mode `0600`, directories use mode `0700`, and writes are atomic: the CLI creates a temporary file exclusively with mode `0600` in the same directory, then renames it. Reads reject unknown keys and non-object JSON with `CONFIGURATION_ERROR`. Profile names match `^[A-Za-z0-9._-]+$` and are not `.` or `..`. `config.json` keys: `activeProfile` (read-only through `config`; change it with `profiles use`), `baseUrl`, and `region`. Profile fields: `apiKey`, `apiSecret`, `baseUrl`, and `region`. Secrets are redacted in previews, diagnostics, `profiles get`, and `config list`.

A base URL, from `--base-url`, `config set baseUrl`, `SECUREFRAME_BASE_URL`, or a stored file, must be an `https` URL (`http` only for `localhost`, `127.0.0.1`, or `::1`) with no credentials, query string, fragment, or path. Values are stored unchanged, and requests go to the URL's origin.

Completion scripts come from `secureframe completions bash|zsh|fish` and read only the command registry and local profile names. They complete commands, options, enum values (after `--OPT ` and `--OPT=`), `METHOD`, `SHELL`, and profile names (after `--profile` and for the `NAME` argument of `profiles get|update|delete|use`). They offer nothing after `--` or after an option that takes a free-form value.

## Exceptions

| Rule | Decision | Reason |
| --- | --- | --- |
| `CLI-PAGE-2` | `--max-items` must be a multiple of `--page-size`. | Secureframe paginates by page number, so a smaller final page would shift page boundaries and `next_cursor` would skip or repeat items. |

## Development

```bash
bun run build
bun run check
bun link
```

`src/core/` is vendored from cli-core and is never edited here. Change cli-core and run its sync script instead. `docs/cli-conventions.md` restates the command-line contract this tool follows.

## API references

- [Secureframe API](https://api.secureframe.com/docs)
- [Cloud resource endpoint](https://api.secureframe.com/docs#tag/cloud-resource/GET/cloud_resources)
