import { ArrowDownToLine, FolderOpen, Pause, Play, RotateCcw, X, Zap } from "lucide-react";
import { bytes, speed, time, STATUS_LABELS } from "../format";
import type { DesktopBridge, DownloadJob } from "../types";

export type DownloadAction = "pause" | "resume" | "retry" | "cancel" | "remove";

interface DetailsPanelProps {
  item: DownloadJob;
  onClose: () => void;
  onAction: (job: DownloadJob, action: DownloadAction) => void;
  desktop?: DesktopBridge;
}

export function DetailsPanel({ item, onClose, onAction, desktop }: DetailsPanelProps) {
  const progress = Math.min(100, Math.round((item.downloaded / item.fileSize) * 100));
  const canResume = item.status === "paused" || item.status === "failed";
  return (
    <div className="panel details-panel">
      <div className="panel-heading">
        <div><span className="panel-kicker">DOWNLOAD DETAILS</span><h3>File inspector</h3></div>
        <button className="icon-button" onClick={onClose} title="Close details"><X size={16} /></button>
      </div>
      <div className="details-file">
        <div className="file-type"><ArrowDownToLine size={18} /></div>
        <strong title={item.fileName}>{item.fileName}</strong>
        <span className={`download-status ${item.status}`}><i /> {STATUS_LABELS[item.status]}</span>
      </div>
      <div className="details-progress">
        <div className="progress-line"><div style={{ width: `${progress}%` }} /></div>
        <div className="details-progress-row"><strong>{progress}%</strong><span>{bytes(item.downloaded)} of {bytes(item.fileSize)}</span></div>
      </div>
      <dl className="details-grid">
        <div><dt>Speed</dt><dd>{speed(item.speed)}</dd></div>
        <div><dt>Remaining</dt><dd>{time(item.eta)}</dd></div>
        <div><dt>Connections</dt><dd>{item.connections}</dd></div>
        <div><dt>Range support</dt><dd>{item.supportsRange ? "Yes" : "No"}</dd></div>
        <div><dt>Retries</dt><dd>{item.retries}</dd></div>
        <div><dt>Added</dt><dd>{new Date(item.createdAt).toLocaleDateString()}</dd></div>
      </dl>
      {item.url ? <div className="details-url"><span>Source URL</span><code>{item.url}</code></div> : null}
      {item.error ? <p className="download-error">{item.error}</p> : null}
      <div className="details-actions">
        {canResume
          ? <button className="secondary-button" onClick={() => onAction(item, item.status === "failed" ? "retry" : "resume")}>{item.status === "failed" ? <RotateCcw size={14} /> : <Play size={14} />} {item.status === "failed" ? "Retry" : "Resume"}</button>
          : <button className="secondary-button" onClick={() => onAction(item, "pause")}><Pause size={14} /> Pause</button>}
        <button className="secondary-button" onClick={() => onAction(item, "cancel")}><X size={14} /> Cancel</button>
        {desktop && item.outputPath ? <button className="secondary-button" onClick={() => desktop.revealFile(item.outputPath!)}><FolderOpen size={14} /> Show in folder</button> : null}
      </div>
      <div className="details-note"><Zap size={13} /> {item.supportsRange ? "Adaptive multi-connection mode is active for this file." : "Single-connection download — the server does not support byte ranges."}</div>
    </div>
  );
}
