import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type {
  DesktopDiagnostics,
  DesktopState,
  LocalProgressPhase,
  LocalRuntimeStatus,
  SavedInstance,
  SharedFolder,
  UpdateCheck,
  UpdateInstallProgress,
} from '../shared/contracts';
import { desktopApi, previewScreen } from './bridge';
import {
  ArrowRightIcon,
  BackIcon,
  CheckIcon,
  CloudIcon,
  ExternalIcon,
  FolderIcon,
  LinkIcon,
  LocalIcon,
  PlusIcon,
  StopIcon,
  TrashIcon,
} from './icons';

type Screen = 'home' | 'hosted' | 'existing' | 'local' | 'about';

const api = desktopApi();

const PROGRESS_COPY: Record<LocalProgressPhase, string> = {
  'checking-docker': 'Checking Docker…',
  downloading: 'Downloading the latest Möbius…',
  'preserving-data': 'Keeping your local data safe…',
  creating: 'Preparing the local container…',
  starting: 'Starting Möbius…',
  waiting: 'Waiting for Möbius to be ready…',
  ready: 'Your local Möbius is ready.',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function kindLabel(kind: SavedInstance['kind']): string {
  if (kind === 'hosted') return 'Hosted';
  if (kind === 'local') return 'This computer';
  return 'Existing deployment';
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function BrandPanel({ screen }: { screen: Screen }) {
  const detail = screen === 'local'
    ? 'A focused workspace on this computer, with only the folders you choose.'
    : screen === 'about'
      ? 'Clear boundaries, visible health, and updates you choose when to install.'
    : screen === 'existing'
      ? 'Bring the Möbius you already own into one familiar desktop doorway.'
      : screen === 'hosted'
        ? 'An always-on home for your agent, available wherever you are.'
        : 'One doorway. The right home for your agent.';
  return (
    <aside className="brand-panel" aria-label="Möbius Desktop">
      <div className="brand-panel__glow" />
      <div className="brand-panel__top">
        <img src="/moebius.png" alt="" className="brand-panel__mark" />
        <span>Möbius Desktop</span>
      </div>
      <div className="brand-panel__message">
        <p>{detail}</p>
      </div>
      <p className="brand-panel__foot">Yours to run. Yours to change.</p>
    </aside>
  );
}

function Shell({ screen, children }: { screen: Screen; children: React.ReactNode }) {
  return (
    <div className="desktop-shell">
      <BrandPanel screen={screen} />
      <main className="content-panel">{children}</main>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="back-button" type="button" onClick={onClick}>
      <BackIcon />
      Back
    </button>
  );
}

function ChoiceHome({
  onChoose,
  onAbout,
}: {
  onChoose: (screen: 'hosted' | 'existing' | 'local') => void;
  onAbout: () => void;
}) {
  return (
    <section className="choice-view" aria-labelledby="choice-title">
      <div className="view-heading">
        <h1 id="choice-title">Where should your Möbius live?</h1>
        <p>Choose the setup that fits today. You can connect more than one later.</p>
      </div>

      <button className="hosted-choice" type="button" onClick={() => onChoose('hosted')}>
        <span className="choice-icon choice-icon--hosted"><CloudIcon /></span>
        <span className="choice-copy">
          <span className="choice-title-line">
            <strong>Create a hosted Möbius</strong>
            <span className="recommended-pill">Recommended</span>
          </span>
          <span>Private, always on, and available from every device.</span>
        </span>
        <ArrowRightIcon className="choice-arrow" />
      </button>

      <div className="choice-rail">
        <button className="rail-choice" type="button" onClick={() => onChoose('existing')}>
          <span className="choice-icon"><LinkIcon /></span>
          <span className="choice-copy">
            <strong>Connect an existing Möbius</strong>
            <span>Use a deployment you already own.</span>
          </span>
          <ArrowRightIcon className="choice-arrow" />
        </button>
        <button className="rail-choice" type="button" onClick={() => onChoose('local')}>
          <span className="choice-icon"><LocalIcon /></span>
          <span className="choice-copy">
            <strong>Run locally with Docker</strong>
            <span>Useful for local files, but not a persistent home.</span>
          </span>
          <ArrowRightIcon className="choice-arrow" />
        </button>
      </div>
      <p className="choice-note">Your provider connection and personal data stay inside the Möbius you choose.</p>
      <button className="about-link" type="button" onClick={onAbout}>About, diagnostics & updates</button>
    </section>
  );
}

function SavedHome({
  state,
  localStatus,
  openingId,
  onOpen,
  onOpenInBrowser,
  onRemove,
  onAdd,
  onStopLocal,
  onManageLocal,
  onAbout,
  stoppingLocal,
}: {
  state: DesktopState;
  localStatus: LocalRuntimeStatus | null;
  openingId: string | null;
  onOpen: (instance: SavedInstance) => void;
  onOpenInBrowser: (instance: SavedInstance) => void;
  onRemove: (instance: SavedInstance) => void;
  onAdd: () => void;
  onStopLocal: () => void;
  onManageLocal: () => void;
  onAbout: () => void;
  stoppingLocal: boolean;
}) {
  return (
    <section className="saved-view" aria-labelledby="saved-title">
      <div className="saved-heading">
        <div>
          <h1 id="saved-title">Open your Möbius</h1>
          <p>Each deployment keeps its own sign-in and data.</p>
        </div>
        <button className="secondary-button secondary-button--compact" type="button" onClick={onAdd}>
          <PlusIcon /> Add another
        </button>
      </div>

      <div className="instance-list">
        {state.instances.map((instance) => {
          const isLocal = instance.kind === 'local';
          const localRunning = localStatus?.container === 'running';
          return (
            <article className="instance-row" key={instance.id}>
              <div className={`instance-mark instance-mark--${instance.kind}`}>
                {isLocal ? <LocalIcon /> : instance.kind === 'hosted' ? <CloudIcon /> : <LinkIcon />}
              </div>
              <div className="instance-copy">
                <div className="instance-name-line">
                  <h2>{instance.name}</h2>
                  <span className="instance-kind">{kindLabel(instance.kind)}</span>
                </div>
                <p>{instance.origin.replace(/^https?:\/\//, '')}</p>
                {isLocal && (
                  <span className={`runtime-state runtime-state--${localRunning ? 'ready' : 'quiet'}`}>
                    <span />{localRunning ? 'Running' : localStatus?.container === 'stopped' ? 'Stopped · data kept' : 'Not started'}
                  </span>
                )}
              </div>
              <div className="instance-actions">
                {isLocal && localRunning && (
                  <button className="icon-button" type="button" disabled={stoppingLocal} aria-label="Stop local Möbius" title="Stop local Möbius" onClick={onStopLocal}>
                    <StopIcon />
                  </button>
                )}
                <button className="primary-button primary-button--compact" type="button" disabled={openingId === instance.id || stoppingLocal} onClick={() => isLocal && !localRunning ? onManageLocal() : onOpen(instance)}>
                  {openingId === instance.id ? 'Opening…' : isLocal && !localRunning ? 'Start' : 'Open'}
                </button>
                <button className="icon-button" type="button" disabled={isLocal && !localRunning} aria-label={`Open ${instance.name} in browser`} title="Open in browser" onClick={() => onOpenInBrowser(instance)}>
                  <ExternalIcon />
                </button>
                <button className="icon-button icon-button--danger" type="button" aria-label={`Forget ${instance.name}`} title="Forget this deployment" onClick={() => onRemove(instance)}>
                  <TrashIcon />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hosted-reminder">
        <CloudIcon />
        <div>
          <strong>Need an always-on home?</strong>
          <span>A hosted Möbius keeps working when this computer is asleep.</span>
        </div>
        <button type="button" onClick={() => onAdd()}>Explore options <ArrowRightIcon /></button>
      </div>
      <button className="about-link about-link--saved" type="button" onClick={onAbout}>About, diagnostics & updates</button>
    </section>
  );
}

function ConnectScreen({
  kind,
  onBack,
  onSaved,
}: {
  kind: 'hosted' | 'existing';
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const hosted = kind === 'hosted';
  const [name, setName] = useState('My Möbius');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function openHostedSetup() {
    setError('');
    try {
      await api.openHostedSetup();
    } catch (openError) {
      setError(`Your browser did not open. ${errorMessage(openError)} Try again, or visit mobius.you in your browser.`);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.saveInstance({ kind, name, url });
      await onSaved();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="detail-view" aria-labelledby="connect-title">
      <BackButton onClick={onBack} />
      <div className="view-heading view-heading--detail">
        <h1 id="connect-title">{hosted ? 'Create your hosted Möbius' : 'Connect a Möbius you own'}</h1>
        <p>{hosted
          ? 'Sign in securely in your browser. When the deployment is ready, bring its address back here.'
          : 'Enter the main address of your deployment. We will verify it before saving.'}</p>
      </div>

      {hosted && (
        <div className="hosted-step">
          <div className="hosted-step__number">1</div>
          <div>
            <strong>Build the always-on home</strong>
            <p>Möbius · You creates a private deployment in a Railway account you control.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => void openHostedSetup()}>
            Continue at mobius.you <ExternalIcon />
          </button>
        </div>
      )}

      <form className="connect-form" onSubmit={submit}>
        {hosted && <div className="hosted-step__number">2</div>}
        <div className="form-body">
          <h2>{hosted ? 'Connect it to this app' : 'Deployment details'}</h2>
          <label>
            <span>Name</span>
            <input value={name} maxLength={80} autoComplete="off" onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Möbius address</span>
            <input value={url} type="url" inputMode="url" spellCheck={false} placeholder="https://my-mobius.example" onChange={(event) => setUrl(event.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button primary-button--wide" type="submit" disabled={saving || !name.trim() || !url.trim()}>
            {saving ? 'Checking Möbius…' : 'Verify and connect'}
            {!saving && <ArrowRightIcon />}
          </button>
          <p className="privacy-note">Möbius Desktop checks the address but never asks for your password. You sign in directly inside your deployment.</p>
        </div>
      </form>
    </section>
  );
}

function FolderRow({
  folder,
  onChange,
  onRemove,
}: {
  folder: SharedFolder;
  onChange: (next: SharedFolder) => void;
  onRemove: () => void;
}) {
  return (
    <div className="folder-row">
      <FolderIcon />
      <div className="folder-copy">
        <strong>{folder.name}</strong>
        <span>{folder.hostPath}</span>
      </div>
      <div className="access-toggle" role="group" aria-label={`Access for ${folder.name}`}>
        <button aria-pressed={folder.readOnly} className={folder.readOnly ? 'is-active' : ''} type="button" onClick={() => onChange({ ...folder, readOnly: true })}>Read only</button>
        <button aria-pressed={!folder.readOnly} className={!folder.readOnly ? 'is-active' : ''} type="button" onClick={() => onChange({ ...folder, readOnly: false })}>Read & edit</button>
      </div>
      <button className="icon-button" type="button" aria-label={`Remove ${folder.name}`} onClick={onRemove}><TrashIcon /></button>
    </div>
  );
}

function LocalScreen({
  state,
  status,
  onBack,
  onReady,
  refreshStatus,
}: {
  state: DesktopState;
  status: LocalRuntimeStatus | null;
  onBack: () => void;
  onReady: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}) {
  const [folders, setFolders] = useState<SharedFolder[]>(state.localRuntime.sharedFolders);
  const [progress, setProgress] = useState<LocalProgressPhase | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => api.onLocalProgress(setProgress), []);

  async function addFolder() {
    setError('');
    try {
      const selected = await api.chooseFolder();
      if (selected && !folders.some((folder) => folder.id === selected.id)) {
        setFolders((current) => [...current, selected]);
      }
    } catch (folderError) {
      setError(errorMessage(folderError));
    }
  }

  async function startLocal() {
    setStarting(true);
    setError('');
    try {
      await api.startLocal({
        folders: folders.map(({ id, readOnly }) => ({ id, readOnly })),
      });
      await refreshStatus();
      await onReady();
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setStarting(false);
    }
  }

  async function checkDocker() {
    setError('');
    try {
      await refreshStatus();
    } catch (statusError) {
      setError(errorMessage(statusError));
    }
  }

  async function openDockerHelp() {
    setError('');
    try {
      await api.openExternal('https://docs.docker.com/get-started/get-docker/');
    } catch (openError) {
      setError(`Your browser did not open. ${errorMessage(openError)} Try again, or visit docs.docker.com.`);
    }
  }

  async function chooseHosted() {
    setError('');
    try {
      await api.openHostedSetup();
    } catch (openError) {
      setError(`Your browser did not open. ${errorMessage(openError)} Try again, or visit mobius.you in your browser.`);
    }
  }

  const dockerReady = status?.docker === 'ready';
  return (
    <section className="detail-view local-view" aria-labelledby="local-title">
      <BackButton onClick={onBack} />
      <div className="view-heading view-heading--detail">
        <h1 id="local-title">Run Möbius on this computer</h1>
        <p>A Docker-compatible engine keeps this copy separate and lets its agent work in folders you choose.</p>
      </div>

      <div className="local-warning">
        <CloudIcon />
        <div>
          <strong>Local mode is not a persistent home for your agent.</strong>
          <p>It keeps running while this computer and its container engine are on, but disappears from the internet when either is off. Resetting container data can remove it. Hosted Möbius is preferred for an always-on home.</p>
        </div>
        <button type="button" onClick={() => void chooseHosted()}>Choose hosted instead <ExternalIcon /></button>
      </div>

      {error && <p className="form-error local-error" role="alert">{error}</p>}

      <div className="docker-status">
        <span className={`status-orb status-orb--${dockerReady ? 'ready' : 'blocked'}`}>{dockerReady ? <CheckIcon /> : '!'}</span>
        <div>
          <strong>{status === null ? 'Checking Docker…' : dockerReady ? 'Docker is ready' : status.detail}</strong>
          <p>{dockerReady
            ? `Version ${status.dockerVersion ?? 'available'} · local data will use the “mobius-desktop-data” volume.`
            : status?.docker === 'missing'
              ? 'Install Docker Desktop or another Docker-compatible engine, start it, then check again.'
              : status?.docker === 'stopped'
                ? 'Start your container engine and wait for it to become ready, then check again.'
                : 'Resolve the Docker issue above, then check again.'}</p>
        </div>
        {!dockerReady && status !== null && (
          <div className="docker-actions">
            {status.docker === 'missing' && (
              <button className="secondary-button secondary-button--compact" type="button" onClick={() => void openDockerHelp()}>Get Docker <ExternalIcon /></button>
            )}
            <button className="secondary-button secondary-button--compact" type="button" onClick={() => void checkDocker()}>Check again</button>
          </div>
        )}
      </div>

      <div className="folder-section">
        <div className="section-heading">
          <div>
            <h2>Folders the agent can use</h2>
            <p>Folders begin read-only. Read & edit lets the local agent change or delete files inside that folder.</p>
          </div>
          <button className="secondary-button secondary-button--compact" type="button" onClick={() => void addFolder()}>
            <PlusIcon /> Add folder
          </button>
        </div>
        <div className="folder-list">
          {folders.length === 0 ? (
            <div className="folder-empty">
              <FolderIcon />
              <div><strong>No local folders shared</strong><span>You can still use Möbius and add folders later by recreating the local container.</span></div>
            </div>
          ) : folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              onChange={(next) => setFolders((current) => current.map((item) => item.id === folder.id ? next : item))}
              onRemove={() => setFolders((current) => current.filter((item) => item.id !== folder.id))}
            />
          ))}
        </div>
        {folders.length > 0 && (
          <details className="agent-paths">
            <summary>Where the agent sees these folders</summary>
            <div className="agent-paths__list">
              {folders.map((folder) => (
                <div key={folder.id}>
                  <span>{folder.name}</span>
                  <code>{folder.containerPath}</code>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="local-action-row">
        <div className="progress-copy" role="status" aria-live="polite">
          {starting && progress ? <><span className="progress-spinner" />{PROGRESS_COPY[progress]}</> : 'Your Docker volume is kept when the app or container stops.'}
        </div>
        <button className="primary-button" type="button" disabled={!dockerReady || starting} onClick={() => void startLocal()}>
          {starting ? 'Setting up…' : status?.container === 'running' ? 'Apply and restart local Möbius' : 'Start local Möbius'}
          {!starting && <ArrowRightIcon />}
        </button>
      </div>
    </section>
  );
}

function AboutScreen({ onBack }: { onBack: () => void }) {
  const [diagnostics, setDiagnostics] = useState<DesktopDiagnostics | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateInstallProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDiagnostics().then(setDiagnostics).catch((diagnosticError) => setError(errorMessage(diagnosticError)));
    return api.onUpdateProgress(setUpdateProgress);
  }, []);

  async function checkForUpdate() {
    setChecking(true);
    setError('');
    try {
      setUpdate(await api.checkForUpdate());
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setChecking(false);
    }
  }

  async function installUpdate() {
    if (!update?.version) return;
    setInstalling(true);
    setUpdateProgress(null);
    setError('');
    try {
      await api.installUpdate(update.version);
    } catch (updateError) {
      setError(errorMessage(updateError));
      setInstalling(false);
    }
  }

  async function copyDiagnostics() {
    if (!diagnostics) return;
    const summary = [
      `Möbius Desktop ${diagnostics.appVersion}`,
      `${diagnostics.operatingSystem} ${diagnostics.architecture}`,
      `State format: ${diagnostics.stateVersion}`,
      `Docker: ${diagnostics.docker}${diagnostics.dockerVersion ? ` ${diagnostics.dockerVersion}` : ''}`,
      `Container: ${diagnostics.container}`,
      `Local port: ${diagnostics.port}`,
      `Image: ${diagnostics.image}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setError('The operating system did not let Möbius Desktop copy the diagnostics.');
    }
  }

  async function openReleases() {
    setError('');
    try {
      await api.openExternal('https://github.com/mobius-os/mobius-desktop/releases');
    } catch (openError) {
      setError(`Your browser did not open. ${errorMessage(openError)}`);
    }
  }

  const progressLabel = updateProgress
    ? updateProgress.totalBytes
      ? `${formatBytes(updateProgress.downloadedBytes)} of ${formatBytes(updateProgress.totalBytes)}`
      : formatBytes(updateProgress.downloadedBytes)
    : null;

  return (
    <section className="detail-view about-view" aria-labelledby="about-title">
      <BackButton onClick={onBack} />
      <div className="view-heading view-heading--detail">
        <h1 id="about-title">About Möbius Desktop</h1>
        <p>See what this app can reach, check its local runtime, and choose when signed updates are installed.</p>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="about-section" aria-labelledby="authority-title">
        <div className="about-section__heading">
          <div><h2 id="authority-title">Desktop authority</h2><p>The boundary is deliberately small.</p></div>
        </div>
        <ul className="authority-list">
          <li><CheckIcon /><span><strong>Remote deployments stay isolated</strong><small>They cannot call Docker or read folders on this computer.</small></span></li>
          <li><CheckIcon /><span><strong>Local folders require a picker</strong><small>Each folder starts read-only unless you explicitly allow editing.</small></span></li>
          <li><CheckIcon /><span><strong>Local data is never silently deleted</strong><small>Stopping, reconnecting, or updating keeps the named Docker volume.</small></span></li>
        </ul>
      </section>

      <section className="about-section" aria-labelledby="updates-title">
        <div className="about-section__heading about-section__heading--actions">
          <div><h2 id="updates-title">Updates</h2><p>Release packages are verified before installation.</p></div>
          <button className="secondary-button secondary-button--compact" type="button" disabled={checking || installing} onClick={() => void checkForUpdate()}>
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
        <div className="update-state" role="status" aria-live="polite">
          {installing ? (
            <><span className="progress-spinner" /><div><strong>Installing the signed update…</strong><p>{progressLabel ?? 'Preparing the download'} · the app will reopen when it is ready.</p></div></>
          ) : update?.available ? (
            <><span className="status-orb status-orb--ready"><CheckIcon /></span><div><strong>Version {update.version} is ready</strong><p>{update.body || 'A signed Möbius Desktop update is available.'}</p></div><button className="primary-button primary-button--compact" type="button" onClick={() => void installUpdate()}>Install & reopen</button></>
          ) : update && !update.configured ? (
            <><span className="status-orb status-orb--quiet">—</span><div><strong>No update channel in this build</strong><p>Development builds stay disconnected. Public release builds receive their signed channel during packaging.</p></div></>
          ) : update ? (
            <><span className="status-orb status-orb--ready"><CheckIcon /></span><div><strong>You are up to date</strong><p>Version {update.currentVersion} is the newest signed release available.</p></div></>
          ) : (
            <><span className="status-orb status-orb--quiet">i</span><div><strong>Updates happen only when you choose</strong><p>Checking does not change your app. Installation always requires a separate click.</p></div></>
          )}
        </div>
        <button className="about-link" type="button" onClick={() => void openReleases()}>View public releases <ExternalIcon /></button>
      </section>

      <section className="about-section" aria-labelledby="diagnostics-title">
        <div className="about-section__heading about-section__heading--actions">
          <div><h2 id="diagnostics-title">Diagnostics</h2><p>Useful when something local is not working.</p></div>
          <button className="secondary-button secondary-button--compact" type="button" disabled={!diagnostics} onClick={() => void copyDiagnostics()}>{copied ? 'Copied' : 'Copy summary'}</button>
        </div>
        {diagnostics ? (
          <dl className="diagnostics-grid">
            <div><dt>App version</dt><dd>{diagnostics.appVersion}</dd></div>
            <div><dt>Computer</dt><dd>{diagnostics.operatingSystem} · {diagnostics.architecture}</dd></div>
            <div><dt>Docker</dt><dd>{diagnostics.dockerVersion ? `${diagnostics.docker} · ${diagnostics.dockerVersion}` : diagnostics.docker}</dd></div>
            <div><dt>Local container</dt><dd>{diagnostics.container}</dd></div>
            <div><dt>Local address</dt><dd>127.0.0.1:{diagnostics.port}</dd></div>
            <div className="diagnostics-grid__wide"><dt>Pinned image</dt><dd><code>{diagnostics.image}</code></dd></div>
          </dl>
        ) : <p className="diagnostics-loading" role="status">Reading diagnostics…</p>}
      </section>
    </section>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>(previewScreen ?? 'home');
  const [state, setState] = useState<DesktopState | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalRuntimeStatus | null>(null);
  const [loadingError, setLoadingError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [stoppingLocal, setStoppingLocal] = useState(false);

  async function loadState() {
    const next = await api.getState();
    setState(next);
  }

  async function refreshLocalStatus() {
    const next = await api.getLocalStatus();
    setLocalStatus(next);
  }

  useEffect(() => {
    Promise.all([loadState(), refreshLocalStatus()]).catch((error) => setLoadingError(errorMessage(error)));
  }, []);

  const showChoices = useMemo(() => state?.instances.length === 0 || adding, [state, adding]);

  async function connected() {
    await loadState();
    setAdding(false);
    setScreen('home');
  }

  async function openInstance(instance: SavedInstance) {
    setOpeningId(instance.id);
    try {
      await api.openInstance(instance.id);
      await loadState();
    } catch (error) {
      setLoadingError(errorMessage(error));
    } finally {
      setOpeningId(null);
    }
  }

  async function openInstanceInBrowser(instance: SavedInstance) {
    try {
      await api.openInstanceInBrowser(instance.id);
    } catch (error) {
      setLoadingError(errorMessage(error));
    }
  }

  async function removeInstance(instance: SavedInstance) {
    const label = instance.kind === 'local'
      ? 'Forget this shortcut? The Docker container and its data will be kept.'
      : `Forget “${instance.name}” on this computer? The deployment itself will not be changed.`;
    if (!window.confirm(label)) return;
    try {
      setState(await api.removeInstance(instance.id));
    } catch (error) {
      setLoadingError(errorMessage(error));
    }
  }

  async function stopLocal() {
    setStoppingLocal(true);
    try {
      setLocalStatus(await api.stopLocal());
    } catch (error) {
      setLoadingError(errorMessage(error));
    } finally {
      setStoppingLocal(false);
    }
  }

  if (loadingError && !state) {
    return (
      <div className="fatal-state">
        <img src="/moebius.png" alt="Möbius" />
        <h1>Möbius Desktop could not open</h1>
        <p>{loadingError}</p>
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  if (!state) {
    return <div className="loading-state" role="status"><img src="/moebius.png" alt="" /><span>Opening Möbius Desktop…</span></div>;
  }

  const goHome = () => {
    setAdding(false);
    setScreen('home');
    setLoadingError('');
  };

  return (
    <Shell screen={screen}>
      {loadingError && <div className="top-error" role="alert">{loadingError}<button type="button" onClick={() => setLoadingError('')}>Dismiss</button></div>}
      {screen === 'home' && (showChoices
        ? <ChoiceHome onChoose={setScreen} onAbout={() => setScreen('about')} />
        : <SavedHome
            state={state}
            localStatus={localStatus}
            openingId={openingId}
            onOpen={(instance) => void openInstance(instance)}
            onOpenInBrowser={(instance) => void openInstanceInBrowser(instance)}
            onRemove={(instance) => void removeInstance(instance)}
            onAdd={() => setAdding(true)}
            onStopLocal={() => void stopLocal()}
            onManageLocal={() => setScreen('local')}
            onAbout={() => setScreen('about')}
            stoppingLocal={stoppingLocal}
          />)}
      {screen === 'hosted' && <ConnectScreen kind="hosted" onBack={goHome} onSaved={connected} />}
      {screen === 'existing' && <ConnectScreen kind="existing" onBack={goHome} onSaved={connected} />}
      {screen === 'local' && (
        <LocalScreen
          state={state}
          status={localStatus}
          onBack={goHome}
          onReady={connected}
          refreshStatus={refreshLocalStatus}
        />
      )}
      {screen === 'about' && <AboutScreen onBack={goHome} />}
    </Shell>
  );
}
