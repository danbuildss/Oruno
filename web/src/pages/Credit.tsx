import { useCallback, useEffect, useState } from "react";
import { ApiError, api, currentUser, type Key, type MyClaim, signInUrl } from "../api";
import { KeyReveal } from "../components/KeyReveal";
import { Link } from "../components/Layout";
import { Notice, signInErrorMessage } from "../components/Notice";
import { Usage } from "../components/Usage";
import { shortDate, usd } from "../money";
import { takeErrorParam } from "../router";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; login: string; claims: MyClaim[] };

const STATUS: Record<MyClaim["status"], string> = {
  pending: "Being prepared",
  active: "Active",
  exhausted: "Used up",
  expired: "Ended",
  revoked: "Stopped",
  failed: "Couldn't be issued",
};

export function Credit() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [signInError] = useState(takeErrorParam);
  const [shown, setShown] = useState<{ claimId: string; key: Key } | null>(null);

  const load = useCallback(async () => {
    try {
      const user = await currentUser();
      if (!user) return setState({ kind: "signed-out" });
      const { claims } = await api.myClaims();
      setState({ kind: "ready", login: user.login, claims });
    } catch (error) {
      setState({ kind: "failed", message: (error as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (shown) {
    return (
      <KeyReveal
        apiKey={shown.key}
        onDone={() => {
          setShown(null);
          void load();
        }}
      />
    );
  }

  return (
    <>
      {signInError && <Notice tone="strong" title={signInErrorMessage(signInError)} />}
      <h1>My credit</h1>
      {state.kind === "loading" && <p className="muted">Loading…</p>}
      {state.kind === "failed" && (
        <Notice tone="strong" title="Couldn't load your credit">
          <p>{state.message}</p>
        </Notice>
      )}
      {state.kind === "signed-out" && (
        <section className="cta">
          <p>Sign in to see the credit you've claimed.</p>
          <a className="button button-github" href={signInUrl()}>
            Sign in with GitHub
          </a>
        </section>
      )}
      {state.kind === "ready" && (
        <>
          {state.claims.length === 0 ? (
            <Notice title="No credit yet">
              <p>Open a pool link someone shared to claim your first credit.</p>
            </Notice>
          ) : (
            <ul className="claims">
              {state.claims.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  onKey={(key) => setShown({ claimId: claim.id, key })}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
          <p className="muted small signed-in">
            Signed in as {state.login}.{" "}
            <button
              type="button"
              className="linklike"
              onClick={async () => {
                await api.signOut().catch(() => undefined);
                setState({ kind: "signed-out" });
              }}
            >
              Sign out
            </button>
          </p>
        </>
      )}
    </>
  );
}

function ClaimCard({
  claim,
  onKey,
  onChanged,
}: {
  claim: MyClaim;
  onKey: (key: Key) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const active = claim.status === "active";
  return (
    <li className="card" data-testid="claim-card">
      <div className="card-head">
        <h2>{claim.drop ? <Link to={`/p/${claim.drop.slug}`}>{claim.drop.name}</Link> : "Pool"}</h2>
        <span className={`badge badge-${claim.status}`}>{STATUS[claim.status]}</span>
      </div>
      {claim.spentMicro !== undefined && <Usage spent={claim.spentMicro} cap={claim.capMicro} />}
      <p className="muted small">
        {usd(claim.capMicro)} credit
        {claim.keyPrefix ? ` · key ${claim.keyPrefix}…` : ""}
        {claim.drop && active ? ` · ends ${shortDate(claim.drop.endsAt)}` : ""}
      </p>

      {claim.status === "pending" && (
        <p>
          Your key is being prepared.{" "}
          <button type="button" className="linklike" onClick={() => void onChanged()}>
            Check again
          </button>
        </p>
      )}

      {active && (
        <div className="actions">
          {!claim.secretDelivered ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => act(async () => onKey((await api.key(claim.id)).key))}
            >
              Get my key
            </button>
          ) : (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy || claim.rotationsLeft <= 0}
              onClick={() => act(async () => onKey((await api.key(claim.id)).key))}
            >
              Get a new key ({claim.rotationsLeft} left)
            </button>
          )}
          {!confirmStop ? (
            <button
              type="button"
              className="button button-ghost"
              disabled={busy}
              onClick={() => setConfirmStop(true)}
            >
              Stop this key
            </button>
          ) : (
            <div className="confirm">
              <p>
                Stop this key for good? You can't claim from this pool again, and unused credit goes
                back to the pool.
              </p>
              <button
                type="button"
                className="button button-danger"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api.revoke(claim.id);
                    setConfirmStop(false);
                    await onChanged();
                  })
                }
              >
                Yes, stop it
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setConfirmStop(false)}
              >
                Cancel
              </button>
            </div>
          )}
          {claim.secretDelivered && (
            <p className="muted small">
              Lost your key? A new key replaces the old one, which stops working. Your remaining
              credit moves to it.
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
