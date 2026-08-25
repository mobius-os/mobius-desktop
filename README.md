# Möbius Desktop

A cross-platform desktop doorway into Möbius for macOS, Windows, and Linux.

## What it does

- **Create a hosted Möbius** — the recommended path. The app opens
  [mobius.you](https://www.mobius.you/) in the system browser, then verifies and
  saves the new deployment.
- **Connect an existing Möbius** — accepts HTTPS deployments and loopback HTTP
  instances, verifies `/api/ready`, and keeps their sign-ins isolated.
- **Run Möbius locally with Docker** — manages an official Möbius container,
  preserves its named data volume, and shares only folders chosen through the
  operating-system picker.

Local Docker is useful for work tied to one computer, but it is **not a
persistent, always-available home for the agent**. It is unavailable when the
computer or Docker is off, and resetting Docker data can remove it. The app
keeps this limitation visible and recommends hosted Möbius for an always-on
home.

## Local files

Each shared folder has an explicit **Read only** or **Read & edit** setting. The
setup shows both the host path and the path the agent receives inside its local
container. Connected web deployments never receive filesystem or Docker
authority from the desktop app.

## Development

Requires Node.js 22+.

```bash
npm install
npm start
```

Run the complete local verification:

```bash
npx playwright install chromium # first run only
npm run verify
```

`npm run package` creates an unpacked package for the current operating system;
`npm run make` creates platform installers supported by Electron Forge. The
repository also includes a manual GitHub Actions matrix for Windows, macOS, and
Linux packaging.

## MVP status and release boundary

The launcher, all onboarding routes, sandbox boundary, URL validation, Docker
command construction, state persistence, and Linux package build are covered by
automated tests. A release still needs:

- hands-on Docker lifecycle testing against the published Möbius image;
- packaging verification on real macOS and Windows runners; and
- platform signing/notarization plus updater policy.

The full npm production dependency audit is clean. The development dependency
audit currently reports issues in Electron Forge's packaging toolchain,
including its transitive `node-gyp`/`tar` path; those tools are not shipped as
runtime dependencies. Track and update the official Forge toolchain rather than
silently overriding its internals.

See [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[SECURITY.md](SECURITY.md), and [DESIGN.md](DESIGN.md) for the product, trust,
and interface contracts.
