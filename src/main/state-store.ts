import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DesktopState,
  LocalRuntimeSettings,
  SavedInstance,
  SharedFolder,
} from '../shared/contracts';

export const DEFAULT_LOCAL_IMAGE = 'ghcr.io/mobius-os/mobius:main';
export const DEFAULT_LOCAL_PORT = 15123;

function defaultLocalRuntime(): LocalRuntimeSettings {
  return {
    image: DEFAULT_LOCAL_IMAGE,
    port: DEFAULT_LOCAL_PORT,
    sharedFolders: [],
  };
}

function defaultState(): DesktopState {
  return {
    version: 1,
    instances: [],
    localRuntime: defaultLocalRuntime(),
  };
}

function isSharedFolder(value: unknown): value is SharedFolder {
  if (!value || typeof value !== 'object') return false;
  const folder = value as Partial<SharedFolder>;
  return (
    typeof folder.id === 'string'
    && typeof folder.name === 'string'
    && typeof folder.hostPath === 'string'
    && typeof folder.containerPath === 'string'
    && typeof folder.readOnly === 'boolean'
  );
}

function isSavedInstance(value: unknown): value is SavedInstance {
  if (!value || typeof value !== 'object') return false;
  const instance = value as Partial<SavedInstance>;
  return (
    typeof instance.id === 'string'
    && ['hosted', 'existing', 'local'].includes(instance.kind ?? '')
    && typeof instance.name === 'string'
    && typeof instance.origin === 'string'
    && typeof instance.createdAt === 'string'
    && (instance.lastOpenedAt === null || typeof instance.lastOpenedAt === 'string')
  );
}

export function normalizeState(value: unknown): DesktopState {
  if (!value || typeof value !== 'object') return defaultState();
  const candidate = value as Partial<DesktopState>;
  if (candidate.version !== 1) return defaultState();

  const local = candidate.localRuntime;
  return {
    version: 1,
    instances: Array.isArray(candidate.instances)
      ? candidate.instances.filter(isSavedInstance)
      : [],
    localRuntime: {
      image: typeof local?.image === 'string' ? local.image : DEFAULT_LOCAL_IMAGE,
      port: Number.isInteger(local?.port) && Number(local?.port) >= 1024 && Number(local?.port) <= 65535
        ? Number(local?.port)
        : DEFAULT_LOCAL_PORT,
      sharedFolders: Array.isArray(local?.sharedFolders)
        ? local.sharedFolders.filter(isSharedFolder)
        : [],
    },
  };
}

export class StateStore {
  private state: DesktopState | null = null;

  constructor(private readonly filePath: string) {}

  async read(): Promise<DesktopState> {
    if (this.state) return structuredClone(this.state);
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.state = normalizeState(JSON.parse(raw));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      this.state = defaultState();
    }
    return structuredClone(this.state);
  }

  async write(next: DesktopState): Promise<DesktopState> {
    const normalized = normalizeState(next);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
    this.state = normalized;
    return structuredClone(normalized);
  }

  async upsertInstance(instance: SavedInstance): Promise<DesktopState> {
    const state = await this.read();
    const index = state.instances.findIndex((item) => (
      item.id === instance.id || (instance.kind === 'local' && item.kind === 'local')
    ));
    if (index >= 0) state.instances[index] = instance;
    else state.instances.push(instance);
    return this.write(state);
  }

  async removeInstance(id: string): Promise<DesktopState> {
    const state = await this.read();
    state.instances = state.instances.filter((instance) => instance.id !== id);
    return this.write(state);
  }

  async saveLocalRuntime(settings: LocalRuntimeSettings): Promise<DesktopState> {
    const state = await this.read();
    state.localRuntime = settings;
    return this.write(state);
  }

  async markOpened(id: string): Promise<SavedInstance | null> {
    const state = await this.read();
    const instance = state.instances.find((item) => item.id === id);
    if (!instance) return null;
    instance.lastOpenedAt = new Date().toISOString();
    await this.write(state);
    return structuredClone(instance);
  }
}
