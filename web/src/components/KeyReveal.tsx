import { useEffect } from "react";
import type { Key } from "../api";
import { CopyButton } from "./CopyButton";

/**
 * Shows a key's secret once. The secret lives only in this component's memory: it's never
 * written to storage or the URL, and it's gone when the person leaves the page.
 */
export function KeyReveal({ apiKey, onDone }: { apiKey: Key; onDone: () => void }) {
  // Warn before the tab is closed while the secret is on screen.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const shell = [
    `export ANTHROPIC_BASE_URL="${apiKey.setup.ANTHROPIC_BASE_URL}"`,
    `export ANTHROPIC_AUTH_TOKEN="${apiKey.setup.ANTHROPIC_AUTH_TOKEN}"`,
    `export ANTHROPIC_API_KEY=""`,
    "claude",
  ].join("\n");

  return (
    <section className="key" aria-labelledby="key-title">
      <h2 id="key-title">Your key</h2>
      <p className="warning">
        <strong>This is the only time we show it.</strong> Copy it somewhere safe now. Don't share
        it: it's yours alone.
      </p>
      <div className="secret-row">
        <code className="secret" data-testid="secret">
          {apiKey.secret}
        </code>
        <CopyButton text={apiKey.secret} label="Copy key" />
      </div>

      <h3>Use it in Claude Code</h3>
      <p>Paste this into your terminal:</p>
      <div className="code-block">
        <pre>{shell}</pre>
        <CopyButton text={shell} />
      </div>
      <p className="muted small">
        If Claude Code says “invalid request” after working fine, your credit is probably used up.
        Check <strong>My credit</strong>.
      </p>
      <button type="button" className="button" onClick={onDone}>
        I've saved my key
      </button>
    </section>
  );
}
