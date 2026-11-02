import type { ReactNode } from "react";

export function Notice({
  tone = "plain",
  title,
  children,
}: {
  tone?: "plain" | "strong";
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className={`notice notice-${tone}`} role={tone === "strong" ? "alert" : "status"}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const SIGN_IN_ERRORS: Record<string, string> = {
  github_denied: "GitHub sign-in was cancelled.",
  invalid_state: "That sign-in link expired or was already used. Please try again.",
  github_not_configured: "Sign-in isn't available right now.",
};

export function signInErrorMessage(code: string): string {
  return SIGN_IN_ERRORS[code] ?? "Sign-in didn't work. Please try again.";
}
