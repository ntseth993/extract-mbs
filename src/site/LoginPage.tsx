import { useEffect, useState } from "react";
import { ArrowLeft, Github, LogOut, ShieldCheck, UserCog, Zap } from "lucide-react";
import { navigate } from "../router";
import { siteApi, type ProviderInfo } from "./api";
import { useAuth } from "./useAuth";

const ERROR_MESSAGES: Record<string, string> = {
  state: "That sign-in attempt expired or was tampered with. Please try again.",
  oauth: "The provider could not complete the sign-in. Please try again.",
  blocked: "This account has been blocked. Contact an administrator if you think that is a mistake.",
};

const PROVIDER_ICON: Record<string, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.8 2.7-2.3 3.8l-.02.14 3.4 2.6.24.02c2.2-2 3.5-5 3.5-8.5z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2a7.1 7.1 0 0 1-6.7-4.9l-.13.01-3.5 2.7-.05.13A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.5a7.4 7.4 0 0 1 0-4.7l-.01-.14L1.7 7l-.1.05a12 12 0 0 0 0 10.8l3.7-2.9z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0A12 12 0 0 0 1.6 7l3.7 2.9A7.1 7.1 0 0 1 12 4.7z" />
    </svg>
  ),
  github: <Github size={17} />,
};

export default function LoginPage() {
  const { user, loading, refresh } = useAuth();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    siteApi.providers().then((payload) => setProviders(payload.providers)).catch(() => undefined);
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.");
  }, []);

  const signOut = async () => {
    await siteApi.logout().catch(() => undefined);
    await refresh();
    navigate("/");
  };

  const anyEnabled = providers.some((provider) => provider.enabled);

  return (
    <div className="auth-shell">
      <div className="auth-glow" aria-hidden="true"><span /><span /></div>
      <button className="auth-back" onClick={() => navigate("/")}><ArrowLeft size={15} /> Back to site</button>

      <div className="auth-card">
        <div className="auth-brand">
          <span className="site-brand-mark"><Zap size={17} fill="currentColor" /></span>
          <div><strong>smart<span>download</span></strong><small>ACCELERATOR</small></div>
        </div>

        {loading ? (
          <p className="auth-muted">Checking your session…</p>
        ) : user ? (
          <>
            <h1>You're signed in</h1>
            <div className="auth-account">
              <span className="auth-avatar">
                {user.avatar ? <img src={user.avatar} alt="" /> : user.name.slice(0, 1).toUpperCase()}
              </span>
              <div><strong>{user.name}</strong><span>{user.email}</span></div>
              <em className={`role-badge ${user.role}`}>{user.role}</em>
            </div>
            <div className="auth-actions">
              <button className="site-cta" onClick={() => navigate("/app")}>Open web dashboard</button>
              {user.role === "admin" ? (
                <button className="site-ghost" onClick={() => navigate("/admin")}><UserCog size={15} /> Admin dashboard</button>
              ) : null}
              <button className="site-ghost" onClick={signOut}><LogOut size={15} /> Sign out</button>
            </div>
          </>
        ) : (
          <>
            <h1>Sign in or create an account</h1>
            <p className="auth-muted">
              Accounts exist so we can grant access to builds and manage who may use them. Use a provider below —
              there is no password to remember.
            </p>

            {error ? <p className="auth-error">{error}</p> : null}

            <div className="provider-list">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  className="provider-button"
                  disabled={!provider.enabled}
                  onClick={() => { window.location.href = `/api/auth/${provider.id}/start?next=/`; }}
                >
                  <span className="provider-icon">{PROVIDER_ICON[provider.id]}</span>
                  Continue with {provider.label}
                  {!provider.enabled ? <em>not configured</em> : null}
                </button>
              ))}
              {!providers.length ? <p className="auth-muted">Loading providers…</p> : null}
            </div>

            {!anyEnabled && providers.length ? (
              <div className="auth-notice">
                <ShieldCheck size={16} />
                <div>
                  <strong>Provider credentials needed</strong>
                  <p>
                    Add the OAuth client ID and secret for Google and/or GitHub as app secrets, then set the
                    callback URL to <code>/api/auth/&lt;provider&gt;/callback</code> on this domain.
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
