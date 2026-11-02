import type { ReactNode } from "react";
import { navigate } from "../router";

export function Link({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <header className="top">
        <Link to="/" className="brand">
          oruno
        </Link>
        <Link to="/credit" className="top-link">
          My credit
        </Link>
      </header>
      <main>{children}</main>
      <footer className="foot">
        <p>Intelligence should move freely.</p>
        <p className="muted">
          Oruno is independent. It isn't provided by, or affiliated with, any AI model provider.
        </p>
      </footer>
    </div>
  );
}
