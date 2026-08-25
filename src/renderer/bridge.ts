import type {
  DesktopApi,
  DesktopState,
  LocalProgressPhase,
  LocalRuntimeStatus,
  SavedInstance,
  SharedFolder,
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
  version: 1,
  instances: previewInstances,
  localRuntime: {
    image: 'ghcr.io/mobius-os/mobius:main',
    port: 15123,
    sharedFolders: scenario === 'local'
      ? [{
          id: 'preview-folder',
          name: 'Projects',
          hostPath: '/Users/you/Projects',
          containerPath: '/data/shared/desktop/projects-preview',
          readOnly: false,
        }]
      : [],
  },
};

const previewListeners = new Set<(phase: LocalProgressPhase) => void>();
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
  async chooseFolder(existing) {
    const folder: SharedFolder = {
      id: crypto.randomUUID(),
      name: 'Client work',
      hostPath: '/Users/you/Documents/Client work',
      containerPath: `/data/shared/desktop/client-work-${existing.length + 1}`,
      readOnly: false,
    };
    return folder;
  },
  async getLocalStatus(): Promise<LocalRuntimeStatus> {
    if (dockerScenario === 'missing') {
      return {
        docker: 'missing',
        dockerVersion: null,
        container: 'unknown',
        detail: 'Docker is not installed on this computer.',
        origin: 'http://127.0.0.1:15123',
      };
    }
    if (dockerScenario === 'stopped') {
      return {
        docker: 'stopped',
        dockerVersion: null,
        container: 'unknown',
        detail: 'Docker is installed, but its engine is not running.',
        origin: 'http://127.0.0.1:15123',
      };
    }
    if (dockerScenario === 'error') {
      return {
        docker: 'error',
        dockerVersion: null,
        container: 'unknown',
        detail: 'Möbius Desktop could not check Docker.',
        origin: 'http://127.0.0.1:15123',
      };
    }
    return {
      docker: 'ready',
      dockerVersion: '29.1.0',
      container: scenario === 'home' ? 'running' : 'absent',
      detail: 'Docker is ready.',
      origin: 'http://127.0.0.1:15123',
    };
  },
  async startLocal(input) {
    for (const phase of ['checking-docker', 'downloading', 'creating', 'waiting', 'ready'] as LocalProgressPhase[]) {
      previewListeners.forEach((listener) => listener(phase));
      await delay(160);
    }
    previewState.localRuntime.sharedFolders = input.sharedFolders;
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
    };
  },
  onLocalProgress(listener) {
    previewListeners.add(listener);
    return () => previewListeners.delete(listener);
  },
};

export function desktopApi(): DesktopApi {
  if (window.mobiusDesktop) return window.mobiusDesktop;
  if (import.meta.env.DEV) return previewApi;
  throw new Error('Möbius Desktop could not start its secure desktop bridge.');
}
