import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  CloudDownload,
  FolderOpen,
  Gauge,
  History,
  Info,
  LayoutDashboard,
  Menu,
  Moon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { api } from "./api";
import { DetailsPanel } from "./components/DetailsPanel";
import { DownloadToolbar, type StatusFilter } from "./components/DownloadToolbar";
import { bytes, speed, time, STATUS_LABELS } from "./format";
import type { AppSettings, DesktopBridge, DownloadJob, NetworkInfo } from "./types";

const demoDownloads: DownloadJob[] = [
  {
    id: "demo-ubuntu",
    fileName: "ubuntu-24.04.1-desktop-amd64.iso",
    fileSize: 5_120_000_000,
    downloaded: 3_993_600_000,
    speed: 24.5 * 1_000_000,
    eta: 46,
    connections: 8,
    status: "downloading",
    supportsRange: true,
    retries: 0,
    createdAt: new Date().toISOString(),
    sample: true,
  },
  {
    id: "demo-movie",
    fileName: "nature-documentary-4k.mp4",
    fileSize: 8_640_000_000,
    downloaded: 4_492_800_000,
    speed: 12.1 * 1_000_000,
    eta: 342,
    connections: 6,
    status: "downloading",
    supportsRange: true,
    retries: 1,
    createdAt: new Date().toISOString(),
    sample: true,
  },
];

function App() {
  const [section, setSection] = useState("Overview");
  const [downloads, setDownloads] = useState<DownloadJob[]>(demoDownloads);
  const [url, setUrl] = useState("");
  const [connections, setConnections] = useState(4);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");
  const [network, setNetwork] = useState<NetworkInfo>({
    type: "Wi-Fi",
    downlink: 96,
    latency: 18,
    effectiveType: "4g",
  });
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("sda.theme") === "light" ? "light" : "dark",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const desktop = (window as Window & { sda?: DesktopBridge }).sda;

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (connection) {
      setNetwork({
        type: connection.type === "cellular" ? "Mobile Data" : connection.type === "ethernet" ? "Ethernet" : "Wi-Fi",
        downlink: connection.downlink ?? 0,
        latency: connection.rtt ?? 0,
        effectiveType: connection.effectiveType ?? "4g",
      });
    }
    api.list().then((items) => items.length && setDownloads([...items, ...demoDownloads])).catch(() => undefined);
    api.settings().then((loaded) => {
      setSettings(loaded);
      setConnections(loaded.connectionsPerDownload);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setDownloads((current) =>
        current.map((item) => {
          if (!item.sample || item.status !== "downloading") return item;
          const nextDownloaded = Math.min(item.fileSize, item.downloaded + item.speed);
          return { ...item, downloaded: nextDownloaded, eta: Math.max(0, (item.fileSize - nextDownloaded) / item.speed) };
        }),
      );
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("sda.theme", theme);
  }, [theme]);

  const active = downloads.filter((item) => item.status === "downloading" || item.status === "paused" || item.status === "queued" || item.status === "failed");
  const totalSpeed = active.reduce((sum, item) => sum + item.speed, 0);
  const totalDownloaded = downloads.reduce((sum, item) => sum + item.downloaded, 0);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return active.filter((item) => (filter === "all" || item.status === filter) && (!needle || item.fileName.toLowerCase().includes(needle)));
  }, [active, query, filter]);

  const filterCounts = useMemo<Record<StatusFilter, number>>(
    () => ({
      all: active.length,
      downloading: active.filter((item) => item.status === "downloading").length,
      queued: active.filter((item) => item.status === "queued").length,
      paused: active.filter((item) => item.status === "paused").length,
      failed: active.filter((item) => item.status === "failed").length,
    }),
    [active],
  );

  const selected = selectedId ? downloads.find((item) => item.id === selectedId) ?? null : null;

  const mergeServer = (jobs: DownloadJob[]) => setDownloads((current) => [...jobs, ...current.filter((item) => item.sample)]);

  const handleAction = async (job: DownloadJob, action: "pause" | "resume" | "retry" | "cancel" | "remove") => {
    if (job.sample) {
      setDownloads((items) => items.map((item) => item.id === job.id ? { ...item, status: action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "downloading" } : item));
      return;
    }
    try {
      if (action === "remove") {
        await api.remove(job.id);
        setDownloads((items) => items.filter((item) => item.id !== job.id));
        return;
      }
      const updated = await api.action(job.id, action);
      setDownloads((items) => items.map((item) => item.id === job.id ? updated : item));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not update download");
    }
  };

  const pauseAll = async () => {
    try {
      mergeServer(await api.pauseAll());
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not pause downloads");
    }
  };

  const resumeAll = async () => {
    try {
      mergeServer(await api.resumeAll());
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not resume downloads");
    }
  };

  const updateSettings = async (patch: Partial<AppSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    try {
      setSettings(await api.saveSettings(patch));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not save settings");
    }
  };

  const startDownload = async () => {
    const urls = url.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    if (!urls.length) return;
    try {
      if (urls.length === 1) {
        const job = await api.start(urls[0], connections);
        setDownloads((items) => [job, ...items]);
        setToast("Download added to the accelerator");
      } else {
        const { started, failed } = await api.startBulk(urls, connections);
        setDownloads((items) => [...started, ...items]);
        setToast(failed.length ? `${started.length} of ${urls.length} downloads added` : `${started.length} downloads added to the accelerator`);
      }
      setUrl("");
      setShowAdd(false);
      setSection("Active Downloads");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not start download");
    }
  };

  const acceptsDrop = (event: React.DragEvent) => {
    const types = event.dataTransfer?.types;
    return !types || Array.from(types).some((type) => type === "Files" || type === "text/uri-list" || type === "text/plain");
  };

  const handleDragEnter = (event: React.DragEvent) => {
    if (!acceptsDrop(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (!acceptsDrop(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!acceptsDrop(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    let text = event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain") || "";
    const lists = files.filter((file) => file.type.startsWith("text/") || /\.(txt|list|csv)$/i.test(file.name));
    if (lists.length) {
      const contents = await Promise.all(lists.map((file) => file.text()));
      text = [text, ...contents].join("\n");
    } else if (files.length) {
      setToast("Drop a .txt list of links, or paste the URLs instead");
      return;
    }
    const links = text.split(/[\s,]+/).map((value) => value.trim()).filter((value) => /^https?:\/\//i.test(value));
    if (!links.length) {
      setToast("No download links found in what you dropped");
      return;
    }
    setUrl(links.join("\n"));
    setShowAdd(true);
  };

  const nav = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Active Downloads", icon: CloudDownload, count: active.length },
    { label: "History", icon: History },
  ];

  return (
    <div
      className="app-shell"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Zap size={18} fill="currentColor" /></div>
          <div><strong>smart<span>download</span></strong><small>ACCELERATOR</small></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(({ label, icon: Icon, count }) => (
            <button key={label} className={`nav-item ${section === label ? "active" : ""}`} onClick={() => setSection(label)}>
              <Icon size={18} strokeWidth={section === label ? 2.4 : 1.8} /><span>{label}</span>{count ? <b>{count}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item ${section === "Settings" ? "active" : ""}`} onClick={() => setSection("Settings")}><Settings size={18} /><span>Settings</span></button>
          <button className="nav-item"><CircleHelp size={18} /><span>Help center</span></button>
          <div className="pro-card"><div className="pro-icon"><Sparkles size={15} /></div><strong>Get more from your network</strong><p>Connect up to 16 streams with Pro.</p><button onClick={() => setToast("Pro plans are coming soon")}>Explore Pro <ChevronRight size={14} /></button></div>
          <div className="sidebar-footer"><span className="status-dot" /> All systems operational <span>v1.0.0</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu"><Menu size={20} /></button>
          <div><p className="eyebrow">WEDNESDAY, SEP 09, 2026</p><h1>{section}</h1></div>
          <div className="top-actions"><div className="network-pill"><span className="pulse-dot" /><Wifi size={15} /> {network.type}<ChevronRight size={14} /></div><button className="icon-button" title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button" title="Open settings" onClick={() => setSection("Settings")}><SlidersHorizontal size={18} /></button><div className="avatar">NS</div></div>
        </header>

        {section === "Settings" ? <SettingsPanel settings={settings} onChange={updateSettings} desktop={desktop} /> : (
          <>
            <section className="hero-row">
              <div><h2>Put your connection to work.</h2><p>Accelerate legitimate downloads with adaptive parallel connections.</p></div>
              <button className="primary-button" onClick={() => setShowAdd(true)}><ArrowDownToLine size={17} /> New download</button>
            </section>
            <section className="metrics-grid">
              <MetricCard icon={<Activity size={17} />} label="Active downloads" value={String(active.length).padStart(2, "0")} trend={`${downloads.filter((item) => item.status === "queued").length} queued`} tone="cyan" />
              <MetricCard icon={<Gauge size={17} />} label="Current speed" value={speed(totalSpeed)} trend="Across active downloads" tone="green" />
              <MetricCard icon={<BarChart3 size={17} />} label="Data downloaded" value={bytes(totalDownloaded)} trend="This session" tone="purple" />
              <MetricCard icon={<Timer size={17} />} label="Avg. improvement" value="—" trend="Measure a normal download" tone="orange" />
            </section>

            {section === "History" ? <HistoryPanel downloads={downloads} onAction={handleAction} desktop={desktop} /> : (
              <>
                <section className="section-heading"><div><h3>Active downloads <span>{active.length}</span></h3><p>Adaptive connections are tuned automatically as conditions change.</p></div><div className="heading-actions"><button className="text-button" onClick={pauseAll}><Pause size={14} /> Pause all</button><button className="text-button" onClick={resumeAll}><Play size={14} /> Resume all</button><button className="text-button" onClick={() => setSection("History")}>View history <ChevronRight size={15} /></button></div></section>
                <DownloadToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} counts={filterCounts} />
                <section className="content-grid">
                  <div className="download-list">
                    {!active.length ? <EmptyState onClick={() => setShowAdd(true)} /> : visible.length ? visible.map((item) => <DownloadCard key={item.id} item={item} selected={selectedId === item.id} onSelect={() => setSelectedId(item.id)} onAction={handleAction} />) : (
                      <div className="empty-state">
                        <div className="empty-icon"><Search size={22} /></div>
                        <h3>No matching downloads</h3>
                        <p>Try another search term or switch the status filter.</p>
                        <button className="secondary-button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
                      </div>
                    )}
                  </div>
                  <aside className="right-column">
                    {selected ? <DetailsPanel item={selected} onClose={() => setSelectedId(null)} onAction={handleAction} desktop={desktop} /> : (
                      <>
                        <NetworkCard network={network} activeConnections={active.reduce((sum, item) => sum + item.connections, 0)} autoOptimize={settings?.autoStart ?? true} />
                        <DataNote />
                      </>
                    )}
                  </aside>
                </section>
              </>
            )}
          </>
        )}
      </main>
      {showAdd && <DownloadModal url={url} setUrl={setUrl} connections={connections} setConnections={setConnections} onClose={() => setShowAdd(false)} onStart={startDownload} />}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
      {dragging && <div className="drop-overlay"><div className="drop-card"><ArrowDownToLine size={26} /><strong>Drop to add downloads</strong><span>Release links or a .txt file of URLs</span></div></div>}
    </div>
  );
}

function MetricCard({ icon, label, value, trend, tone }: { icon: React.ReactNode; label: string; value: string; trend: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><strong>{value}</strong><small>{trend}</small></div>;
}

function DownloadCard({ item, selected, onSelect, onAction }: { item: DownloadJob; selected: boolean; onSelect: () => void; onAction: (job: DownloadJob, action: "pause" | "resume" | "retry" | "cancel" | "remove") => void }) {
  const progress = Math.min(100, Math.round((item.downloaded / item.fileSize) * 100));
  const canResume = item.status === "paused" || item.status === "failed";
  return <article className={`download-card ${selected ? "selected" : ""}`} onClick={onSelect}>
    <div className="download-header"><div className="file-type"><ArrowDownToLine size={18} /></div><div className="file-info"><strong title={item.fileName}>{item.fileName}</strong><span>{bytes(item.fileSize)} · {item.supportsRange ? "Range supported" : "Standard download"}</span></div><span className={`download-status ${item.status}`}><i /> {STATUS_LABELS[item.status]}</span><button className="more-button"><span /><span /><span /></button></div>
    <div className="progress-line"><div style={{ width: `${progress}%` }} /></div>
    <div className="download-details"><div><strong>{progress}%</strong><span>{bytes(item.downloaded)} of {bytes(item.fileSize)}</span></div><div><strong>{speed(item.speed)}</strong><span>Current speed</span></div><div><strong>{time(item.eta)}</strong><span>Est. remaining</span></div><div><strong>{item.connections}</strong><span>Connections</span></div></div>
    {item.error ? <p className="download-error">{item.error}</p> : null}
    <div className="card-footer"><span className="adaptive-label"><Zap size={13} /> Adaptive mode {item.retries ? `· ${item.retries} retry` : "· Stable"}</span><div className="card-actions" onClick={(event) => event.stopPropagation()}><button onClick={onSelect}><Info size={14} /> Details</button>{canResume ? <button onClick={() => onAction(item, item.status === "failed" ? "retry" : "resume")}>{item.status === "failed" ? <RotateCcw size={14} /> : <Play size={14} />} {item.status === "failed" ? "Retry" : "Resume"}</button> : <button onClick={() => onAction(item, "pause")}><Pause size={14} /> Pause</button>}<button className="cancel-button" onClick={() => onAction(item, "cancel")}><X size={14} /> Cancel</button><button className="cancel-button" onClick={() => onAction(item, "remove")}><Trash2 size={14} /> Remove</button></div></div>
  </article>;
}

function NetworkCard({ network, activeConnections, autoOptimize }: { network: NetworkInfo; activeConnections: number; autoOptimize: boolean }) {
  return <div className="panel network-card"><div className="panel-heading"><div><span className="panel-kicker"><span className="signal-bars"><i /><i /><i /><i /></span> LIVE NETWORK</span><h3>Connection health</h3></div><span className="live-badge"><i /> Live</span></div><div className="network-main"><div className="network-orb"><Wifi size={28} /><span /></div><div><strong>{network.type}</strong><p>{network.effectiveType.toUpperCase()} connection · {network.latency || "—"} ms latency</p></div></div><div className="network-stats"><div><span>Est. speed</span><strong>{network.downlink ? `${network.downlink} Mbps` : "Measuring…"}</strong></div><div><span>Active streams</span><strong>{activeConnections || 0}</strong></div><div><span>Optimizer</span><strong className="green-text">{autoOptimize ? "On" : "Manual"}</strong></div></div><div className="health-bar"><div /><span>Excellent</span></div></div>;
}

function DataNote() {
  return <div className="data-note"><div className="note-icon"><Info size={16} /></div><div><strong>One important thing</strong><p>Acceleration optimizes <em>how</em> your connection downloads. It does not create free mobile data or reduce the bytes in an uncompressed file.</p><button>Read how it works <ChevronRight size={14} /></button></div></div>;
}

function EmptyState({ onClick }: { onClick: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><CloudDownload size={25} /></div><h3>Nothing downloading</h3><p>Paste a file URL to start an accelerated download.</p><button className="primary-button" onClick={onClick}><ArrowDownToLine size={16} /> New download</button></div>;
}

function HistoryPanel({ downloads, onAction, desktop }: { downloads: DownloadJob[]; onAction: (job: DownloadJob, action: "pause" | "resume" | "retry" | "cancel" | "remove") => void; desktop?: DesktopBridge }) {
  const finished = downloads.filter((item) => item.status === "completed" || item.status === "cancelled");
  return <section className="history-panel panel"><div className="panel-heading"><div><span className="panel-kicker">ARCHIVE</span><h3>Download history</h3></div><button className="text-button"><Trash2 size={14} /> Clear history</button></div><div className="history-list">{finished.map((item) => <div className="history-row" key={item.id}><div className="file-type small"><Check size={15} /></div><div><strong>{item.fileName}</strong><span>{bytes(item.fileSize)} · {new Date(item.createdAt).toLocaleDateString()}</span></div><span className={`history-state ${item.status}`}>{STATUS_LABELS[item.status]}</span>{desktop && item.outputPath ? <button className="icon-button" title="Show in folder" onClick={() => desktop.revealFile(item.outputPath!)}><FolderOpen size={15} /></button> : null}<button className="icon-button" title="Remove from list" onClick={() => onAction(item, "remove")}><Trash2 size={15} /></button></div>)}{!finished.length && <p className="muted-copy">Finished downloads will appear here.</p>}</div></section>;
}

function SettingsPanel({ settings, onChange, desktop }: { settings: AppSettings | null; onChange: (patch: Partial<AppSettings>) => void; desktop?: DesktopBridge }) {
  if (!settings) return <section className="settings-layout"><div className="settings-main panel"><p className="muted-copy">Loading settings…</p></div></section>;
  const chooseFolder = async () => {
    const picked = await desktop?.chooseDirectory();
    if (picked) onChange({ downloadDir: picked });
  };
  return <section className="settings-layout"><div className="settings-main panel"><div className="panel-heading"><div><span className="panel-kicker">PREFERENCES</span><h3>Download settings</h3></div><ShieldCheck size={20} className="green-text" /></div><div className="setting-row"><div><strong>Start downloads automatically</strong><p>New links begin as soon as they are added, within the limits below.</p></div><button className={`toggle ${settings.autoStart ? "on" : ""}`} onClick={() => onChange({ autoStart: !settings.autoStart })}><span /></button></div><div className="setting-row stacked"><div><strong>Simultaneous downloads</strong><p>How many files may download at once. Extra links wait in the queue.</p></div><div className="range-value"><input type="range" min="1" max="8" value={settings.maxConcurrent} onChange={(event) => onChange({ maxConcurrent: Number(event.target.value) })} /><b>{settings.maxConcurrent}</b></div></div><div className="setting-row stacked"><div><strong>Connections per download</strong><p>Segments used for servers that support byte ranges.</p></div><div className="range-value"><input type="range" min="1" max="16" value={settings.connectionsPerDownload} onChange={(event) => onChange({ connectionsPerDownload: Number(event.target.value) })} /><b>{settings.connectionsPerDownload}</b></div></div><div className="setting-row stacked"><div><strong>Download folder</strong><p>Where finished files are saved.</p></div><div className="folder-row"><input value={settings.downloadDir} onChange={(event) => onChange({ downloadDir: event.target.value })} />{desktop ? <button className="secondary-button" onClick={chooseFolder}><FolderOpen size={15} /> Choose</button> : null}</div></div></div><div className="settings-side"><DataNote /><div className="security-card"><ShieldCheck size={18} /><strong>Privacy by design</strong><p>URLs are validated before analysis. The accelerator never reads SIM balances, bypasses paywalls, or downloads files without your action.</p></div></div></section>;
}

function DownloadModal({ url, setUrl, connections, setConnections, onClose, onStart }: { url: string; setUrl: (value: string) => void; connections: number; setConnections: (value: number) => void; onClose: () => void; onStart: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-heading"><div><span className="panel-kicker">ACCELERATED DOWNLOAD</span><h3>What are we downloading?</h3></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><label>File URLs<textarea autoFocus rows={3} value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.metaKey || event.ctrlKey) && onStart()} placeholder={"Paste one or more links, one per line:\nhttps://example.com/your-file.zip"} /></label><div className="modal-setting"><div><strong>Starting connections</strong><span>Adaptive mode can increase this up to 8.</span></div><div className="range-value"><input type="range" min="1" max="8" value={connections} onChange={(event) => setConnections(Number(event.target.value))} /><b>{connections}</b></div></div><div className="modal-info"><Zap size={15} /><span>We’ll check range support first. Servers without it automatically fall back to a normal download. Paste several links to queue them all at once.</span></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onStart} disabled={!url.trim()}><Zap size={16} /> Analyze & start</button></div></div></div>;
}

export default App;

declare global {
  interface NetworkInformation {
    type?: string;
    downlink?: number;
    rtt?: number;
    effectiveType?: string;
  }
}
