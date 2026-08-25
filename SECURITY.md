# Security policy

## Desktop boundary

Treat every connected deployment as remote content, including loopback. A
compromised Möbius page must not be able to execute a process, read a host path,
change Docker state, select a folder, install an update, or invoke launcher
commands.

Only the bundled `launcher` window appears in the Tauri capability file. Custom
commands independently check the caller label. Deployment windows use hashed
labels, receive no capability entry, and are restricted to the saved deployment
and known authentication origins. Other HTTPS links open in the system browser;
non-HTTPS external links are rejected.

## Local folder sharing

- A user chooses each folder with the operating-system picker.
- Rust persists the resulting grant; a start request references only its ID.
- New grants default to **Read only**.
- **Read & edit** is explicit and is described as permission to change or
  delete files in that folder.
- Shares apply only to the labelled local container below
  `/data/shared/desktop/`.
- Removing a share removes a future mount; it does not delete host files or the
  Docker volume.
- A missing folder fails before the current container is replaced.

## Docker execution and recovery

- Spawn `docker` directly with a fixed subcommand and argument array; never
  concatenate a shell command.
- Bind the service only to `127.0.0.1`.
- Pin the official image by digest.
- Apply an ownership label and refuse to manage unlabelled name collisions.
- Bound command output, readiness polling, and command duration.
- Preserve the named data volume across recreation, application updates, and
  uninstall.
- Keep the prior owned container under a recovery name until the replacement is
  ready; restore it when replacement fails or startup finds an interrupted
  swap.

The app has no command that deletes the local Docker volume or host folders.

## Saved state

State is written to an application-data file through a same-directory temporary
file, synchronized, and atomically replaced. Unix files use mode `0600`. Saved
origins and folder destinations are revalidated on load, the image digest is
re-pinned, corrupt JSON is left untouched, and state written by a newer app is
not downgraded. Legacy MVP state is copied forward rather than deleted.

## Updates and distribution

Development builds have no update channel. Release packaging injects only an
HTTPS endpoint and public verification key. The signing private key remains a
GitHub Actions secret. The app checks only after a user action, installs only
after a second explicit action, verifies the downloaded signature, then
restarts itself.

The install command rechecks the release channel and refuses to install a
different version than the one the user approved. Updater signatures do not
replace operating-system trust. Public macOS builds
still require Apple code signing and notarization; public Windows builds should
use an Authenticode certificate or supported signing service.

## Reporting a vulnerability

Until a public security contact is established, report vulnerabilities
privately to the `mobius-os` maintainers. Do not open a public issue containing
an exploit, credential, private deployment address, or local filesystem path.
