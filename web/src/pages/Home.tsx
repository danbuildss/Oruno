import { useState } from "react";
import { Link } from "../components/Layout";
import { Notice, signInErrorMessage } from "../components/Notice";
import { takeErrorParam } from "../router";

export function Home() {
  const [error] = useState(takeErrorParam);
  return (
    <>
      {error && <Notice tone="strong" title={signInErrorMessage(error)} />}
      <section className="hero">
        <h1>Free AI credit, funded by people.</h1>
        <p className="lead">
          Someone funds a pool of AI credit and shares a link. You sign in, claim your share, and
          use it in your own AI tools. You never pay.
        </p>
      </section>
      <ol className="steps">
        <li>
          <strong>Open a pool link</strong>
          <span>Someone shares it, for example on X.</span>
        </li>
        <li>
          <strong>Sign in with GitHub</strong>
          <span>We check the account is real. We never post or read your code.</span>
        </li>
        <li>
          <strong>Get your key</strong>
          <span>A personal key with a fixed amount of credit. Paste it into Claude Code.</span>
        </li>
      </ol>
      <p>
        <Link to="/credit" className="button button-secondary">
          See my credit
        </Link>
      </p>
    </>
  );
}
