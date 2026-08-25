import { contextBridge, ipcRenderer } from 'electron';

import type {
  DesktopApi,
  LocalProgressPhase,
  SaveInstanceInput,
  SharedFolder,
  StartLocalInput,
} from './shared/contracts';

const api: DesktopApi = {
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  saveInstance: (input: SaveInstanceInput) => ipcRenderer.invoke('desktop:save-instance', input),
  removeInstance: (id: string) => ipcRenderer.invoke('desktop:remove-instance', id),
  openInstance: (id: string) => ipcRenderer.invoke('desktop:open-instance', id),
  openInstanceInBrowser: (id: string) => ipcRenderer.invoke('desktop:open-instance-browser', id),
  openHostedSetup: () => ipcRenderer.invoke('desktop:open-hosted-setup'),
  openExternal: (url: string) => ipcRenderer.invoke('desktop:open-external', url),
  chooseFolder: (existing: SharedFolder[]) => ipcRenderer.invoke('desktop:choose-folder', existing),
  getLocalStatus: () => ipcRenderer.invoke('desktop:get-local-status'),
  startLocal: (input: StartLocalInput) => ipcRenderer.invoke('desktop:start-local', input),
  stopLocal: () => ipcRenderer.invoke('desktop:stop-local'),
  onLocalProgress: (listener: (phase: LocalProgressPhase) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, phase: LocalProgressPhase) => listener(phase);
    ipcRenderer.on('desktop:local-progress', handler);
    return () => ipcRenderer.removeListener('desktop:local-progress', handler);
  },
};

contextBridge.exposeInMainWorld('mobiusDesktop', api);
