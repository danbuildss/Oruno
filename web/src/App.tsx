import { Layout } from "./components/Layout";
import { Credit } from "./pages/Credit";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { PoolPage } from "./pages/Pool";
import { usePath } from "./router";

export function App() {
  const path = usePath();
  const pool = path.match(/^\/p\/([a-z0-9-]{3,48})\/?$/);
  let page: React.ReactNode;
  if (pool?.[1]) page = <PoolPage key={pool[1]} slug={pool[1]} />;
  else if (path === "/credit" || path === "/credit/") page = <Credit />;
  else if (path === "/") page = <Home />;
  else page = <NotFound />;
  return <Layout>{page}</Layout>;
}
