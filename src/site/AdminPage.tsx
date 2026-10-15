import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { navigate } from "../router";
import { siteApi, type SiteUser } from "./api";
import { useAuth } from "./useAuth";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<SiteUser[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      setUsers((await siteApi.users()).users);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load users");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") void loadUsers();
  }, [user, loadUsers]);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await run();
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed");
    } finally {
      setBusyId("");
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((entry) => entry.name.toLowerCase().includes(needle) || entry.email.toLowerCase().includes(needle));
  }, [users, query]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((entry) => entry.role === "admin").length,
    blocked: users.filter((entry) => entry.blocked).length,
    week: users.filter((entry) => Date.now() - new Date(entry.createdAt).getTime() < 7 * 864e5).length,
  }), [users]);

  if (loading) {
    return <div className="admin-shell"><p className="admin-muted">Checking your session…</p></div>;
  }

  if (!user) {
    return (
      <div className="admin-shell">
        <div className="admin-gate">
          <ShieldCheck size={26} />
          <h1>Administrator area</h1>
          <p>Sign in with an administrator account to manage users and access.</p>
          <div className="auth-actions">
            <button className="site-cta" onClick={() => navigate("/login")}>Sign in</button>
            <button className="site-ghost" onClick={() => navigate("/")}><ArrowLeft size={15} /> Back to site</button>
          </div>
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="admin-shell">
        <div className="admin-gate">
          <ShieldOff size={26} />
          <h1>No access</h1>
          <p>Your account ({user.email}) is not an administrator, so this area is off limits.</p>
          <div className="auth-actions">
            <button className="site-cta" onClick={() => navigate("/app")}>Open web dashboard</button>
            <button className="site-ghost" onClick={() => navigate("/")}><ArrowLeft size={15} /> Back to site</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div className="admin-top-inner">
          <div className="admin-title">
            <span className="admin-mark"><UserCog size={18} /></span>
            <div><span className="kicker">ADMINISTRATION</span><h1>Users &amp; access</h1></div>
          </div>
          <div className="admin-top-actions">
            <button className="site-ghost" onClick={() => void loadUsers()} disabled={loadingUsers}>
              <RefreshCw size={15} className={loadingUsers ? "spin" : ""} /> Refresh
            </button>
            <button className="site-ghost" onClick={() => navigate("/")}><ArrowLeft size={15} /> Back to site</button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-stats">
          <div><span className="admin-stat-icon cyan"><Users size={17} /></span><strong>{stats.total}</strong><small>Total users</small></div>
          <div><span className="admin-stat-icon green"><ShieldCheck size={17} /></span><strong>{stats.admins}</strong><small>Administrators</small></div>
          <div><span className="admin-stat-icon red"><Ban size={17} /></span><strong>{stats.blocked}</strong><small>Blocked</small></div>
          <div><span className="admin-stat-icon purple"><CheckCircle2 size={17} /></span><strong>{stats.week}</strong><small>Joined this week</small></div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div><h2>All users</h2><p>Blocking a user signs them out and stops them signing back in.</p></div>
            <div className="admin-search">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" />
            </div>
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          {!filtered.length ? (
            <p className="admin-muted">
              {users.length ? "No users match that search." : "No one has signed in yet. Accounts appear here as soon as someone signs in."}
            </p>
          ) : (
            <div className="admin-table">
              <div className="admin-row head">
                <span>User</span><span>Provider</span><span>Role</span><span>Status</span><span>Last sign-in</span><span />
              </div>
              {filtered.map((entry) => (
                <div className={`admin-row ${entry.blocked ? "blocked" : ""}`} key={entry.id}>
                  <div className="admin-user">
                    <span className="auth-avatar small">
                      {entry.avatar ? <img src={entry.avatar} alt="" /> : entry.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div><strong>{entry.name}</strong><span>{entry.email}</span></div>
                  </div>
                  <span className="admin-cell"><em className="provider-chip">{entry.provider}</em></span>
                  <span className="admin-cell"><em className={`role-badge ${entry.role}`}>{entry.role}</em></span>
                  <span className="admin-cell">
                    <em className={`status-chip ${entry.blocked ? "blocked" : "active"}`}>{entry.blocked ? "Blocked" : "Active"}</em>
                  </span>
                  <span className="admin-cell muted">
                    {entry.lastLoginAt ? `${new Date(entry.lastLoginAt).toLocaleDateString()} · ${entry.logins}×` : "—"}
                  </span>
                  <div className="admin-actions">
                    <button
                      className="admin-action"
                      disabled={busyId === entry.id || entry.id === user.id}
                      title={entry.role === "admin" ? "Remove admin role" : "Make administrator"}
                      onClick={() => void act(entry.id, () => siteApi.updateUser(entry.id, { role: entry.role === "admin" ? "user" : "admin" }))}
                    >
                      <UserCog size={15} />
                    </button>
                    <button
                      className="admin-action"
                      disabled={busyId === entry.id || entry.id === user.id}
                      title={entry.blocked ? "Restore access" : "Block access"}
                      onClick={() => void act(entry.id, () => siteApi.updateUser(entry.id, { blocked: !entry.blocked }))}
                    >
                      {entry.blocked ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                    </button>
                    <button
                      className="admin-action danger"
                      disabled={busyId === entry.id || entry.id === user.id}
                      title="Remove user"
                      onClick={() => {
                        if (!window.confirm(`Remove ${entry.email}? This cannot be undone.`)) return;
                        void act(entry.id, () => siteApi.removeUser(entry.id));
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
