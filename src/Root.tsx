import App from "./App";
import { navigate, useRoute } from "./router";
import AdminPage from "./site/AdminPage";
import LoginPage from "./site/LoginPage";
import Site from "./site/Site";

function NotFound() {
  return (
    <div className="auth-shell">
      <div className="admin-gate">
        <h1>Page not found</h1>
        <p>That page does not exist on this site.</p>
        <button className="site-cta" onClick={() => navigate("/")}>Back to the site</button>
      </div>
    </div>
  );
}

/**
 * Public website at "/", sign-in at "/login", the admin area at "/admin" and the
 * accelerator dashboard at "/app". A tiny history-based router keeps the whole
 * thing in one Vite build.
 */
export default function Root() {
  const path = useRoute();
  if (path === "/app") return <App />;
  if (path === "/login") return <LoginPage />;
  if (path === "/admin") return <AdminPage />;
  if (path === "/") return <Site />;
  return <NotFound />;
}
