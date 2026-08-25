# Architecture

## Trust model

Möbius Desktop has two deliberately different worlds:

1. **Local launcher UI** is packaged with the app. A preload exposes a small,
   typed command surface for instance management, Docker lifecycle, native
   folder selection, and safe external links.
2. **Möbius web content** runs in a separate, sandboxed browser window. It has
   no preload, Node integration, Electron object, Docker handle, filesystem
   bridge, or general IPC channel.

No remote response can invoke a launcher command. The main process validates
the sender and every argument even though the local renderer is packaged code.

## Modules

### Main process

- `InstanceStore` owns the versioned state file under Electron's `userData`
  directory and writes it atomically.
- `InstanceService` normalizes and verifies HTTPS or loopback URLs and owns the
  saved deployment list.
- `DockerService` calls the Docker CLI with argument arrays (never a shell),
  recognizes only containers carrying the launcher-owned label, preserves the
  named data volume, and reports typed progress and failure outcomes.
- `WindowManager` owns the launcher window and one sandboxed Möbius window per
  selected instance. Browser partitions isolate cookies between deployments.
- Every saved deployment also has a system-browser fallback. This keeps the
  product usable when an identity provider rejects an embedded browser while
  preserving the launcher's narrow native boundary.
- IPC registration is the only bridge between the local renderer and those
  services.

### Renderer

The React renderer is an operating surface with four states:

1. choose hosted, existing, or local;
2. complete the selected setup;
3. see live progress and recoverable errors;
4. open and manage saved deployments.

It never imports Node or Electron directly.

## Local container contract

The launcher owns these stable resources:

- container: `mobius-desktop`
- data volume: `mobius-desktop-data`
- image: `ghcr.io/mobius-os/mobius:main`
- ownership label: `you.mobius.desktop.managed=true`
- browser origin: a loopback-only HTTP port selected and persisted by the app

The container receives `/data` from the named volume. Every explicitly shared
folder is an additional bind mount below `/data/shared/desktop/<safe-name>`.
Changing shares recreates only the launcher-owned container; it never deletes
the data volume or the host folders. A name collision without the ownership
label fails closed and tells the user how to resolve it.

The launcher polls `/api/ready` before offering **Open Möbius**. Stop/start are
ordinary reversible actions. Deleting the persistent Docker volume is outside
the MVP and must never be inferred from removing the desktop app.

## Instance URL contract

Accepted addresses are:

- an exact `https://` origin; or
- `http://localhost`, `http://127.0.0.1`, or `http://[::1]` with an optional
  port.

User info, query strings, fragments, non-loopback HTTP, and ambiguous origins
are rejected. Verification calls the deployment's `/api/ready` from the main
process with a short timeout and no credentials. Saved values are normalized
origins, not arbitrary navigation URLs.

## Hosted creation

For the MVP, **Create hosted Möbius** opens `https://www.mobius.you/` in the
system browser. This avoids attempting Google or Apple sign-in in an embedded
user agent. The user returns and connects the resulting deployment address.

A future automatic return must be a real, reviewed `mobius-desktop://` protocol
contract from `mobius.you`; it must carry only a short-lived opaque handoff, not
credentials or an instance bearer. The desktop app will not scrape browser
history, clipboard contents, or Railway state to imitate that contract.

## Remote browsing policy

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- no preload script
- no insecure-content or web-security bypass
- permission requests denied unless they are in a narrow user-prompted allowlist
- unexpected new windows and unsafe external protocols denied
- downloads remain Chromium-managed and never become implicit shared folders

This follows Electron's rule that remote content must never execute with Node
integration and keeps local file authority entirely in the launcher process.
