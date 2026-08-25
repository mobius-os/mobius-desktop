export type InstanceKind = 'hosted' | 'existing' | 'local';

export interface SharedFolder {
  id: string;
  name: string;
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

export interface SavedInstance {
  id: string;
  kind: InstanceKind;
  name: string;
  origin: string;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface LocalRuntimeSettings {
  image: string;
  port: number;
  sharedFolders: SharedFolder[];
}

export interface DesktopState {
  version: 1;
  instances: SavedInstance[];
  localRuntime: LocalRuntimeSettings;
}

export type DockerAvailability = 'ready' | 'missing' | 'stopped' | 'error';
export type ContainerState = 'absent' | 'created' | 'running' | 'stopped' | 'unknown';

export interface LocalRuntimeStatus {
  docker: DockerAvailability;
  dockerVersion: string | null;
  container: ContainerState;
  detail: string;
  origin: string;
}

export type LocalProgressPhase =
  | 'checking-docker'
  | 'downloading'
  | 'preserving-data'
  | 'creating'
  | 'starting'
  | 'waiting'
  | 'ready';

export interface SaveInstanceInput {
  kind: Exclude<InstanceKind, 'local'>;
  name: string;
  url: string;
}

export interface StartLocalInput {
  sharedFolders: SharedFolder[];
}

export interface DesktopApi {
  getState(): Promise<DesktopState>;
  saveInstance(input: SaveInstanceInput): Promise<SavedInstance>;
  removeInstance(id: string): Promise<DesktopState>;
  openInstance(id: string): Promise<void>;
  openInstanceInBrowser(id: string): Promise<void>;
  openHostedSetup(): Promise<void>;
  openExternal(url: string): Promise<void>;
  chooseFolder(existing: SharedFolder[]): Promise<SharedFolder | null>;
  getLocalStatus(): Promise<LocalRuntimeStatus>;
  startLocal(input: StartLocalInput): Promise<SavedInstance>;
  stopLocal(): Promise<LocalRuntimeStatus>;
  onLocalProgress(listener: (phase: LocalProgressPhase) => void): () => void;
}

declare global {
  interface Window {
    mobiusDesktop?: DesktopApi;
  }
}
