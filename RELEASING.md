# Releasing Möbius Desktop

GitHub Actions builds the installers and GitHub Releases hosts them. Production
updates use the same release assets through a signed `latest.json` manifest.
The default development build has no update endpoint.

## One-time repository setup

1. Generate an updater signing key with the Tauri CLI on a trusted machine.
   Store its public key as repository variable `TAURI_UPDATER_PUBLIC_KEY` and
   its private key as secret `TAURI_SIGNING_PRIVATE_KEY`. Store the password,
   when present, as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
2. Add Apple Developer Application signing and notarization values as
   `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
   `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`.
3. Add a base64-encoded Windows code-signing PFX as `WINDOWS_CERTIFICATE`, its
   password as `WINDOWS_CERTIFICATE_PASSWORD`, its uppercase certificate
   thumbprint as repository variable `WINDOWS_CERTIFICATE_THUMBPRINT`, and the
   certificate authority's HTTPS timestamp service as `WINDOWS_TIMESTAMP_URL`.
4. Protect the `main` branch and require the **Verify desktop app** check.

Never commit a private updater key, Apple certificate, Windows PFX, or password.

## Prepare a version

1. Update the matching version in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`.
2. Add concise release notes to the draft-release workflow input or edit the
   generated draft before publishing.
3. Run `npm ci`, `npm run verify`, and `npm run build:debug` locally.
4. Merge the reviewed change to `main` and wait for CI.

## Build and publish

1. Run **Build desktop installers** when an unpublished cross-platform smoke
   build is useful. Download and exercise each workflow artifact.
2. Run **Create draft release**. It builds macOS arm64/x64, Windows x64, and
   Linux x64, but leaves the GitHub Release private as a draft.
3. Install every artifact on a clean machine. Verify first launch, hosted and
   existing connections, local Docker start/stop/restart, a read-only share, an
   explicit writable share, update discovery, and preservation of the Docker
   volume across an app update.
4. Confirm the draft contains every installer, signature, and one combined
   `latest.json`. Keep the draft private if any target is absent or unsigned.
5. Publish the draft. The tag is `desktop-v<version>` and publication activates
   that version for existing release-channel clients.

## Rollback

Do not replace a bad release asset under the same version. Remove it from the
public update path, fix forward with a higher version, rebuild the complete
matrix, repeat the smoke test, and publish the new draft. Desktop updates never
delete `mobius-desktop-data`; container refresh recovery keeps the previous
owned container until its replacement is ready.
