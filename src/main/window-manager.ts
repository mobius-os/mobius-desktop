import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  session,
  shell,
  type Session,
} from 'electron';

import type { SavedInstance } from '../shared/contracts';
import { isLoopbackOrigin } from './instance-url';

const AUTH_ORIGINS = new Set([
  'https://www.mobius.you',
  'https://mobius.you',
  'https://accounts.google.com',
  'https://appleid.apple.com',
]);
const PROMPTED_PERMISSIONS = new Set(['media', 'notifications']);

function isSafeWebOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || isLoopbackOrigin(parsed.origin);
  } catch {
    return false;
  }
}

function partitionFor(origin: string): string {
  const digest = createHash('sha256').update(origin).digest('hex').slice(0, 20);
  return `persist:mobius-${digest}`;
}

function allowedNavigationOrigins(instanceOrigin: string): Set<string> {
  return new Set([instanceOrigin, ...AUTH_ORIGINS]);
}

export class WindowManager {
  private launcherWindow: BrowserWindow | null = null;
  private readonly instanceWindows = new Map<string, BrowserWindow>();
  private readonly configuredPartitions = new Set<string>();

  setLauncherWindow(window: BrowserWindow): void {
    this.launcherWindow = window;
  }

  showLauncher(): void {
    if (!this.launcherWindow || this.launcherWindow.isDestroyed()) return;
    this.launcherWindow.show();
    this.launcherWindow.focus();
  }

  private configureRemoteSession(remoteSession: Session, partition: string): void {
    if (this.configuredPartitions.has(partition)) return;
    this.configuredPartitions.add(partition);
    const granted = new Set<string>();

    remoteSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => (
      granted.has(`${requestingOrigin}|${permission}`)
    ));
    remoteSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const origin = details.requestingUrl
        ? new URL(details.requestingUrl).origin
        : new URL(webContents.getURL()).origin;
      const key = `${origin}|${permission}`;
      if (!PROMPTED_PERMISSIONS.has(permission) || !isSafeWebOrigin(origin)) {
        callback(false);
        return;
      }
      if (granted.has(key)) {
        callback(true);
        return;
      }
      const parent = BrowserWindow.fromWebContents(webContents);
      const options: Electron.MessageBoxOptions = {
        type: 'question',
        buttons: ['Allow this time', 'Not now'],
        defaultId: 1,
        cancelId: 1,
        title: 'Möbius permission',
        message: permission === 'media'
          ? 'Allow this Möbius to use the camera or microphone?'
          : 'Allow this Möbius to show desktop notifications?',
        detail: `Requested by ${origin}. This does not grant access to Docker or local folders.`,
      };
      const prompt = parent
        ? dialog.showMessageBox(parent, options)
        : dialog.showMessageBox(options);
      void prompt.then(({ response }) => {
        if (response === 0) granted.add(key);
        callback(response === 0);
      }).catch(() => callback(false));
    });
  }

  openInstance(instance: SavedInstance): void {
    const existing = this.instanceWindows.get(instance.id);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return;
    }

    const partition = partitionFor(instance.origin);
    const remoteSession = session.fromPartition(partition, { cache: true });
    this.configureRemoteSession(remoteSession, partition);
    const icon = path.join(app.getAppPath(), 'assets', 'icons', 'icon.png');
    const window = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 840,
      minHeight: 620,
      title: `${instance.name} · Möbius`,
      backgroundColor: '#0d0d0f',
      icon,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: remoteSession,
        webSecurity: true,
      },
    });
    this.instanceWindows.set(instance.id, window);
    const allowedOrigins = allowedNavigationOrigins(instance.origin);

    window.webContents.setWindowOpenHandler(({ url }) => {
      let origin = '';
      try {
        origin = new URL(url).origin;
      } catch {
        return { action: 'deny' };
      }
      if (allowedOrigins.has(origin)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: window,
            autoHideMenuBar: true,
            backgroundColor: '#0d0d0f',
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              session: remoteSession,
              webSecurity: true,
            },
          },
        };
      }
      if (isSafeWebOrigin(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
      let origin = '';
      try {
        origin = new URL(url).origin;
      } catch {
        event.preventDefault();
        return;
      }
      if (!allowedOrigins.has(origin)) {
        event.preventDefault();
        if (isSafeWebOrigin(url)) void shell.openExternal(url);
      }
    });

    window.once('ready-to-show', () => window.show());
    window.on('closed', () => {
      this.instanceWindows.delete(instance.id);
      this.showLauncher();
    });
    void window.loadURL(`${instance.origin}/shell/`);
  }

  installMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      ...(process.platform === 'darwin'
        ? [{
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          }]
        : []),
      {
        label: 'File',
        submenu: [
          {
            label: 'Back to deployments',
            accelerator: 'CmdOrCtrl+Shift+H',
            click: () => this.showLauncher(),
          },
          { type: 'separator' },
          process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
          { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
          { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
          { type: 'separator' }, { role: 'togglefullscreen' },
        ],
      },
      {
        role: 'help',
        submenu: [
          {
            label: 'Möbius documentation',
            click: () => void shell.openExternal('https://github.com/mobius-os/mobius'),
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}
