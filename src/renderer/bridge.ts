import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type {
  DesktopApi,
  DesktopState,
  LocalProgressPhase,
  LocalRuntimeStatus,
  SavedInstance,
  SharedFolder,
  UpdateInstallProgress,
} from '../shared/contracts';

export type PreviewScreen = 'home' | 'hosted' | 'existing' | 'local' | null;

const scenario = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('scenario')
  : null;
const dockerScenario = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('docker')
  : null;
const externalScenario = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('external')
  : null;
const containerScenario = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('container')
  : null;

export const previewScreen: PreviewScreen = (
  ['home', 'hosted', 'existing', 'local'].includes(scenario ?? '')
    ? scenario
    : null
) as PreviewScreen;

const previewInstances: SavedInstance[] = scenario === 'home'
  ? [
      {
        id: 'hosted-preview',
        kind: 'hosted',
        name: 'My Möbius',
        origin: 'https://my-mobius.example',
        createdAt: '2026-08-20T09:00:00.000Z',
        lastOpenedAt: '2026-08-25T08:30:00.000Z',
      },
      {
        id: 'local-preview',
        kind: 'local',
        name: 'Local Möbius',
        origin: 'http://127.0.0.1:15123',
        createdAt: '2026-08-24T12:00:00.000Z',
        lastOpenedAt: null,
      },
    ]
  : [];

let previewState: DesktopState = {
  version: 2,
  instances: previewInstances,
  localRuntime: {
    image: 'ghcr.io/mobius-os/mobius@sha256:8a1c8f876fb598c1a2f130dfe2333ef2b9e6c52876fbb7749e7524e39bcbef5a',
    port: 15123,
    sharedFolders: scenario === 'local'
      ? [{
          id: 'preview-folder',
          name: 'Projects',
          hostPath: '/Users/you/Projects',
          containerPath: '/data/shared/desktop/projects-preview',
          readOnly: true,
        }]
      : [],
  },
};

const previewListeners = new Set<(phase: LocalProgressPhase) => void>();
const previewUpdateListeners = new Set<(progress: UpdateInstallProgress) => void>();
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const previewApi: DesktopApi = {
  async getState() {
    return structuredClone(previewState);
  },
  async saveInstance(input) {
    await delay(350);
    const instance: SavedInstance = {
      id: crypto.randomUUID(),
      kind: input.kind,
      name: input.name,
      origin: input.url || 'https://my-mobius.example',
      createdAt: new Date().toISOString(),
      lastOpenedAt: null,
    };
    previewState.instances.push(instance);
    return structuredClone(instance);
  },
  async removeInstance(id) {
    previewState.instances = previewState.instances.filter((instance) => instance.id !== id);
    return structuredClone(previewState);
  },
  async openInstance() {},
  async openInstanceInBrowser() {},
  async openHostedSetup() {
    if (externalScenario === 'fail') throw new Error('The operating system rejected the browser request.');
  },
  async openExternal() {
    if (externalScenario === 'fail') throw new Error('The operating system rejected the browser request.');
  },
  async chooseFolder() {
    const folder: SharedFolder = {
      id: crypto.randomUUID(),
      name: 'Client work',
      hostPath: '/Users/you/Documents/Client work',
      containerPath: `/data/shared/desktop/client-work-${previewState.localRuntime.sharedFolders.length + 1}`,
      readOnly: true,
    };
    previewState.localRuntime.sharedFolders.push(folder);
    return structuredClone(folder);
  },
  async getLocalStatus(): Promise<LocalRuntimeStatus> {
    if (dockerScenario === 'missing') {
      return {
        docker: 'missing',
        dockerVersion: null,
        container: 'unknown',
        detail: 'Docker is not installed on this computer.',
        origin: 'http://127.0.0.1:15123',
        image: previewState.localRuntime.image,
      };
    }
    if (dockerScenario === 'stopped') {
      return {
        docker: 'stopped',
        dockerVersion: null,
        container: 'unknown',
        detail: 'Docker is installed, but its engine is not running.',
        origin: 'http://127.0.0.1:15123',
        image: previewState.localRuntime.image,
      };
    }
    if (dockerScenario === 'error') {
      return {
        docker: 'error',
        dockerVersion: null,
        container: 'unknown',
        detail: 'Möbius Desktop could not check Docker.',
        origin: 'http://127.0.0.1:15123',
        image: previewState.localRuntime.image,
      };
    }
    return {
      docker: 'ready',
      dockerVersion: '29.1.0',
      container: containerScenario === 'stopped' ? 'stopped' : scenario === 'home' ? 'running' : 'absent',
      detail: 'Docker is ready.',
      origin: 'http://127.0.0.1:15123',
      image: previewState.localRuntime.image,
    };
  },
  async startLocal(input) {
    for (const phase of ['checking-docker', 'downloading', 'creating', 'waiting', 'ready'] as LocalProgressPhase[]) {
      previewListeners.forEach((listener) => listener(phase));
      await delay(160);
    }
    previewState.localRuntime.sharedFolders = previewState.localRuntime.sharedFolders
      .filter((folder) => input.folders.some((selection) => selection.id === folder.id))
      .map((folder) => ({
        ...folder,
        readOnly: input.folders.find((selection) => selection.id === folder.id)?.readOnly ?? true,
      }));
    const instance: SavedInstance = {
      id: 'local-preview',
      kind: 'local',
      name: 'Local Möbius',
      origin: 'http://127.0.0.1:15123',
      createdAt: new Date().toISOString(),
      lastOpenedAt: null,
    };
    previewState.instances = [
      ...previewState.instances.filter((item) => item.kind !== 'local'),
      instance,
    ];
    return instance;
  },
  async stopLocal() {
    return {
      docker: 'ready',
      dockerVersion: '29.1.0',
      container: 'stopped',
      detail: 'The local Möbius is stopped. Its Docker data was kept.',
      origin: 'http://127.0.0.1:15123',
      image: previewState.localRuntime.image,
    };
  },
  async getDiagnostics() {
    return {
      appVersion: '0.1.0-preview',
      operatingSystem: 'preview',
      architecture: 'preview',
      stateVersion: previewState.version,
      image: previewState.localRuntime.image,
      port: previewState.localRuntime.port,
      docker: 'ready',
      dockerVersion: '29.1.0',
      container: containerScenario === 'stopped' ? 'stopped' : scenario === 'home' ? 'running' : 'absent',
    };
  },
  async checkForUpdate() {
    await delay(250);
    return {
      configured: false,
      currentVersion: '0.1.0-preview',
      available: false,
      version: null,
      body: null,
    };
  },
  async installUpdate(_expectedVersion) {
    previewUpdateListeners.forEach((listener) => listener({ downloadedBytes: 50, totalBytes: 100 }));
    await delay(300);
  },
  onLocalProgress(listener) {
    previewListeners.add(listener);
    return () => previewListeners.delete(listener);
  },
  onUpdateProgress(listener) {
    previewUpdateListeners.add(listener);
    return () => previewUpdateListeners.delete(listener);
  },
};

const liveApi: DesktopApi = {
  getState: () => invoke('get_state'),
  saveInstance: (input) => invoke('save_instance', { input }),
  removeInstance: (id) => invoke('remove_instance', { id }),
  openInstance: (id) => invoke('open_instance', { id }),
  openInstanceInBrowser: (id) => invoke('open_instance_in_browser', { id }),
  openHostedSetup: () => invoke('open_hosted_setup'),
  openExternal: (url) => invoke('open_external', { url }),
  chooseFolder: () => invoke('choose_folder'),
  getLocalStatus: () => invoke('get_local_status'),
  startLocal: (input) => invoke('start_local', { input }),
  stopLocal: () => invoke('stop_local'),
  getDiagnostics: () => invoke('get_diagnostics'),
  checkForUpdate: () => invoke('check_for_update'),
  installUpdate: (expectedVersion) => invoke('install_update', { expectedVersion }),
  onLocalProgress(listener) {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<LocalProgressPhase>('local-progress', (event) => listener(event.payload))
      .then((removeListener) => {
        if (disposed) removeListener();
        else unlisten = removeListener;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  },
  onUpdateProgress(listener) {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<UpdateInstallProgress>('update-progress', (event) => listener(event.payload))
      .then((removeListener) => {
        if (disposed) removeListener();
        else unlisten = removeListener;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  },
};

const unavailable = async (): Promise<never> => {
  throw new Error('Möbius Desktop could not start its secure desktop bridge. Reinstall the app and try again.');
};

const unavailableApi: DesktopApi = {
  getState: unavailable,
  saveInstance: unavailable,
  removeInstance: unavailable,
  openInstance: unavailable,
  openInstanceInBrowser: unavailable,
  openHostedSetup: unavailable,
  openExternal: unavailable,
  chooseFolder: unavailable,
  getLocalStatus: unavailable,
  startLocal: unavailable,
  stopLocal: unavailable,
  getDiagnostics: unavailable,
  checkForUpdate: unavailable,
  installUpdate: unavailable,
  onLocalProgress: () => () => {},
  onUpdateProgress: () => () => {},
};

export function desktopApi(): DesktopApi {
  if (isTauri()) return liveApi;
  if (import.meta.env.DEV) return previewApi;
  return unavailableApi;
}
