import { describe, expect, test } from 'vitest';

import {
  DockerService,
  LOCAL_CONTAINER_NAME,
  LOCAL_DATA_VOLUME,
  OWNERSHIP_LABEL,
  SETTINGS_LABEL_KEY,
  buildCreateArguments,
  settingsFingerprint,
} from '../../src/main/docker-service';
import type { CommandResult } from '../../src/main/command-runner';
import type { LocalRuntimeSettings } from '../../src/shared/contracts';

const settings: LocalRuntimeSettings = {
  image: 'ghcr.io/mobius-os/mobius:main',
  port: 15123,
  sharedFolders: [
    {
      id: 'projects',
      name: 'Projects',
      hostPath: '/Users/me/Projects',
      containerPath: '/data/shared/desktop/projects-a1b2c3',
      readOnly: false,
    },
    {
      id: 'archive',
      name: 'Archive',
      hostPath: '/Users/me/Archive',
      containerPath: '/data/shared/desktop/archive-d4e5f6',
      readOnly: true,
    },
  ],
};

describe('local container creation contract', () => {
  test('pins loopback networking, ownership, persistent data and chosen folders', () => {
    const args = buildCreateArguments(settings);
    expect(args).toContain(LOCAL_CONTAINER_NAME);
    expect(args).toContain(OWNERSHIP_LABEL);
    expect(args).toContain(`127.0.0.1:${settings.port}:8000`);
    expect(args).toContain(`type=volume,source=${LOCAL_DATA_VOLUME},target=/data`);
    expect(args).toContain('type=bind,source=/Users/me/Projects,target=/data/shared/desktop/projects-a1b2c3');
    expect(args).toContain('type=bind,source=/Users/me/Archive,target=/data/shared/desktop/archive-d4e5f6,readonly');
    expect(args.at(-1)).toBe(settings.image);
  });

  test('never grants broad host or Docker authority', () => {
    const joined = buildCreateArguments(settings).join(' ');
    expect(joined).not.toContain('--privileged');
    expect(joined).not.toContain('/var/run/docker.sock');
    expect(joined).not.toContain('target=/host');
  });

  test('rejects a folder destination outside the local-only mount root', () => {
    const unsafe = structuredClone(settings);
    unsafe.sharedFolders[0].containerPath = '/data/platform';
    expect(() => buildCreateArguments(unsafe)).toThrow(/unsafe container destination/i);
  });
});

const ready = async () => new Response(JSON.stringify({ status: 'ready' }), { status: 200 });
const ok = (stdout = ''): CommandResult => ({ code: 0, stdout, stderr: '' });

function fakeDocker(container: null | { status: string; labels: Record<string, string>; image: string }, localImage: string | null) {
  const calls: string[] = [];
  const runner = async (_command: string, args: readonly string[]): Promise<CommandResult> => {
    const call = args.join(' ');
    calls.push(call);
    if (call.startsWith('version')) return ok('27.0.0');
    if (call.startsWith('container inspect')) {
      if (!container) return { code: 1, stdout: '', stderr: 'Error: No such container: mobius-desktop' };
      return ok(JSON.stringify([{ Config: { Labels: container.labels }, State: { Status: container.status }, Image: container.image }]));
    }
    if (call.startsWith('image inspect')) return localImage ? ok(`${localImage}\n`) : { code: 1, stdout: '', stderr: 'No such image' };
    return ok();
  };
  return { calls, service: new DockerService(runner, ready as typeof fetch, async () => undefined) };
}

const ownedLabels = () => ({
  'you.mobius.desktop.managed': 'true',
  [SETTINGS_LABEL_KEY]: settingsFingerprint(settings),
});

describe('starting the local Möbius', () => {
  test('a stopped container with unchanged settings and image is started as-is', async () => {
    const { calls, service } = fakeDocker({ status: 'exited', labels: ownedLabels(), image: 'sha256:current' }, 'sha256:current');
    const status = await service.start(settings);
    await service.settleBackgroundWork();
    expect(status.container).toBe('running');
    const blocking = calls.slice(0, calls.indexOf(`container start ${LOCAL_CONTAINER_NAME}`) + 1);
    expect(blocking.some((call) => call.startsWith('image pull'))).toBe(false);
    expect(calls.some((call) => call.startsWith('container rm'))).toBe(false);
    expect(calls.some((call) => call.startsWith('container create'))).toBe(false);
    expect(calls.at(-1)).toBe(`image pull ${settings.image}`);
  });

  test('changed settings recreate the container from the local image without waiting for a download', async () => {
    const labels = { ...ownedLabels(), [SETTINGS_LABEL_KEY]: 'older-settings' };
    const { calls, service } = fakeDocker({ status: 'exited', labels, image: 'sha256:current' }, 'sha256:current');
    await service.start(settings);
    await service.settleBackgroundWork();
    const createAt = calls.findIndex((call) => call.startsWith('container create'));
    expect(calls.findIndex((call) => call.startsWith(`container rm --force ${LOCAL_CONTAINER_NAME}`))).toBeLessThan(createAt);
    expect(calls.slice(0, createAt).some((call) => call.startsWith('image pull'))).toBe(false);
  });

  test('a newer local image recreates the container so a background update takes effect', async () => {
    const { calls, service } = fakeDocker({ status: 'exited', labels: ownedLabels(), image: 'sha256:old' }, 'sha256:new');
    await service.start(settings);
    expect(calls.some((call) => call.startsWith('container create'))).toBe(true);
  });

  test('a first start downloads the image before creating the container', async () => {
    const { calls, service } = fakeDocker(null, null);
    await service.start(settings);
    const pullAt = calls.indexOf(`image pull ${settings.image}`);
    expect(pullAt).toBeGreaterThan(-1);
    expect(pullAt).toBeLessThan(calls.findIndex((call) => call.startsWith('container create')));
  });
});
