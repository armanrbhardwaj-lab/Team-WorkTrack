
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Activity, CalendarClock, BriefcaseBusiness, Users, ShieldCheck,
  LogOut, Building2, FileSpreadsheet, ReceiptText, RefreshCw, LockKeyhole
} from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase";

type Membership = {
  organization_id: string;
  role: "super_admin" | "company_admin" | "hr" | "employee";
  organizations: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [membership, setMembership] = useState<Membership | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async (userId: string, userEmail: string) => {
    if (!supabase) return;

    setUserId(userId);
    setUserEmail(userEmail);
    setMembership(null);
    setNotice("");

    const { data, error } = await supabase
      .from("memberships")
      .select("organization_id, role, organizations(id, name, slug)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      setNotice(`Could not load workspace access: ${error.message}`);
      return;
    }

    if (!data) {
      setNotice(
        "Your account is signed in, but no workspace membership was found. Ask your workspace administrator to check your membership."
      );
      return;
    }

    setMembership(data as unknown as Membership);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    const initialise = async () => {
      const { data, error } = await supabase!.auth.getSession();

      if (!active) return;

      if (error) {
        setNotice(error.message);
        setLoading(false);
        return;
      }

      const user = data.session?.user;

      if (user) {
        setSignedIn(true);
        await loadWorkspace(user.id, user.email ?? "");
      } else {
        setSignedIn(false);
        setMembership(null);
      }

      if (active) setLoading(false);
    };

    void initialise();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;

        if (session?.user) {
          setSignedIn(true);
          // Defer the database query until the auth callback has completed.
          window.setTimeout(() => {
            if (active) {
              void loadWorkspace(session.user.id, session.user.email ?? "");
            }
          }, 0);
        } else {
          setSignedIn(false);
          setMembership(null);
          setUserId("");
          setUserEmail("");
          setNotice("");
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setNotice("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setNotice(error.message);
    setPassword("");
    setBusy(false);
  }

  async function logout() {
    if (!supabase) return;

    setBusy(true);
    const { error } = await supabase.auth.signOut();

    if (error) setNotice(error.message);
    setBusy(false);
  }

  async function refreshWorkspace() {
    if (!supabase || !userId) return;

    setBusy(true);
    await loadWorkspace(userId, userEmail);
    setBusy(false);
  }

  const workspace = membership?.organizations;
  const roleLabel = membership?.role
    ? membership.role.replaceAll("_", " ")
    : "";

  return (
    <main className="shell">
      <header>
        <div className="brand">
          <span className="mark"><Activity /></span>
          Team <b>WorkTrack</b>
        </div>
        <span className="secure">
          <ShieldCheck size={16} /> Secure workspace portal
        </span>
      </header>

      {!supabaseConfigured ? (
        <section className="card">
          <h2>Configuration required</h2>
          <p>Supabase environment variables are missing. Configure them in Vercel and redeploy.</p>
        </section>
      ) : loading ? (
        <section className="card">
          <RefreshCw className="spin" />
          <h2>Checking your session…</h2>
        </section>
      ) : !signedIn ? (
        <section className="hero">
          <div>
            <small>WORK MANAGEMENT, SIMPLIFIED</small>
            <h1>Your team’s work.<br /><span>One clear view.</span></h1>
            <p>Manage timesheets, conveyance claims and team activity in one organized workspace.</p>
            <div className="features">
              <div><CalendarClock /><span><b>Timesheets</b><small>Work entries and approvals</small></span></div>
              <div><BriefcaseBusiness /><span><b>Conveyance</b><small>Travel claims and review</small></span></div>
              <div><Users /><span><b>Company workspaces</b><small>Organization-based access</small></span></div>
            </div>
          </div>

          <section className="card">
            <small>WELCOME BACK</small>
            <h2>Sign in to WorkTrack</h2>
            <p>Use your organization account to continue.</p>
            <form onSubmit={login}>
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            </form>
            {notice && <p className="notice" role="alert">{notice}</p>}
            <footer><ShieldCheck size={15} /> Secure authentication via Supabase</footer>
          </section>
        </section>
      ) : (
        <section className="dashboard">
          <div className="dashboard-heading">
            <div>
              <small>WORKSPACE OVERVIEW</small>
              <h1>Welcome to WorkTrack</h1>
              <p>{userEmail}</p>
            </div>
            <button onClick={logout} disabled={busy}>
              <LogOut size={16} /> Sign out
            </button>
          </div>

          {workspace && membership ? (
            <>
              <section className="workspace-card">
                <Building2 size={24} />
                <div>
                  <small>ACTIVE WORKSPACE</small>
                  <h2>{workspace.name}</h2>
                  <p>{workspace.slug}</p>
                </div>
                <span className="role-badge">{roleLabel}</span>
              </section>

              <div className="module-grid">
                <article className="module-card">
                  <CalendarClock />
                  <h3>Timesheets</h3>
                  <p>Daily work entries, hours and approval workflows.</p>
                  <span className="module-status">Module setup pending</span>
                </article>
                <article className="module-card">
                  <ReceiptText />
                  <h3>Conveyance</h3>
                  <p>Travel claims, amounts and approval workflows.</p>
                  <span className="module-status">Module setup pending</span>
                </article>
                <article className="module-card">
                  <Users />
                  <h3>Team & Members</h3>
                  <p>Organization membership and role management.</p>
                  <span className="module-status">Access controlled</span>
                </article>
                <article className="module-card">
                  <FileSpreadsheet />
                  <h3>Excel Reports</h3>
                  <p>Exports for timesheets and conveyance records.</p>
                  <span className="module-status">Module setup pending</span>
                </article>
              </div>

              <section className="security-note">
                <LockKeyhole />
                <div>
                  <b>Workspace membership verified</b>
                  <p>This view loads only a membership returned by Supabase policies. It does not grant additional database permissions.</p>
                </div>
                <button className="secondary-button" onClick={refreshWorkspace} disabled={busy}>
                  <RefreshCw size={15} /> Refresh
                </button>
              </section>
            </>
          ) : (
            <section className="card access-card">
              <LockKeyhole size={28} />
              <h2>Workspace access not available</h2>
              <p>Your account is authenticated, but the app could not confirm a workspace membership.</p>
              <p>Ask an administrator to verify your membership and RLS policies.</p>
              <button onClick={refreshWorkspace} disabled={busy}>
                {busy ? "Checking…" : "Check again"}
              </button>
            </section>
          )}

          {notice && <p className="notice" role="alert">{notice}</p>}
        </section>
      )}

      <div className="bottom">
        © {new Date().getFullYear()} Team WorkTrack
        <span>Timesheet · Conveyance · Reporting</span>
      </div>
    </main>
  );
}
