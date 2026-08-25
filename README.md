# Möbius Desktop

A small cross-platform doorway into Möbius for macOS, Windows, and Linux. The
launcher is React inside a Tauri 2 system webview; native state, Docker, folder
grants, deployment windows, diagnostics, and updates are owned by Rust.

## What it does

- **Create a hosted Möbius** — the recommended path. The app opens
  [mobius.you](https://www.mobius.you/) in the system browser, then verifies and
  saves the resulting deployment.
- **Connect an existing Möbius** — accepts HTTPS deployments and loopback HTTP
  instances, verifies `/api/ready`, and opens each deployment in a separate
  capability-free webview.
- **Run Möbius locally** — manages the pinned official image through any
  Docker-compatible CLI, preserves a named data volume, and shares only folders
  selected with the operating-system picker.

The local container keeps running while the computer and Docker engine remain
on, even when the launcher is closed. It is still **not a persistent,
always-available home for the agent**: it disappears from the network when that
computer or engine is off, and resetting Docker data can remove it. The product
keeps this limitation visible and recommends hosted Möbius for an always-on
home.

## Local files and data

Folders begin **Read only**. **Read & edit** is a separate explicit choice and
allows the local agent to change or delete files inside that folder. Host paths
never cross into hosted or user-supplied remote deployments.

Local data lives in the `mobius-desktop-data` Docker volume. Container refresh,
desktop updates, stopping, and forgetting the launcher shortcut do not delete
that volume. A failed container refresh restores the previous launcher-owned
container when possible.

## Development

Prerequisites:

- Node.js 22+
- the Rust toolchain pinned in `rust-toolchain.toml`
- [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/)
- Chromium for rendered tests (`npx playwright install chromium`)

```bash
npm ci
npm start
```

Run every local check:

```bash
npm run verify
```

Build the current platform without packaging:

```bash
npm run build:debug
```

Build current-platform installers:

```bash
npm run build
```

## Hosted builds and releases

- **Verify desktop app** runs type, Rust, dependency-security, renderer, and
  Playwright checks on pull requests and `main`.
- **Build desktop installers** is a manual workflow that produces downloadable
  macOS arm64/x64, Windows x64, and Linux x64 workflow artifacts without
  publishing a release.
- **Create draft release** is a manual workflow that produces platform-trusted
  macOS and Windows installers, signed updater artifacts on every platform, and
  a draft GitHub Release. Publishing the draft makes its installers and
  `latest.json` the public update channel.

The release workflow requires:

- repository variable `TAURI_UPDATER_PUBLIC_KEY`;
- secrets `TAURI_SIGNING_PRIVATE_KEY` and, when used,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
- Apple signing/notarization secrets for trusted public macOS distribution;
- repository variables `WINDOWS_CERTIFICATE_THUMBPRINT` and
  `WINDOWS_TIMESTAMP_URL`, plus base64 PFX secret `WINDOWS_CERTIFICATE` and its
  `WINDOWS_CERTIFICATE_PASSWORD`.

Development builds deliberately have no update endpoint. The release workflow
injects the public key and HTTPS GitHub Releases endpoint into a generated,
untracked configuration; the private updater key never enters the repository.

Version numbers in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json` must match. `npm run version:check` enforces this
before packaging.

See [RELEASING.md](RELEASING.md), [PRODUCT.md](PRODUCT.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md),
[PRIVACY.md](PRIVACY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and
[DESIGN.md](DESIGN.md) for the release, product, trust, contribution, and
interface contracts.

## License

Möbius Desktop is available under the [MIT License](LICENSE).
