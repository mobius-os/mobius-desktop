import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { StateStore } from '../../src/main/state-store';

const temporaryDirectories: string[] = [];

async function temporaryStateFile(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mobius-desktop-state-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'state.json');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('StateStore', () => {
  test('starts from a stable empty state and writes atomically with private permissions', async () => {
    const file = await temporaryStateFile();
    const store = new StateStore(file);
    const state = await store.read();
    expect(state.version).toBe(1);
    expect(state.instances).toEqual([]);

    state.localRuntime.port = 16000;
    await store.write(state);
    expect(JSON.parse(await readFile(file, 'utf8')).localRuntime.port).toBe(16000);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await readdir(path.dirname(file))).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  test('fails closed to defaults for corrupted state instead of inventing instances', async () => {
    const file = await temporaryStateFile();
    await writeFile(file, '{not-json');
    const state = await new StateStore(file).read();
    expect(state.instances).toEqual([]);
    expect(state.localRuntime.sharedFolders).toEqual([]);
  });

  test('upserts the single local instance without duplicating it', async () => {
    const file = await temporaryStateFile();
    const store = new StateStore(file);
    const base = {
      id: 'local-1',
      kind: 'local' as const,
      name: 'Local Möbius',
      origin: 'http://127.0.0.1:15123',
      createdAt: '2026-08-25T00:00:00.000Z',
      lastOpenedAt: null,
    };
    await store.upsertInstance(base);
    await store.upsertInstance({ ...base, id: 'local-2', origin: 'http://127.0.0.1:16000' });
    const state = await store.read();
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].origin).toBe('http://127.0.0.1:16000');
  });
});
