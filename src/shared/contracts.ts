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
  version: 2;
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
  image: string;
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
  folders: Array<Pick<SharedFolder, 'id' | 'readOnly'>>;
}

export interface DesktopDiagnostics {
  appVersion: string;
  operatingSystem: string;
  architecture: string;
  stateVersion: number;
  image: string;
  port: number;
  docker: DockerAvailability;
  dockerVersion: string | null;
  container: ContainerState;
}

export interface UpdateCheck {
  configured: boolean;
  currentVersion: string;
  available: boolean;
  version: string | null;
  body: string | null;
}

export interface UpdateInstallProgress {
  downloadedBytes: number;
  totalBytes: number | null;
}

export interface DesktopApi {
  getState(): Promise<DesktopState>;
  saveInstance(input: SaveInstanceInput): Promise<SavedInstance>;
  removeInstance(id: string): Promise<DesktopState>;
  openInstance(id: string): Promise<void>;
  openInstanceInBrowser(id: string): Promise<void>;
  openHostedSetup(): Promise<void>;
  openExternal(url: string): Promise<void>;
  chooseFolder(): Promise<SharedFolder | null>;
  getLocalStatus(): Promise<LocalRuntimeStatus>;
  startLocal(input: StartLocalInput): Promise<SavedInstance>;
  stopLocal(): Promise<LocalRuntimeStatus>;
  getDiagnostics(): Promise<DesktopDiagnostics>;
  checkForUpdate(): Promise<UpdateCheck>;
  installUpdate(expectedVersion: string): Promise<void>;
  onLocalProgress(listener: (phase: LocalProgressPhase) => void): () => void;
  onUpdateProgress(listener: (progress: UpdateInstallProgress) => void): () => void;
}
