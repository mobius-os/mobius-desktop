import { describe, expect, test } from 'vitest';

import {
  LOCAL_CONTAINER_NAME,
  LOCAL_DATA_VOLUME,
  OWNERSHIP_LABEL,
  buildCreateArguments,
} from '../../src/main/docker-service';
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
