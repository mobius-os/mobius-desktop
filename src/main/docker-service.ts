import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
  ContainerState,
  LocalProgressPhase,
  LocalRuntimeSettings,
  LocalRuntimeStatus,
  SharedFolder,
} from '../shared/contracts';
import {
  CommandExecutionError,
  type CommandResult,
  type CommandRunner,
  runCommand,
} from './command-runner';

export const LOCAL_CONTAINER_NAME = 'mobius-desktop';
export const LOCAL_DATA_VOLUME = 'mobius-desktop-data';
export const OWNERSHIP_LABEL = 'you.mobius.desktop.managed=true';
// Fingerprint of the create arguments a container was made with. A stopped
// container whose fingerprint and image still match is started as-is.
export const SETTINGS_LABEL_KEY = 'you.mobius.desktop.settings';

interface ContainerInspection {
  owned: boolean;
  state: ContainerState;
  settingsFingerprint: string | null;
  imageId: string | null;
}

export class DockerServiceError extends Error {
  constructor(message: string, readonly technicalDetail = '') {
    super(message);
    this.name = 'DockerServiceError';
  }
}

function cleanDetail(result: CommandResult): string {
  return (result.stderr || result.stdout).trim().split('\n').slice(-8).join('\n');
}

function validHostPath(value: string): boolean {
  return (
    (path.isAbsolute(value) || path.win32.isAbsolute(value))
    && !value.includes('\0')
    && !value.includes(',')
  );
}

function validateFolder(folder: SharedFolder): void {
  if (!validHostPath(folder.hostPath)) {
    throw new DockerServiceError(
      `“${folder.name}” cannot be shared because its path is not supported.`,
      'Bind-mount source must be absolute and cannot contain commas.',
    );
  }
  if (!folder.containerPath.startsWith('/data/shared/desktop/')) {
    throw new DockerServiceError('A shared folder had an unsafe container destination.');
  }
}

function settingsArguments(settings: LocalRuntimeSettings): string[] {
  if (!Number.isInteger(settings.port) || settings.port < 1024 || settings.port > 65535) {
    throw new DockerServiceError('Choose a local port between 1024 and 65535.');
  }

  const origin = `http://127.0.0.1:${settings.port}`;
  const args = [
    'container', 'create',
    '--name', LOCAL_CONTAINER_NAME,
    '--label', OWNERSHIP_LABEL,
    '--init',
    '--restart', 'unless-stopped',
    '--publish', `127.0.0.1:${settings.port}:8000`,
    '--env', `FRONTEND_ORIGIN=${origin}`,
    '--env', `MOBIUS_ACCOUNT_CLIENT_ORIGIN=${origin}`,
    '--env', 'MOBIUS_ACCOUNT_ORIGIN=https://www.mobius.you',
    '--env', 'MOBIUS_AGENT_SUDO=1',
    '--mount', `type=volume,source=${LOCAL_DATA_VOLUME},target=/data`,
  ];

  for (const folder of settings.sharedFolders) {
    validateFolder(folder);
    const parts = [
      'type=bind',
      `source=${folder.hostPath}`,
      `target=${folder.containerPath}`,
    ];
    if (folder.readOnly) parts.push('readonly');
    args.push('--mount', parts.join(','));
  }
  args.push(settings.image);
  return args;
}

export function settingsFingerprint(settings: LocalRuntimeSettings): string {
  return createHash('sha256')
    .update(JSON.stringify(settingsArguments(settings)))
    .digest('hex')
    .slice(0, 32);
}

export function buildCreateArguments(settings: LocalRuntimeSettings): string[] {
  const args = settingsArguments(settings);
  const image = args.pop() as string;
  args.push('--label', `${SETTINGS_LABEL_KEY}=${settingsFingerprint(settings)}`, image);
  return args;
}

export class DockerService {
  constructor(
    private readonly runner: CommandRunner = runCommand,
    private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (milliseconds: number) => Promise<void> = (
      milliseconds,
    ) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  private backgroundPull: Promise<void> | null = null;

  private async docker(args: readonly string[], timeoutMs?: number): Promise<CommandResult> {
    return this.runner('docker', args, timeoutMs);
  }

  async availability(): Promise<LocalRuntimeStatus> {
    try {
      const version = await this.docker(['version', '--format', '{{.Server.Version}}'], 10_000);
      if (version.code !== 0) {
        return {
          docker: 'stopped',
          dockerVersion: null,
          container: 'unknown',
          detail: 'Docker is installed, but its engine is not running.',
          origin: '',
        };
      }
      const inspection = await this.inspectContainer();
      return {
        docker: 'ready',
        dockerVersion: version.stdout.trim() || null,
        container: inspection.state,
        detail: inspection.owned
          ? 'Docker is ready and the local Möbius belongs to this app.'
          : inspection.state === 'absent'
            ? 'Docker is ready.'
            : 'A different container is using the Möbius Desktop name.',
        origin: '',
      };
    } catch (error) {
      if (error instanceof CommandExecutionError && error.causeCode === 'ENOENT') {
        return {
          docker: 'missing',
          dockerVersion: null,
          container: 'unknown',
          detail: 'Docker is not installed on this computer.',
          origin: '',
        };
      }
      return {
        docker: 'error',
        dockerVersion: null,
        container: 'unknown',
        detail: 'Möbius Desktop could not check Docker.',
        origin: '',
      };
    }
  }

  private async inspectContainer(): Promise<ContainerInspection> {
    const result = await this.docker(['container', 'inspect', LOCAL_CONTAINER_NAME], 10_000);
    if (result.code !== 0) {
      const detail = cleanDetail(result).toLowerCase();
      if (detail.includes('no such container') || detail.includes('not found')) {
        return { owned: false, state: 'absent', settingsFingerprint: null, imageId: null };
      }
      throw new DockerServiceError('Docker could not inspect the local Möbius.', cleanDetail(result));
    }
    try {
      const parsed = JSON.parse(result.stdout) as Array<{
        Config?: { Labels?: Record<string, string> };
        State?: { Status?: string };
        Image?: string;
      }>;
      const container = parsed[0];
      const labels = container?.Config?.Labels ?? {};
      const owned = labels['you.mobius.desktop.managed'] === 'true';
      const rawState = container?.State?.Status;
      const state: ContainerState = rawState === 'running'
        ? 'running'
        : rawState === 'created'
          ? 'created'
          : rawState === 'exited'
            ? 'stopped'
            : 'unknown';
      return {
        owned,
        state,
        settingsFingerprint: labels[SETTINGS_LABEL_KEY] ?? null,
        imageId: container?.Image ?? null,
      };
    } catch {
      throw new DockerServiceError('Docker returned an unreadable container description.');
    }
  }

  private async requireDocker(): Promise<void> {
    const status = await this.availability();
    if (status.docker === 'missing') {
      throw new DockerServiceError('Install Docker Desktop before starting a local Möbius.');
    }
    if (status.docker !== 'ready') {
      throw new DockerServiceError('Start Docker, then try again.');
    }
  }

  private async localImageId(image: string): Promise<string | null> {
    const result = await this.docker(['image', 'inspect', '--format', '{{.Id}}', image], 20_000);
    return result.code === 0 ? result.stdout.trim() || null : null;
  }

  // Only a computer without the image waits for a download; otherwise the
  // local copy is used and pullInBackground keeps it current.
  private async ensureImage(image: string): Promise<void> {
    if (await this.localImageId(image)) return;
    const pull = await this.docker(['image', 'pull', image], 10 * 60_000);
    if (pull.code === 0) return;
    throw new DockerServiceError('Möbius could not be downloaded.', cleanDetail(pull));
  }

  // Refreshes the image tag after a start without delaying it. A newer image
  // no longer matches the container's image id, so the next start recreates
  // the container from it (keeping the data volume).
  private pullInBackground(image: string): void {
    if (this.backgroundPull) return;
    this.backgroundPull = this.docker(['image', 'pull', image], 10 * 60_000)
      .then(() => undefined, () => undefined)
      .finally(() => { this.backgroundPull = null; });
  }

  // Waits for a background image refresh (used by tests).
  async settleBackgroundWork(): Promise<void> {
    await this.backgroundPull;
  }

  private async waitUntilReady(origin: string): Promise<void> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      try {
        const response = await this.fetcher(`${origin}/api/ready`, {
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        });
        if (response.ok) {
          const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
          if (payload?.status === 'ready') return;
        }
      } catch {
        // The container is still starting; the bounded deadline owns failure.
      }
      await this.wait(1_500);
    }
    const logs = await this.docker(['container', 'logs', '--tail', '80', LOCAL_CONTAINER_NAME], 20_000);
    throw new DockerServiceError(
      'The local Möbius started, but did not become ready in time.',
      cleanDetail(logs),
    );
  }

  async start(
    settings: LocalRuntimeSettings,
    onProgress: (phase: LocalProgressPhase) => void = () => undefined,
  ): Promise<LocalRuntimeStatus> {
    onProgress('checking-docker');
    await this.requireDocker();
    const existing = await this.inspectContainer();
    if (existing.state !== 'absent' && !existing.owned) {
      throw new DockerServiceError(
        'A different Docker container is already named “mobius-desktop”.',
        'Rename or remove that container before Möbius Desktop manages this name.',
      );
    }

    const origin = `http://127.0.0.1:${settings.port}`;
    if (
      existing.owned
      && (existing.state === 'stopped' || existing.state === 'created' || existing.state === 'running')
      && existing.settingsFingerprint === settingsFingerprint(settings)
      && existing.imageId !== null
      && existing.imageId === await this.localImageId(settings.image)
    ) {
      return this.startExisting(existing.state, settings.image, origin, onProgress);
    }

    onProgress('downloading');
    await this.ensureImage(settings.image);

    onProgress('preserving-data');
    const volume = await this.docker(['volume', 'create', LOCAL_DATA_VOLUME], 30_000);
    if (volume.code !== 0) {
      throw new DockerServiceError('Docker could not prepare persistent local data.', cleanDetail(volume));
    }
    if (existing.state !== 'absent') {
      const remove = await this.docker(['container', 'rm', '--force', LOCAL_CONTAINER_NAME], 60_000);
      if (remove.code !== 0) {
        throw new DockerServiceError('Docker could not refresh the local Möbius container.', cleanDetail(remove));
      }
    }

    onProgress('creating');
    const create = await this.docker(buildCreateArguments(settings), 10 * 60_000);
    if (create.code !== 0) {
      throw new DockerServiceError('Docker could not create the local Möbius.', cleanDetail(create));
    }

    onProgress('starting');
    const start = await this.docker(['container', 'start', LOCAL_CONTAINER_NAME], 60_000);
    if (start.code !== 0) {
      throw new DockerServiceError('Docker could not start the local Möbius.', cleanDetail(start));
    }

    onProgress('waiting');
    await this.waitUntilReady(origin);
    onProgress('ready');
    this.pullInBackground(settings.image);
    return {
      docker: 'ready',
      dockerVersion: null,
      container: 'running',
      detail: 'Your local Möbius is ready.',
      origin,
    };
  }

  // The container already matches the requested settings and the local image:
  // start it as-is instead of downloading and recreating it.
  private async startExisting(
    state: ContainerState,
    image: string,
    origin: string,
    onProgress: (phase: LocalProgressPhase) => void,
  ): Promise<LocalRuntimeStatus> {
    if (state !== 'running') {
      onProgress('starting');
      const start = await this.docker(['container', 'start', LOCAL_CONTAINER_NAME], 60_000);
      if (start.code !== 0) {
        throw new DockerServiceError('Docker could not start the local Möbius.', cleanDetail(start));
      }
    }
    onProgress('waiting');
    await this.waitUntilReady(origin);
    onProgress('ready');
    this.pullInBackground(image);
    return {
      docker: 'ready',
      dockerVersion: null,
      container: 'running',
      detail: 'Your local Möbius is ready.',
      origin,
    };
  }

  async stop(origin: string): Promise<LocalRuntimeStatus> {
    await this.requireDocker();
    const inspection = await this.inspectContainer();
    if (inspection.state === 'absent') {
      return {
        docker: 'ready',
        dockerVersion: null,
        container: 'absent',
        detail: 'No local Möbius container exists yet.',
        origin,
      };
    }
    if (!inspection.owned) {
      throw new DockerServiceError('Möbius Desktop will not stop a container it did not create.');
    }
    const result = await this.docker(['container', 'stop', '--time', '15', LOCAL_CONTAINER_NAME], 45_000);
    if (result.code !== 0) {
      throw new DockerServiceError('Docker could not stop the local Möbius.', cleanDetail(result));
    }
    return {
      docker: 'ready',
      dockerVersion: null,
      container: 'stopped',
      detail: 'The local Möbius is stopped. Its Docker data was kept.',
      origin,
    };
  }
}
