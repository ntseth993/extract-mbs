import { Search, X } from "lucide-react";

export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "downloading", label: "Downloading" },
  { value: "queued", label: "Queued" },
  { value: "paused", label: "Paused" },
  { value: "failed", label: "Failed" },
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

interface DownloadToolbarProps {
  query: string;
  onQuery: (value: string) => void;
  filter: StatusFilter;
  onFilter: (value: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}

export function DownloadToolbar({ query, onQuery, filter, onFilter, counts }: DownloadToolbarProps) {
  return (
    <div className="download-toolbar">
      <div className="search-field">
        <Search size={15} />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search downloads by file name" />
        {query ? <button onClick={() => onQuery("")} title="Clear search"><X size={14} /></button> : null}
      </div>
      <div className="filter-chips">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button key={value} className={`chip ${filter === value ? "active" : ""}`} onClick={() => onFilter(value)}>
            {label}
            {counts[value] ? <b>{counts[value]}</b> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
