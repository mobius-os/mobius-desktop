# Architecture

## Trust model

Möbius Desktop has two deliberately different worlds:

1. **The packaged launcher** is the only webview named in the Tauri capability
   file. It invokes a small Rust command surface for saved deployments, Docker,
   folder selection, diagnostics, and signed updates. Every custom command also
   verifies that its caller is the `launcher` window.
2. **Möbius deployments** open in separate external webviews whose labels are
   derived from hashed instance IDs. Their labels match no capability, and they
   cannot invoke launcher commands, Docker, the filesystem picker, the updater,
   or arbitrary native APIs.

Unexpected deployment navigation is denied. Known Möbius and identity origins
may remain in the deployment webview; other HTTPS navigation and pop-ups are
sent to the system browser. Unsafe protocols are dropped.

## Modules

### Rust core

- `StateStore` owns the versioned state file in Tauri's application-data
  directory. It imports the previous Electron MVP state once when found, writes
  atomically with private permissions, revalidates persisted origins, and
  refuses to overwrite corrupt or newer-format state.
- `url_policy` accepts HTTPS or loopback HTTP origins only and verifies a ready
  Möbius at `/api/ready` without credentials or redirects.
- `DockerService` executes the Docker CLI with argument arrays and fixed
  timeouts—never through a shell. It recognizes only labelled containers,
  preserves the named volume, keeps publishing on loopback, and reports typed
  progress.
- `windows` creates capability-free deployment webviews and owns their
  navigation boundary.
- `commands` is the single native bridge. Folder start requests contain grant
  IDs and access modes, never renderer-supplied host paths.
- The updater is called from Rust custom commands. Development builds have no
  endpoint; release packaging injects an HTTPS endpoint and verification key.

### Launcher renderer

The React launcher owns presentation and transient form state only. It can:

1. choose hosted, existing, or local setup;
2. connect verified deployments;
3. review read-only or writable local folder grants;
4. see progress and recoverable errors;
5. open and manage saved deployments; and
6. inspect diagnostics and explicitly check/install signed updates.

It imports no Node.js modules and receives no general filesystem or process
bridge.

## Local container contract

The launcher owns these stable resources:

- container: `mobius-desktop`
- temporary rollback container: `mobius-desktop-previous`
- data volume: `mobius-desktop-data`
- image: `ghcr.io/mobius-os/mobius@sha256:8a1c8f876fb598c1a2f130dfe2333ef2b9e6c52876fbb7749e7524e39bcbef5a`
- ownership label: `you.mobius.desktop.managed=true`
- browser origin: a loopback-only HTTP port selected and persisted by the app

The container receives `/data` from the named volume. Every selected host
folder is an additional bind mount below
`/data/shared/desktop/<safe-name>-<grant>`. Grants default read-only. A renderer
can change the access mode of a grant but cannot invent its source path.

Before replacement, the app validates folder sources, pulls the pinned image,
and prepares the volume. It then stops and renames the previous owned container,
starts the new one, and waits for `/api/ready`. Creation, start, or readiness
failure removes the failed replacement and restores the prior container. A
startup recovery pass resolves an interrupted swap. The named data volume is
never removed by these paths.

A same-named container without the ownership label fails closed. Stopping and
forgetting are reversible and do not delete the container volume or host files.

## Instance URL contract

Accepted addresses are:

- an exact `https://` origin; or
- loopback HTTP on `localhost`, any IPv4 loopback address, or IPv6 loopback,
  with an optional port.

User info, query strings, fragments, nested paths, and non-loopback HTTP are
rejected. Verification calls `/api/ready` from Rust with a short timeout and no
redirects. Saved values are normalized origins, not arbitrary navigation URLs.

## Hosted creation

**Create hosted Möbius** opens `https://www.mobius.you/` in the system browser.
The user returns with the resulting deployment address. A future automatic
return must be a separately reviewed `mobius-desktop://` handoff containing a
short-lived opaque value—not credentials, browser history, clipboard contents,
or a deployment bearer token.

## Release boundary

Ordinary CI packages have no update endpoint and create no updater artifacts.
The release workflow generates an untracked Tauri config containing the public
verification key and GitHub Releases endpoint. Tauri signs updater artifacts
with a private GitHub Actions secret; only those artifacts are accepted by the
in-app installer. Operating-system code signing and notarization use their own
platform credentials.
