# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop (Tauri 2 system webviews with a React launcher)

## Stack

Tauri 2 with React, TypeScript, Vite, and a narrow Rust core. The launcher stays
close to the existing Möbius frontend while the operating system's webview keeps
packages smaller than bundling a browser engine. Docker, saved deployment state,
updates, and folder authority remain outside all deployment-controlled content.

## Users

People who want one obvious desktop doorway into Möbius without first learning
how it is hosted. They may be starting a hosted deployment, returning to an
existing deployment, or deliberately running a local copy on a computer with
Docker installed.

## Product Purpose

Möbius Desktop helps a person get to a working Möbius from one app. First-run
success means choosing the right home, completing the required setup, and
opening it. Returning success means the preferred Möbius is one click away.

## Positioning

This is a trustworthy desktop launcher and local-runtime companion, not a
generic browser wrapper. It understands the difference between an always-on
hosted Möbius, an existing owner-controlled deployment, and a Docker copy whose
availability and durability depend on one computer. Only that local Docker copy
can receive explicitly shared folders from the desktop.

## Operating Context

- **Create a hosted Möbius:** sign in through `mobius.you`, create a private
  Railway deployment, then connect it to the desktop app.
- **Connect an existing Möbius:** enter its HTTPS address (or a loopback HTTP
  address for local development), verify it is a Möbius, and retain its login in
  the desktop web session.
- **Run locally with Docker:** verify Docker is available, start the official
  Möbius image with a named data volume, optionally share chosen folders, and
  open the loopback-only instance.

## Capabilities and Constraints

- Hosted is the recommended default because it provides an always-on home that
  remains available when a laptop is asleep or away.
- Local Docker keeps its data in a Docker volume, but it does **not** create the
  persistent, always-available home Möbius is designed around. Removing or
  resetting Docker data can remove it, and other devices cannot reach it while
  the computer is unavailable.
- The desktop app never sends a local path or local file to a hosted or
  user-supplied remote deployment.
- Local file access is opt-in by folder. Each approved host folder is mounted
  only into the launcher-managed local container under a clear path.
- Remote Möbius content receives no Node.js, Tauri command, shell, Docker, or local
  filesystem capability. Authentication remains owned by each deployment and
  its web session; the launcher does not collect or store passwords or bearer
  tokens.
- The local runtime requires a working Docker installation. Docker installation
  itself remains the operating system or Docker Desktop's responsibility.
- Packaging workflows cover Windows, macOS, and Linux, with a signed static
  update channel. Real public releases still require updater signing material,
  Apple signing and notarization credentials, and Windows code-signing
  credentials; an unsigned or ad-hoc development package does not imply a
  trusted public release.

## Brand Commitments

- Product name: **Möbius Desktop**.
- Use the existing Möbius mark and the calm, plain-language product voice.
- Explain ownership and infrastructure boundaries directly without making
  technical knowledge a prerequisite. Technical details remain available on
  demand.

## Evidence on Hand

- The existing Möbius React shell and canonical icons are available in the
  `mobius-os/mobius` source.
- `mobius.you` currently owns hosted Railway creation and managed identity.
- The official local image is pinned to
  `ghcr.io/mobius-os/mobius@sha256:8a1c8f876fb598c1a2f130dfe2333ef2b9e6c52876fbb7749e7524e39bcbef5a`;
  loopback HTTP is a supported self-hosted origin.
- There are no customer claims, benchmarks, signing certificates, release
  channels, or automatic desktop-to-`mobius.you` callback contract to invent.

## Product Principles

1. Recommend the durable home; keep the local path honest and useful.
2. Desktop authority is explicit, narrow, visible, and local-only.
3. Open Möbius before teaching infrastructure.
4. Preserve ownership and reversibility: containers, volumes, and shared folders
   are named and never silently deleted.
5. Keep ordinary language primary and technical detail optional.

## Accessibility & Inclusion

The complete setup flow must work with keyboard navigation, visible focus,
screen readers, reduced motion, high contrast, and a compact laptop window.
Status cannot rely on color alone, and infrastructure errors must include a
plain-language next action.
