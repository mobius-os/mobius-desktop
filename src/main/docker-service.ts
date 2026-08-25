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

interface ContainerInspection {
  owned: boolean;
  state: ContainerState;
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

export function buildCreateArguments(settings: LocalRuntimeSettings): string[] {
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

export class DockerService {
  constructor(
    private readonly runner: CommandRunner = runCommand,
    private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (milliseconds: number) => Promise<void> = (
      milliseconds,
    ) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

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
        return { owned: false, state: 'absent' };
      }
      throw new DockerServiceError('Docker could not inspect the local Möbius.', cleanDetail(result));
    }
    try {
      const parsed = JSON.parse(result.stdout) as Array<{
        Config?: { Labels?: Record<string, string> };
        State?: { Status?: string };
      }>;
      const container = parsed[0];
      const owned = container?.Config?.Labels?.['you.mobius.desktop.managed'] === 'true';
      const rawState = container?.State?.Status;
      const state: ContainerState = rawState === 'running'
        ? 'running'
        : rawState === 'created'
          ? 'created'
          : rawState === 'exited'
            ? 'stopped'
            : 'unknown';
      return { owned, state };
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

  private async pullImage(image: string): Promise<void> {
    const pull = await this.docker(['image', 'pull', image], 10 * 60_000);
    if (pull.code === 0) return;
    const installed = await this.docker(['image', 'inspect', image], 20_000);
    if (installed.code === 0) return;
    throw new DockerServiceError('Möbius could not be downloaded.', cleanDetail(pull));
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

    onProgress('downloading');
    await this.pullImage(settings.image);

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

    const origin = `http://127.0.0.1:${settings.port}`;
    onProgress('waiting');
    await this.waitUntilReady(origin);
    onProgress('ready');
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
