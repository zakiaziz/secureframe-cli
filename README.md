# secureframe-cli

A safe command line interface for Secureframe compliance data.

This project owns the `secureframe` binary. It is not an official Secureframe CLI.

## How It Works

The CLI establishes a read layer for compliance automation:

- Secureframe US and UK API regions
- API key and secret profiles stored with mode `0600`
- Cloud resource inventory, filtering, includes, and full pagination
- Redacted dry runs
- A guarded raw API command for endpoints without first-class commands

First-class commands are read-only. Raw `POST`, `PUT`, and `DELETE` requests require `--dry-run` or `--yes`.

## Caveats

Audit-scope policy is a prerequisite for automating framework asset scopes. Cloud integrations must be connected in Secureframe before `/cloud_resources` can return their inventory.

## Install

Install from npm with Node 22 or newer, or with Bun:

```bash
npm install -g @zakiaziz/secureframe-cli
bun add -g @zakiaziz/secureframe-cli
```

To work on the CLI, build and link a checkout with `bun install`, `bun run build`, and `bun link`.

## Setup

Create an API key in Secureframe Console at **Your Profile > Company settings > API keys**. Secureframe only shows the API secret once.

US account:

```bash
secureframe setup work \
  --api-key "$SECUREFRAME_API_KEY" \
  --api-secret "$SECUREFRAME_API_SECRET" \
  --region us
secureframe auth verify
```

UK account:

```bash
secureframe setup work-uk \
  --api-key "$SECUREFRAME_API_KEY" \
  --api-secret "$SECUREFRAME_API_SECRET" \
  --region uk
```

Environment setup:

```bash
export SECUREFRAME_API_KEY="..."
export SECUREFRAME_API_SECRET="..."
export SECUREFRAME_REGION="us"
secureframe setup work --from-env
```

Profiles live in `~/.config/secureframe`, or `$XDG_CONFIG_HOME/secureframe` when `XDG_CONFIG_HOME` is set. Credential files are written with mode `0600`.

Credential resolution order is command flags, environment variables, then the selected profile. The CLI does not mix an API key from one source with a secret from another source.

Supported environment variables:

- `SECUREFRAME_API_KEY`
- `SECUREFRAME_API_SECRET`
- `SECUREFRAME_REGION`
- `SECUREFRAME_BASE_URL`

The default base URLs are `https://api.secureframe.com` for `us` and `https://api-uk.secureframe.com` for `uk`.

## Cloud Resource Inventory

List the first page:

```bash
secureframe cloud-resources list
```

Fetch the complete inventory:

```bash
secureframe cloud-resources list --all
```

Filter with Secureframe's Lucene query syntax:

```bash
secureframe cloud-resources list \
  --q 'vendor_name:AWS AND region:us-east-1' \
  --all
```

Include owners and integration connections:

```bash
secureframe cloud-resources list \
  --include owner,integration_connection \
  --relationships \
  --all
```

Get one resource:

```bash
secureframe cloud-resource show CLOUD_RESOURCE_ID
```

The API's `company_vendor_connection` include is deprecated. The CLI rejects it and requires `integration_connection`.

## Command Reference

### Setup, Profiles, and Configuration

| Command | Description |
| --- | --- |
| `secureframe setup [profile] [options]` | Create and activate a credential profile. |
| `secureframe auth verify` | Verify credentials by reading one cloud-resource page. |
| `secureframe profiles list` | List profile names and the active profile. |
| `secureframe profiles show <name>` | Show a profile with credentials redacted. |
| `secureframe profiles create <name> [options]` | Create a profile. |
| `secureframe profiles update <name> [options]` | Update a profile. |
| `secureframe profiles delete <name>` | Delete a profile. |
| `secureframe profiles use <name>` | Make a profile active. |
| `secureframe config path` | Show the config directory and config file path. |
| `secureframe config show` | Show global configuration with secrets redacted. |
| `secureframe config get <key>` | Read a dotted configuration key. |
| `secureframe config set <key> <value>` | Set a dotted configuration key. |
| `secureframe config unset <key>` | Remove a dotted configuration key. |
| `secureframe completions bash` | Print Bash completions. |
| `secureframe completions zsh` | Print Zsh completions. |

Setup and profile commands accept `--profile`, `--api-key`, `--api-secret`, `--region`, and `--base-url`. Setup also accepts `--from-env`.

### Cloud Resources

| Command | Options | Description |
| --- | --- | --- |
| `secureframe cloud-resources list` | `--q`, `--include`, `--relationships`, `--page`, `--per-page`, `--all` | List cloud resources. |
| `secureframe cloud-resource show <id>` | `--include`, `--relationships` | Get one cloud resource. |

`--include` accepts a comma-separated list containing `owner` and `integration_connection`.

Secureframe defaults to 100 records per page. `--all` starts at page 1, follows all pages, combines `data`, and deduplicates `included` resources by type and ID.

### Global Options

| Option | Purpose |
| --- | --- |
| `--profile <name>` | Select a saved profile. |
| `--api-key <key>` | Override the Secureframe API key. |
| `--api-secret <secret>` | Override the Secureframe API secret. |
| `--region <us\|uk>` | Select the Secureframe API region. |
| `--base-url <url>` | Override the Secureframe API base URL. |
| `--all` | Follow every page for supported list commands. |
| `--dry-run` | Print the redacted request without sending it. |
| `--yes`, `-y`, `--force` | Confirm a raw mutation. |
| `--data <json\|@file>` | Supply an exact JSON body to `api request`. |
| `--set <path=value>` | Set a nested raw request body field. Repeatable. |
| `--query-param <key=value>` | Set an exact raw query parameter. Repeatable. |
| `--help`, `-h` | Show help. |
| `--version`, `-v` | Show the version. |

## Raw API Access

Use the raw escape hatch for other Secureframe endpoints:

```bash
secureframe api request GET /frameworks --per-page 100
secureframe api request GET /controls --q 'enabled:true'
secureframe api request GET /tests --query-param 'per_page=100'
```

For `GET`, unknown flags become snake_case query parameters. `--per-page 100` becomes `per_page=100`.

Inspect any mutation before executing it:

```bash
secureframe api request PUT /tests/TEST_ID \
  --data @request.json \
  --dry-run

secureframe api request PUT /tests/TEST_ID \
  --data @request.json \
  --yes
```

## Development

```bash
bun run check
bun run test
bun run build
```

The CLI requires Node.js 20 or newer and has no runtime dependencies.

## API Reference

- [Secureframe API](https://api.secureframe.com/docs)
- [Cloud resource endpoint](https://api.secureframe.com/docs#tag/cloud-resource/GET/cloud_resources)
