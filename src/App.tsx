import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  CloudDownload,
  Gauge,
  History,
  Info,
  LayoutDashboard,
  Menu,
  Pause,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { api } from "./api";
import type { DownloadJob, NetworkInfo } from "./types";

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

const bytes = (value: number) => {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(value) / Math.log(1024));
  return `${(value / 1024 ** index).toFixed(index > 1 ? 2 : 0)} ${units[index]}`;
};

const speed = (value: number) => `${(value / 1_000_000).toFixed(1)} MB/s`;

const time = (seconds: number) => {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} sec`;
};

function App() {
  const [section, setSection] = useState("Overview");
  const [downloads, setDownloads] = useState<DownloadJob[]>(demoDownloads);
  const [url, setUrl] = useState("");
  const [connections, setConnections] = useState(4);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");
  const [network, setNetwork] = useState<NetworkInfo>({
    type: "Wi-Fi",
    downlink: 96,
    latency: 18,
    effectiveType: "4g",
  });

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

  const active = downloads.filter((item) => item.status === "downloading" || item.status === "paused");
  const totalSpeed = active.reduce((sum, item) => sum + item.speed, 0);
  const totalDownloaded = downloads.reduce((sum, item) => sum + item.downloaded, 0);
  const completed = downloads.filter((item) => item.status === "completed");

  const handleAction = async (job: DownloadJob, action: "pause" | "resume" | "cancel") => {
    if (job.sample) {
      setDownloads((items) => items.map((item) => item.id === job.id ? { ...item, status: action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "downloading" } : item));
      return;
    }
    try {
      const updated = await api.action(job.id, action);
      setDownloads((items) => items.map((item) => item.id === job.id ? updated : item));
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not update download");
    }
  };

  const startDownload = async () => {
    if (!url.trim()) return;
    try {
      const job = await api.start(url.trim(), connections);
      setDownloads((items) => [job, ...items]);
      setUrl("");
      setShowAdd(false);
      setSection("Active Downloads");
      setToast("Download added to the accelerator");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not start download");
    }
  };

  const nav = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Active Downloads", icon: CloudDownload, count: active.length },
    { label: "History", icon: History },
  ];

  return (
    <div className="app-shell">
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
          <div className="top-actions"><div className="network-pill"><span className="pulse-dot" /><Wifi size={15} /> {network.type}<ChevronRight size={14} /></div><button className="icon-button"><SlidersHorizontal size={18} /></button><div className="avatar">NS</div></div>
        </header>

        {section === "Settings" ? <SettingsPanel connections={connections} setConnections={setConnections} autoOptimize={autoOptimize} setAutoOptimize={setAutoOptimize} /> : (
          <>
            <section className="hero-row">
              <div><h2>Put your connection to work.</h2><p>Accelerate legitimate downloads with adaptive parallel connections.</p></div>
              <button className="primary-button" onClick={() => setShowAdd(true)}><ArrowDownToLine size={17} /> New download</button>
            </section>
            <section className="metrics-grid">
              <MetricCard icon={<Activity size={17} />} label="Active downloads" value={String(active.length).padStart(2, "0")} trend="+2 this session" tone="cyan" />
              <MetricCard icon={<Gauge size={17} />} label="Current speed" value={speed(totalSpeed)} trend="Across active downloads" tone="green" />
              <MetricCard icon={<BarChart3 size={17} />} label="Data downloaded" value={bytes(totalDownloaded)} trend="This session" tone="purple" />
              <MetricCard icon={<Timer size={17} />} label="Avg. improvement" value="—" trend="Measure a normal download" tone="orange" />
            </section>

            {section === "History" ? <HistoryPanel downloads={downloads} /> : (
              <>
                <section className="section-heading"><div><h3>Active downloads <span>{active.length}</span></h3><p>Adaptive connections are tuned automatically as conditions change.</p></div><button className="text-button" onClick={() => setSection("History")}>View history <ChevronRight size={15} /></button></section>
                <section className="content-grid">
                  <div className="download-list">
                    {active.length ? active.map((item) => <DownloadCard key={item.id} item={item} onAction={handleAction} />) : <EmptyState onClick={() => setShowAdd(true)} />}
                  </div>
                  <aside className="right-column">
                    <NetworkCard network={network} activeConnections={active.reduce((sum, item) => sum + item.connections, 0)} autoOptimize={autoOptimize} />
                    <DataNote />
                  </aside>
                </section>
              </>
            )}
          </>
        )}
      </main>
      {showAdd && <DownloadModal url={url} setUrl={setUrl} connections={connections} setConnections={setConnections} onClose={() => setShowAdd(false)} onStart={startDownload} />}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

function MetricCard({ icon, label, value, trend, tone }: { icon: React.ReactNode; label: string; value: string; trend: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><strong>{value}</strong><small>{trend}</small></div>;
}

function DownloadCard({ item, onAction }: { item: DownloadJob; onAction: (job: DownloadJob, action: "pause" | "resume" | "cancel") => void }) {
  const progress = Math.min(100, Math.round((item.downloaded / item.fileSize) * 100));
  return <article className="download-card">
    <div className="download-header"><div className="file-type"><ArrowDownToLine size={18} /></div><div className="file-info"><strong title={item.fileName}>{item.fileName}</strong><span>{bytes(item.fileSize)} · {item.supportsRange ? "Range supported" : "Standard download"}</span></div><span className={`download-status ${item.status}`}><i /> {item.status === "paused" ? "Paused" : "Downloading"}</span><button className="more-button"><span /><span /><span /></button></div>
    <div className="progress-line"><div style={{ width: `${progress}%` }} /></div>
    <div className="download-details"><div><strong>{progress}%</strong><span>{bytes(item.downloaded)} of {bytes(item.fileSize)}</span></div><div><strong>{speed(item.speed)}</strong><span>Current speed</span></div><div><strong>{time(item.eta)}</strong><span>Est. remaining</span></div><div><strong>{item.connections}</strong><span>Connections</span></div></div>
    <div className="card-footer"><span className="adaptive-label"><Zap size={13} /> Adaptive mode {item.retries ? `· ${item.retries} retry` : "· Stable"}</span><div className="card-actions">{item.status === "paused" ? <button onClick={() => onAction(item, "resume")}><Play size={14} /> Resume</button> : <button onClick={() => onAction(item, "pause")}><Pause size={14} /> Pause</button>}<button className="cancel-button" onClick={() => onAction(item, "cancel")}><X size={14} /> Cancel</button></div></div>
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

function HistoryPanel({ downloads }: { downloads: DownloadJob[] }) {
  return <section className="history-panel panel"><div className="panel-heading"><div><span className="panel-kicker">ARCHIVE</span><h3>Download history</h3></div><button className="text-button"><Trash2 size={14} /> Clear history</button></div><div className="history-list">{downloads.filter((item) => item.status === "completed" || item.status === "cancelled").map((item) => <div className="history-row" key={item.id}><div className="file-type small"><Check size={15} /></div><div><strong>{item.fileName}</strong><span>{bytes(item.fileSize)} · {new Date(item.createdAt).toLocaleDateString()}</span></div><span className={`history-state ${item.status}`}>{item.status}</span><ChevronRight size={16} /></div>)}{!downloads.some((item) => item.status === "completed" || item.status === "cancelled") && <p className="muted-copy">Completed downloads will appear here.</p>}</div></section>;
}

function SettingsPanel({ connections, setConnections, autoOptimize, setAutoOptimize }: { connections: number; setConnections: (value: number) => void; autoOptimize: boolean; setAutoOptimize: (value: boolean) => void }) {
  return <section className="settings-layout"><div className="settings-main panel"><div className="panel-heading"><div><span className="panel-kicker">PREFERENCES</span><h3>Acceleration settings</h3></div><ShieldCheck size={20} className="green-text" /></div><div className="setting-row"><div><strong>Automatic optimization</strong><p>Adjust streams based on bandwidth, latency, and server response.</p></div><button className={`toggle ${autoOptimize ? "on" : ""}`} onClick={() => setAutoOptimize(!autoOptimize)}><span /></button></div><div className="setting-row stacked"><div><strong>Starting connections</strong><p>Begin with a small number of streams, then adapt.</p></div><div className="range-value"><input type="range" min="1" max="8" value={connections} onChange={(event) => setConnections(Number(event.target.value))} /><b>{connections}</b></div></div><div className="setting-row stacked"><div><strong>Maximum connections</strong><p>More connections aren’t always faster. We recommend 8.</p></div><div className="range-value"><input type="range" min="4" max="16" defaultValue="8" /><b>8</b></div></div><div className="setting-row"><div><strong>Resume interrupted downloads</strong><p>Keep progress when your browser or network restarts.</p></div><span className="setting-check"><Check size={14} /></span></div></div><div className="settings-side"><DataNote /><div className="security-card"><ShieldCheck size={18} /><strong>Privacy by design</strong><p>URLs are validated before analysis. The accelerator never reads SIM balances, bypasses paywalls, or downloads files without your action.</p></div></div></section>;
}

function DownloadModal({ url, setUrl, connections, setConnections, onClose, onStart }: { url: string; setUrl: (value: string) => void; connections: number; setConnections: (value: number) => void; onClose: () => void; onStart: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-heading"><div><span className="panel-kicker">ACCELERATED DOWNLOAD</span><h3>What are we downloading?</h3></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><label>File URL<input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onStart()} placeholder="https://example.com/your-file.zip" /></label><div className="modal-setting"><div><strong>Starting connections</strong><span>Adaptive mode can increase this up to 8.</span></div><div className="range-value"><input type="range" min="1" max="8" value={connections} onChange={(event) => setConnections(Number(event.target.value))} /><b>{connections}</b></div></div><div className="modal-info"><Zap size={15} /><span>We’ll check range support first. Servers without it automatically fall back to a normal download.</span></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onStart} disabled={!url.trim()}><Zap size={16} /> Analyze & start</button></div></div></div>;
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