import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';

import { DockerService } from './main/docker-service';
import { normalizeInstanceOrigin, verifyMobiusOrigin } from './main/instance-url';
import { DEFAULT_LOCAL_IMAGE, StateStore } from './main/state-store';
import { WindowManager } from './main/window-manager';
import type {
  LocalProgressPhase,
  SaveInstanceInput,
  SharedFolder,
  StartLocalInput,
} from './shared/contracts';

app.enableSandbox();

let launcherWindow: BrowserWindow | null = null;
let store: StateStore;
const docker = new DockerService();
const windows = new WindowManager();

function requireLauncherSender(event: Electron.IpcMainInvokeEvent): void {
  if (!launcherWindow || event.sender !== launcherWindow.webContents) {
    throw new Error('This desktop action is available only to the packaged launcher.');
  }
}

function cleanName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 80) {
    throw new Error('Use a name between 1 and 80 characters.');
  }
  return name;
}

function safeFolderName(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 32);
  return cleaned || 'folder';
}

function sendProgress(phase: LocalProgressPhase): void {
  if (!launcherWindow?.isDestroyed()) {
    launcherWindow?.webContents.send('desktop:local-progress', phase);
  }
}

async function registerIpc(): Promise<void> {
  ipcMain.handle('desktop:get-state', async (event) => {
    requireLauncherSender(event);
    return store.read();
  });

  ipcMain.handle('desktop:save-instance', async (event, input: SaveInstanceInput) => {
    requireLauncherSender(event);
    if (!input || !['hosted', 'existing'].includes(input.kind)) {
      throw new Error('Choose a supported deployment type.');
    }
    const origin = await verifyMobiusOrigin(input.url);
    const state = await store.read();
    const matching = state.instances.find((instance) => instance.origin === origin);
    const instance = {
      id: matching?.id ?? randomUUID(),
      kind: input.kind,
      name: cleanName(input.name),
      origin,
      createdAt: matching?.createdAt ?? new Date().toISOString(),
      lastOpenedAt: matching?.lastOpenedAt ?? null,
    };
    await store.upsertInstance(instance);
    return instance;
  });

  ipcMain.handle('desktop:remove-instance', async (event, id: string) => {
    requireLauncherSender(event);
    if (typeof id !== 'string' || !id) throw new Error('Choose a saved Möbius.');
    return store.removeInstance(id);
  });

  ipcMain.handle('desktop:open-instance', async (event, id: string) => {
    requireLauncherSender(event);
    const instance = await store.markOpened(id);
    if (!instance) throw new Error('That saved Möbius is no longer available.');
    windows.openInstance(instance);
  });

  ipcMain.handle('desktop:open-instance-browser', async (event, id: string) => {
    requireLauncherSender(event);
    if (typeof id !== 'string' || !id) throw new Error('Choose a saved Möbius.');
    const state = await store.read();
    const instance = state.instances.find((candidate) => candidate.id === id);
    if (!instance) throw new Error('That saved Möbius is no longer available.');
    await shell.openExternal(`${instance.origin}/shell/`);
  });

  ipcMain.handle('desktop:open-hosted-setup', async (event) => {
    requireLauncherSender(event);
    await shell.openExternal('https://www.mobius.you/');
  });

  ipcMain.handle('desktop:open-external', async (event, raw: string) => {
    requireLauncherSender(event);
    if (typeof raw !== 'string') throw new Error('Choose a valid help link.');
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') throw new Error('External help links must use HTTPS.');
    await shell.openExternal(parsed.toString());
  });

  ipcMain.handle('desktop:choose-folder', async (event, existing: SharedFolder[]) => {
    requireLauncherSender(event);
    if (!Array.isArray(existing)) throw new Error('Shared folder state is invalid.');
    const options: Electron.OpenDialogOptions = {
      title: 'Share a folder with local Möbius',
      buttonLabel: 'Share this folder',
      properties: ['openDirectory', 'createDirectory'],
    };
    const selection = launcherWindow
      ? await dialog.showOpenDialog(launcherWindow, options)
      : await dialog.showOpenDialog(options);
    const hostPath = selection.filePaths[0];
    if (selection.canceled || !hostPath) return null;
    const duplicate = existing.find((folder) => folder.hostPath === hostPath);
    if (duplicate) return duplicate;
    const id = randomUUID();
    const name = path.basename(hostPath) || 'Folder';
    return {
      id,
      name,
      hostPath,
      containerPath: `/data/shared/desktop/${safeFolderName(name)}-${id.slice(0, 6)}`,
      readOnly: false,
    } satisfies SharedFolder;
  });

  ipcMain.handle('desktop:get-local-status', async (event) => {
    requireLauncherSender(event);
    const state = await store.read();
    const status = await docker.availability();
    status.origin = `http://127.0.0.1:${state.localRuntime.port}`;
    return status;
  });

  ipcMain.handle('desktop:start-local', async (event, input: StartLocalInput) => {
    requireLauncherSender(event);
    if (!input || !Array.isArray(input.sharedFolders)) {
      throw new Error('Shared folder state is invalid.');
    }
    const state = await store.read();
    const localRuntime = {
      image: state.localRuntime.image || DEFAULT_LOCAL_IMAGE,
      port: state.localRuntime.port,
      sharedFolders: input.sharedFolders,
    };
    const status = await docker.start(localRuntime, sendProgress);
    await store.saveLocalRuntime(localRuntime);
    const current = (await store.read()).instances.find((instance) => instance.kind === 'local');
    const instance = {
      id: current?.id ?? randomUUID(),
      kind: 'local' as const,
      name: current?.name ?? 'Local Möbius',
      origin: normalizeInstanceOrigin(status.origin),
      createdAt: current?.createdAt ?? new Date().toISOString(),
      lastOpenedAt: current?.lastOpenedAt ?? null,
    };
    await store.upsertInstance(instance);
    return instance;
  });

  ipcMain.handle('desktop:stop-local', async (event) => {
    requireLauncherSender(event);
    const state = await store.read();
    const origin = `http://127.0.0.1:${state.localRuntime.port}`;
    return docker.stop(origin);
  });
}

function createLauncherWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 640,
    show: false,
    title: 'Möbius Desktop',
    backgroundColor: '#f5f5f7',
    icon: path.join(app.getAppPath(), 'assets', 'icons', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  return window;
}

void app.whenReady().then(async () => {
  store = new StateStore(path.join(app.getPath('userData'), 'state.json'));
  await registerIpc();
  launcherWindow = createLauncherWindow();
  windows.setLauncherWindow(launcherWindow);
  windows.installMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      launcherWindow = createLauncherWindow();
      windows.setLauncherWindow(launcherWindow);
    } else {
      windows.showLauncher();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
