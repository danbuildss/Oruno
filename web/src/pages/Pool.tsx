import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  currentUser,
  type Eligibility,
  type Key,
  type Pool,
  type PoolProblem,
  signInUrl,
} from "../api";
import { KeyReveal } from "../components/KeyReveal";
import { Link } from "../components/Layout";
import { Notice, signInErrorMessage } from "../components/Notice";
import { shortDate, usd } from "../money";
import { navigate, takeErrorParam } from "../router";

const TERMS_URL = "https://github.com/danbuildss/Oruno/blob/main/docs/legal/CLAIMER_TERMS.md";

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; pool: Pool; user: { login: string } | null; eligibility: Eligibility | null };

/** What stops anyone claiming right now, worked out from the public pool data. */
function publicProblem(pool: Pool, now: Date): PoolProblem | null {
  if (pool.status !== "active") return pool.status === "ended" ? "drop_ended" : "drop_not_active";
  if (now < new Date(pool.startsAt)) return "drop_not_started";
  if (now >= new Date(pool.endsAt)) return "drop_ended";
  if (pool.slotsLeft <= 0) return "drop_full";
  return null;
}

function ProblemNotice({ problem, pool }: { problem: PoolProblem; pool: Pool }) {
  switch (problem) {
    case "drop_full":
      return (
        <Notice title="This pool is fully claimed">
          <p>Every share has been taken. Follow the funder for the next one.</p>
        </Notice>
      );
    case "drop_ended":
      return (
        <Notice title="This pool has ended">
          <p>It closed on {shortDate(pool.endsAt)}.</p>
        </Notice>
      );
    case "drop_not_started":
      return (
        <Notice title="This pool opens soon">
          <p>Claims open on {shortDate(pool.startsAt)}.</p>
        </Notice>
      );
    default:
      return (
        <Notice title="This pool is paused">
          <p>Claims are paused for now. Check back later.</p>
        </Notice>
      );
  }
}

const REASONS: Record<string, string> = {
  account_too_new: "Your GitHub account is too new.",
  not_enough_activity: "Your GitHub account doesn't have enough public activity yet.",
};

export function PoolPage({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [signInError] = useState(takeErrorParam);

  const load = useCallback(async () => {
    try {
      const [pool, user] = await Promise.all([api.pool(slug), currentUser()]);
      const eligibility = user ? await api.eligibility(slug) : null;
      setState({ kind: "ready", pool, user, eligibility });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setState({ kind: "missing" });
      else setState({ kind: "failed", message: (error as Error).message });
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") return <p className="muted">Loading…</p>;
  if (state.kind === "missing")
    return (
      <Notice title="Pool not found">
        <p>Check the link you were sent.</p>
      </Notice>
    );
  if (state.kind === "failed")
    return (
      <Notice tone="strong" title="Couldn't load this pool">
        <p>{state.message}</p>
      </Notice>
    );

  const { pool, user, eligibility } = state;
  const problem = eligibility ? eligibility.problem : publicProblem(pool, new Date());

  return (
    <>
      {signInError && <Notice tone="strong" title={signInErrorMessage(signInError)} />}
      <section className="pool-head">
        <p className="eyebrow">AI credit pool</p>
        <h1>{pool.name}</h1>
        <p className="amount">
          <span className="big">{usd(pool.capMicro)}</span> of AI credit for each person
        </p>
        <dl className="facts">
          <div>
            <dt>Left</dt>
            <dd>
              {pool.slotsLeft} of {pool.maxClaims}
            </dd>
          </div>
          <div>
            <dt>Ends</dt>
            <dd>{shortDate(pool.endsAt)}</dd>
          </div>
          <div>
            <dt>Works with</dt>
            <dd>Claude Code</dd>
          </div>
        </dl>
      </section>

      <ClaimArea
        pool={pool}
        user={user}
        eligibility={eligibility}
        problem={problem}
        onChanged={load}
      />
    </>
  );
}

function ClaimArea({
  pool,
  user,
  eligibility,
  problem,
  onChanged,
}: {
  pool: Pool;
  user: { login: string } | null;
  eligibility: Eligibility | null;
  problem: PoolProblem | null;
  onChanged: () => Promise<void>;
}) {
  const [key, setKey] = useState<Key | null>(null);
  const [pending, setPending] = useState(false);

  if (key) {
    return (
      <KeyReveal
        apiKey={key}
        onDone={() => {
          setKey(null);
          navigate("/credit");
        }}
      />
    );
  }
  if (pending) {
    return (
      <Notice title="Your share is reserved">
        <p>Your key is being prepared. It usually takes a minute.</p>
        <p>
          <Link to="/credit" className="button">
            Go to My credit
          </Link>
        </p>
      </Notice>
    );
  }

  if (eligibility?.claim) {
    return (
      <Notice title="You've claimed from this pool">
        <p>Your credit and key are on your credit page.</p>
        <p>
          <Link to="/credit" className="button">
            Go to My credit
          </Link>
        </p>
      </Notice>
    );
  }
  if (problem) return <ProblemNotice problem={problem} pool={pool} />;

  if (!user) {
    return (
      <section className="cta">
        <a className="button button-github" href={signInUrl(pool.slug)}>
          Sign in with GitHub to claim
        </a>
        <p className="muted small">
          We only read your public profile to check the account is real. Free. No card.
        </p>
      </section>
    );
  }

  if (eligibility && !eligibility.eligible) {
    return (
      <Notice title="This account can't claim from this pool">
        <ul>
          {eligibility.reasons.map((r) => (
            <li key={r}>{REASONS[r] ?? r}</li>
          ))}
        </ul>
        <p className="muted small">
          Signed in as {user.login}. These checks keep pools fair for real builders.
        </p>
      </Notice>
    );
  }

  return (
    <ClaimForm
      pool={pool}
      login={user.login}
      onKey={setKey}
      onPending={() => setPending(true)}
      onChanged={onChanged}
    />
  );
}

function ClaimForm({
  pool,
  login,
  onKey,
  onPending,
  onChanged,
}: {
  pool: Pool;
  login: string;
  onKey: (key: Key) => void;
  onPending: () => void;
  onChanged: () => Promise<void>;
}) {
  const [terms, setTerms] = useState(false);
  const [adult, setAdult] = useState(false);
  const [sanctions, setSanctions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = terms && adult && sanctions && !busy;

  return (
    <form
      className="claim"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        setBusy(true);
        setError(null);
        try {
          const result = await api.claim(pool.slug, pool.termsVersion);
          if (result.key) onKey(result.key);
          else onPending();
          // Refresh the counts ("19 of 20 left"); the key stays on screen.
          void onChanged();
        } catch (e) {
          const err = e as ApiError;
          setError(err.message);
          // The pool may have changed (full, ended, already claimed): show the current state.
          if (err.status === 409) await onChanged();
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted small">Signed in as {login}. You can claim.</p>
      <label className="check">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>
          I accept the{" "}
          <a href={TERMS_URL} target="_blank" rel="noreferrer">
            claimer terms
          </a>
          . The key is for me only.
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span>I'm 18 or older.</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={sanctions}
          onChange={(e) => setSanctions(e.target.checked)}
        />
        <span>I'm not in a sanctioned country or on a sanctions list.</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button" disabled={!ready}>
        {busy ? "Claiming…" : `Claim ${usd(pool.capMicro)} of credit`}
      </button>
    </form>
  );
}
