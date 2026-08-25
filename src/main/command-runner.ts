import { spawn } from 'node:child_process';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  timeoutMs?: number,
) => Promise<CommandResult>;

const MAX_OUTPUT_BYTES = 1024 * 1024;

export class CommandExecutionError extends Error {
  constructor(
    message: string,
    readonly result: CommandResult,
    readonly causeCode?: string,
  ) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}

export const runCommand: CommandRunner = async (
  command,
  args,
  timeoutMs = 120_000,
) => new Promise((resolve, reject) => {
  const child = spawn(command, [...args], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let finished = false;

  const finish = (callback: () => void) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    callback();
  };

  const appendBounded = (current: string, chunk: Buffer): string => {
    const next = current + chunk.toString('utf8');
    if (Buffer.byteLength(next, 'utf8') <= MAX_OUTPUT_BYTES) return next;
    child.kill();
    finish(() => reject(new CommandExecutionError(
      `${command} produced too much output.`,
      { code: -1, stdout, stderr },
      'OUTPUT_LIMIT',
    )));
    return current;
  };

  child.stdout.on('data', (chunk: Buffer) => {
    stdout = appendBounded(stdout, chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = appendBounded(stderr, chunk);
  });
  child.on('error', (error: NodeJS.ErrnoException) => {
    finish(() => reject(new CommandExecutionError(
      `Could not start ${command}.`,
      { code: -1, stdout, stderr },
      error.code,
    )));
  });
  child.on('close', (code) => {
    finish(() => resolve({ code: code ?? -1, stdout, stderr }));
  });

  const timer = setTimeout(() => {
    child.kill();
    finish(() => reject(new CommandExecutionError(
      `${command} did not finish in time.`,
      { code: -1, stdout, stderr },
      'TIMEOUT',
    )));
  }, timeoutMs);
});
