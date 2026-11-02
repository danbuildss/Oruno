import { Link } from "../components/Layout";

export function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the home page</Link>
      </p>
    </section>
  );
}
