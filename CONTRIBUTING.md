# Contributing

Issues and pull requests are welcome. Keep changes focused on the desktop
launcher and local-runtime boundary; Möbius platform behavior belongs in the
[`mobius-os/mobius`](https://github.com/mobius-os/mobius) repository.

## Before opening a pull request

```bash
npm ci
npm run verify
npm run build:debug
```

Describe the user-visible outcome, platforms exercised, and any native
authority the change adds or alters. Include rendered evidence for interface
changes. Changes to Docker lifecycle, folder access, URL handling, updater
configuration, or Tauri capabilities should include a regression test and a
short trust-boundary explanation.

Do not put vulnerabilities, credentials, private deployment addresses, or host
filesystem paths in a public issue. Follow [SECURITY.md](SECURITY.md) instead.
