<p align="center">
	<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00A2FF,50:1DB954,100:8956FB&height=250&section=header&text=Waiter&fontAlignY=32&fontColor=ffffff&desc=Unified%20Creator%20Automation%20Runtime&fontSize=65&descAlignY=52" alt="Waiter banner" />
</p>

<p align="center">
	<a href="#"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
	<a href="#"><img src="https://img.shields.io/badge/Runtime-Node%20%2B%20Bun-F9F1E1" alt="Runtime" /></a>
	<a href="#"><img src="https://img.shields.io/badge/Database-SurrealDB-9600FF" alt="SurrealDB" /></a>
	<a href="#"><img src="https://img.shields.io/badge/License-Private-444" alt="License" /></a>
</p>

<p align="center">
	<img src="https://skillicons.dev/icons?i=nodejs,bun,express,ts,discordjs,spotify,nextjs" alt="stack icons" />
</p>

> [!WARNING]
> Waiter is actively evolving. It is stable for development/testing workflows, but not all planned features are finalized for production-grade use.

Waiter is a multi-platform automation runtime for creators and communities.
It combines Twitch, Spotify, Discord, the manager controller, web routes, and SurrealDB into one modular TypeScript codebase so cross-platform workflows can be built in one place.

## Table of Contents

- [What Is Waiter](#what-is-waiter)
- [Origin And Vision](#origin-and-vision)
- [Feature Matrix](#feature-matrix)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Development Workflow](#development-workflow)
- [Repository Layout](#repository-layout)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## What Is Waiter

Waiter exists to remove platform fragmentation.

Instead of maintaining separate bots/services for chat commands, account linking, music automation, callbacks, and data sync, Waiter runs all of it through a unified controller model.

### Design goals

- One runtime, many platforms
- Strong typing at boundaries
- Safe startup through schema validation
- Composable controller lifecycle
- Extensible event and command architecture

## Origin And Vision

> [!IMPORTANT]
> Waiter was originally designed for TSF (The Swedish Fika), a community of five streamers sharing one Discord server.

The initial purpose was to manage all five channels from one automation runtime while still giving each streamer room for custom behavior.

Per-streamer customization is already implemented for Twitch commands and redemption triggers through config-backed enable/install flags. In development, HMR also live-applies changes to those Twitch command and redemption trigger files.

Waiter also bridges each streamer back to the shared Discord server, helping unify announcements, interactions, and tooling.

The long-term goal is ambitious automation across as many repetitive stream/community workflows as possible, while keeping the experience fun and entertaining for viewers.

## Feature Matrix

| Domain | What Waiter provides | Current state |
|---|---|---|
| Twitch | Streamer clients, events, permission decorators, command execution, config-backed command and redemption trigger gating, HMR for Twitch commands and redemption triggers in dev mode | Active |
| Spotify | OAuth account linking, token refresh, typed API wrappers, playback/library tools | Active |
| Discord | Slash command registration + interaction handling | Active |
| Manager | Socket.IO manager client orchestration, streamer identity validation, controller status/control surface | Active |
| Web | Express routes, HTML template rendering, URL shortener helper | Active |
| Database | SurrealDB connectivity, schema/table bootstrap, reconnect logic | Active |

## Architecture

Waiter discovers and runs controllers in ordered stages:

1. `pre`
2. `normal`
3. `post`

This guarantees foundational dependencies (like DB + web registration surfaces) are available before feature controllers execute.

Stage execution is a strict barrier model: the `pre` stage must fully complete before `normal` starts, and `normal` must fully complete before `post` starts.

### Logistics Summary

| Concern | How Waiter handles it |
|---|---|
| Five-streamer coordination | One runtime tracks multiple channels while keeping streamer context separate |
| Manager client orchestration | Socket.IO manager clients authenticate against streamer identity and connect to controller state |
| Shared Discord bridge | Twitch and Spotify actions can be surfaced into a shared Discord experience |
| Reliability and startup safety | Config validation occurs before platform controllers run |
| Auth/token lifecycle | OAuth credentials are encrypted, validated, refreshed, and synced with DB records |
| Future custom streamer behavior | Twitch command and redemption trigger flags are config-backed; broader per-streamer overrides are still planned |

## Quick Start

### 1) Install dependencies

```bash
bun install
```

### 2) Configure runtime

- Edit `src/config.ts` if present
- If missing, run once and Waiter will copy from `src/default.config.ts`

### 3) Run development loop

```bash
bun run dev
```

### 4) Build and start compiled output

```bash
bun run build
bun run start
```

## Configuration

Configuration is loaded from `src/config.ts` and validated using merged Zod schemas from all controllers.

`config.hotReload.enabled` turns on HMR for Twitch commands and redemption triggers when Waiter runs from source. It is ignored in compiled runs.

Waiter also creates and uses `.env.internal` for internal runtime state. That file stores the encryption key used to encrypt and decrypt sensitive database values such as auth tokens.

Waiter resolves a machine identity at startup for database ownership safety:

- Real machines: an OS machine identifier is used (hardware/OS-backed source)
- Docker containers: a container runtime identifier is used (stable for stop/start of the same container, changes when recreated/rebuilt)
- Fallback: if no trusted source is available, Waiter reuses or generates `MACHINE_ID` in `.env.internal`

| Behavior | Description |
|---|---|
| Missing config file | `src/default.config.ts` is copied to `src/config.ts`, then process exits so you can edit it |
| Invalid config | Startup halts and prints all validation issues |
| Valid config | Boot continues and controllers initialize in stage order |

### Example config shape

```ts
const config: WaiterConfig = {
	publicUrl: "http://localhost:9999",
	discord: {
		serverId: "123456789012345678"
	},
	web: {
		port: 9999
	},
	spotify: {
		authEndpoint: "/spotify/auth",
		generatedCodeValidity: "15m"
	},
	twitch: {
		authEndpoint: "/twitch/auth",
		generatedCodeValidity: "15m"
	},
	manager: {
		github: {
			token: "github_pat_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
		}
	},
	database: {
		uri: "wss://your-surreal-host:13244"
	}
};

export default config satisfies WaiterConfig;
```

## Scripts

| Script | Command | What it does |
|---|---|---|
| Build | `bun run build` | Compiles TS, resolves ts paths, copies templates/json to `dist` |
| Start | `bun run start` | Starts compiled app from `dist/index.js` |
| Dev | `bun run dev` | Watches sources and restarts on change |

## Development Workflow

```bash
# type-check only
tsc --noEmit

# build + run compiled
bun run build && bun run start

# live development loop
bun run dev
```

## Hot Reload

HMR is available for Twitch commands and redemption triggers when `config.hotReload.enabled` is `true` and Waiter is running from source.

Behavior:

- New command and trigger files are validated, loaded, and registered automatically.
- Changed command files unload the old command and load the new one.
- Changed redemption triggers unload the old trigger, then load the replacement. Internal rewards are disabled during changes and fully unregistered when a trigger file is removed.
- Removed trigger files fully unregister their rewards.
- Renamed files keep the existing in-memory instance and only update the tracked file path.
- File matching is filtered by controller-specific suffixes so unrelated files do not trigger reload work.

Notes:

- HMR is disabled in compiled runs.
- Add/remove/change behavior is applied after the watcher's initial scan completes.

## Repository Layout

| Path | Role |
|---|---|
| `src/index.ts` | App bootstrap, controller discovery, config validation, startup timing |
| `src/controllers/sdb` | SurrealDB connectivity + table/bootstrap logic |
| `src/controllers/web` | HTTP server, route decorators, template rendering, short links |
| `src/controllers/twitch` | Twitch auth/client lifecycle, events, commands, permissions |
| `src/controllers/spotify` | Spotify auth/client lifecycle + typed API functions |
| `src/controllers/discord` | Discord client + slash command registration/dispatch |
| `src/controllers/manager` | Socket.IO manager clients, streamer validation, shared control/telemetry surface |
| `src/lib` | Shared core utilities (logging, encryption, misc helpers, cache) |

## Manager

The Manager is a custom native client (a small executable) that connects to Waiter over Socket.IO and lets Waiter perform safe, machine-local actions on behalf of a registered streamer. In short: the Manager turns a streamer machine into a controllable, authenticated control surface for automation, telemetry and local utilities.

- **Connection & auth:** Manager clients open a Socket.IO connection to the Waiter web server and authenticate by sending a Waiter user ID (WUID) in the handshake. Waiter validates the WUID against the `users` table in the DB and requires the WUID to belong to a registered streamer. Only one Manager client is allowed per user ID; duplicate connections are rejected. See [src/controllers/manager/index.ts](src/controllers/manager/index.ts#L1-L400) for the authentication and connection flow.
- **Global surface:** When a manager client connects, Waiter populates `global.manager` with an object containing the active `io` server, a `clients` set and a `communication` EventEmitter. Waiter emits `manager.client_connected` and `manager.client_disconnected` events on this `communication` channel so other controllers can react to manager availability.
- **Example capabilities:** The bundled `ManagerClient` class exposes higher-level helpers used by controllers to interact with the client. Notable methods include `runCommand(cmd, runner)` for executing shell commands on the manager host and `showMessageBox(...)` for native dialogs. These helpers are implemented with request/receipt semantics over Socket.IO and guarded by a `MinimumVersion` decorator so features are only used when the connected Manager supports them. See [src/controllers/manager/client.ts](src/controllers/manager/client.ts#L1-L200).
- **Release & updates:** Waiter exposes an HTTP endpoint that can stream the latest Manager binary from GitHub (`/api/v1/manager/release/latest`). The controller uses the `manager.github` config (token + repo) to fetch release assets and stream them to clients. See the Manager controller's update endpoint in [src/controllers/manager/index.ts](src/controllers/manager/index.ts#L1-L400).
- **Shutdown & cleanup:** Waiter registers process hooks (`beforeExit`, `SIGINT`, `SIGTERM`) to call `cleanupAllClients()` which gracefully disconnects manager sockets, clears the `clients` set and closes the Socket.IO server. The cleanup routine also runs Twitch client cleanup to ensure a clean shutdown sequence.
- **Security & notes:**
	- Manager clients must be registered streamers; unregistered connections are rejected.
	- Only one manager connection per WUID is allowed to avoid conflicting local actions.
	- Keep the `manager.github.token` secret (used to fetch private release assets).
	- Use the `MinimumVersion` compatibility checks on controller calls to avoid executing features unsupported by an older Manager binary.

Adding a Manager client to a streamer machine allows safe, auditable, and versioned local automation (commands, dialogs, and other host-specific workflows) while keeping authentication and control in the Waiter runtime.

## Roadmap

- [ ] Build a full web dashboard for streamers and Waiter admins
	- [ ] Central control panel for configuration and runtime visibility
	- [ ] Auth-code generation and account-management tools
	- [ ] Live monitoring for controllers, platform clients, and key activity
- [ ] Expand account linking flows
	- [ ] Automatic account linking where safe and deterministic
	- [ ] User-initiated linking flows (self-service)
- [ ] Add optional output censorship as a platform-wide behavior
	- [ ] Global config toggle to enable or disable censorship of Waiter outputs
	- [ ] Consistent censorship behavior across all supported integrations
- [ ] Deepen Discord as a control and engagement surface
	- [ ] Add games and engagement features
	- [ ] Add moderation helper tools
	- [ ] Support controlling Twitch/Spotify/other services from Discord
	- [ ] Support cross-control paths (for example, controlling Discord from Twitch)
- [ ] Introduce additional per-streamer overrides beyond Twitch command and redemption trigger flags
	- [ ] Preserve shared defaults while allowing channel-level customization
- [ ] Improve controller health, modularity, and fault tolerance
	- [ ] Health checks for every controller
	- [ ] Ability to restart/stop controllers from an admin surface
	- [ ] Graceful degradation when a controller is disabled or not installed
	- [ ] Ensure dependent features detect missing controllers and handle it cleanly

## Contributing

1. Create a focused branch for each change.
2. Keep changes scoped by domain/controller.
3. Run `tsc --noEmit` and relevant runtime checks before PR.
4. Include behavior notes and test evidence in PR description.

<details>
<summary>Additional Notes</summary>

### Controller lifecycle contract

Each controller generally implements:

- `registerConfig()`
- `exec()`
- `statuses()`

Controllers are intended to be composable and independent, with startup ordering handled by stage and priority.

### Security posture

- OAuth credentials are encrypted before persistence
- Tokens are validated before use
- Invalid auth records are cleared defensively

</details>

---

<p align="center">
	Built for modular creator automation with a controller-first architecture.
</p>
