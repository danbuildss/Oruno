import { useEffect, useState } from "react";

/** A tiny router: the site has three kinds of page, so no routing library is needed. */
export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
}

export function navigate(to: string): void {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

/** Reads `?error=` (set by the server after a failed sign-in) once, then removes it from the URL. */
export function takeErrorParam(): string | null {
  const url = new URL(window.location.href);
  const error = url.searchParams.get("error");
  if (error) {
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  return error;
}
