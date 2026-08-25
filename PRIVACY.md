# Privacy

Möbius Desktop has no analytics, advertising SDK, crash-reporting service, or
desktop account of its own.

The launcher stores deployment names and addresses, local Docker settings, and
the folders you explicitly chose in its private application-data directory.
Passwords and deployment bearer tokens remain inside each deployment's system
webview session and are not copied into launcher state. Webview cookies and
other site data are governed by the connected deployment and its identity
providers.

Network activity happens when you ask the app to:

- open `mobius.you` to create a hosted deployment;
- verify, open, or use a connected deployment;
- pull the pinned Möbius image from GitHub Container Registry;
- or check GitHub Releases for a signed desktop update.

Local folders are shared only with the launcher-managed local Docker container,
and only after an operating-system folder selection. Hosted and other remote
deployments cannot request those folders through the desktop app. Diagnostics
stay on the computer unless you explicitly copy and send them.

Connected deployments may have their own privacy terms because they are
separate services controlled by their owners. Review those terms before using a
deployment you do not operate.
