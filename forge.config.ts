import type { ForgeConfig } from '@electron-forge/shared-types';
import path from 'node:path';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { flipFuses, FuseV1Options, FuseVersion } from 'electron-fuses-latest';

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'you.mobius.desktop',
    appCategoryType: 'public.app-category.productivity',
    asar: true,
    executableName: 'mobius-desktop',
    icon: 'assets/icons/icon',
    name: 'Möbius Desktop',
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath, _electronVersion, platform, arch) => {
      const applePlatform = platform === 'darwin' || platform === 'mas';
      const contentsPath = path.resolve(buildPath, '../..');
      const executablePath = applePlatform
        ? path.join(contentsPath, 'MacOS', 'Electron')
        : path.join(contentsPath, platform === 'win32' ? 'electron.exe' : 'electron');

      await flipFuses(executablePath, {
        version: FuseVersion.V1,
        resetAdHocDarwinSignature: applePlatform && arch === 'arm64',
        strictlyRequireAllFuses: true,
        [FuseV1Options.RunAsNode]: false,
        [FuseV1Options.EnableCookieEncryption]: true,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
        [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
        // The trusted launcher is currently loaded with file:// by Electron Forge.
        [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
        [FuseV1Options.WasmTrapHandlers]: true,
      });
    },
  },
  makers: [
    new MakerSquirrel({
      name: 'mobius_desktop',
      setupIcon: 'assets/icons/icon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({
      options: {
        icon: 'assets/icons/icon.png',
      },
    }),
    new MakerDeb({
      options: {
        icon: 'assets/icons/icon.png',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
