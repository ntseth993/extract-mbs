import { useEffect, useState } from "react";

const normalize = (path: string) => path.replace(/\/+$/, "") || "/";

export function navigate(to: string): void {
  if (normalize(window.location.pathname) === normalize(to)) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): string {
  const [path, setPath] = useState(() => normalize(window.location.pathname));
  useEffect(() => {
    const update = () => setPath(normalize(window.location.pathname));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
}
