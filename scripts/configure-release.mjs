import { mkdir, writeFile } from 'node:fs/promises';

const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
const runnerOs = process.env.RUNNER_OS?.trim().toLowerCase()
  ?? ({ darwin: 'macos', win32: 'windows' }[process.platform] || process.platform);
if (!publicKey) {
  throw new Error('TAURI_UPDATER_PUBLIC_KEY is required to build a signed update release.');
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  throw new Error('TAURI_SIGNING_PRIVATE_KEY is required to build a signed update release.');
}
if (runnerOs === 'macos') {
  const missingAppleValues = [
    'APPLE_CERTIFICATE',
    'APPLE_CERTIFICATE_PASSWORD',
    'APPLE_SIGNING_IDENTITY',
    'APPLE_ID',
    'APPLE_PASSWORD',
    'APPLE_TEAM_ID',
  ].filter((name) => !process.env[name]?.trim());
  if (missingAppleValues.length > 0) {
    throw new Error(`Trusted macOS releases require: ${missingAppleValues.join(', ')}.`);
  }
}

const output = new URL('../src-tauri/tauri.release.generated.json', import.meta.url);
const config = {
  bundle: {
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      endpoints: [
        'https://github.com/mobius-os/mobius-desktop/releases/latest/download/latest.json',
      ],
      pubkey: publicKey,
    },
  },
};

if (runnerOs === 'windows') {
  const windowsThumbprint = process.env.WINDOWS_CERTIFICATE_THUMBPRINT?.trim();
  const windowsTimestampUrl = process.env.WINDOWS_TIMESTAMP_URL?.trim();
  if (!windowsThumbprint || !windowsTimestampUrl) {
    throw new Error(
      'WINDOWS_CERTIFICATE_THUMBPRINT and WINDOWS_TIMESTAMP_URL are required for a trusted Windows release.',
    );
  }
  const parsedTimestampUrl = new URL(windowsTimestampUrl);
  if (!['https:', 'http:'].includes(parsedTimestampUrl.protocol)) {
    throw new Error('WINDOWS_TIMESTAMP_URL must use HTTP or HTTPS.');
  }
  config.bundle.windows = {
    certificateThumbprint: windowsThumbprint,
    digestAlgorithm: 'sha256',
    timestampUrl: windowsTimestampUrl,
  };
}

await mkdir(new URL('../src-tauri/', import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log('Wrote the release-only updater configuration.');
