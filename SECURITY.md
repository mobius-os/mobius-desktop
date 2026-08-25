# Security policy

## Desktop boundary

Treat every connected deployment as remote content, including a loopback
deployment. A compromised Möbius page must not be able to execute a process,
read a host path, change Docker state, or call launcher IPC.

## Local folder sharing

- A user chooses each folder with the operating system picker.
- The review step shows both the host folder and the exact in-container path.
- Shares apply only to the launcher-managed local container.
- Removing a share removes the future mount; it does not delete files from the
  host folder or the Docker volume.
- Every share has an explicit **Read only** or **Read & edit** setting. The
  launcher passes read-only shares to Docker as read-only bind mounts.

## Docker execution

- Spawn the Docker executable directly with a fixed command and argument array.
- Never concatenate a shell command.
- Apply a launcher ownership label and refuse to manage a same-named unlabelled
  container.
- Preserve the named data volume across recreation and uninstall.
- Bound output, health polling, and timeouts so a stuck daemon cannot hang the
  UI indefinitely.

## Packaged Electron runtime

Packaging uses the current Electron fuse helper directly rather than Forge's
older bundled helper. Strict mode requires an explicit value for every fuse in
the Electron binary, so an Electron upgrade that adds a fuse fails the build
until its security and performance tradeoff is reviewed.

## Reporting a vulnerability

Until a public security contact is established, report vulnerabilities
privately to the `mobius-os` maintainers. Do not open a public issue containing
an exploit, credential, private deployment address, or local filesystem path.
