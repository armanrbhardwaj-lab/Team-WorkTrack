
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Activity, CalendarClock, BriefcaseBusiness, Users, ShieldCheck,
  LogOut, Building2, FileSpreadsheet, ReceiptText, RefreshCw,
  LockKeyhole, Download, Plus, Clock3
} from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase";

type Membership = {
  organization_id: string;
  role: "super_admin" | "company_admin" | "hr" | "employee";
  organizations: { id: string; name: string; slug: string } | null;
};

type Client = {
  id: string;
  client_code: string;
  client_name: string;
  is_active: boolean;
};

type Timesheet = {
  id: string;
  work_date: string;
  client_id: string | null;
  project_id: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  work_minutes: number;
  description: string | null;
  status: string;
};

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function minutesBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - sh * 60 - sm);
}

function hoursLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

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

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [entries, setEntries] = useState<Timesheet[]>([]);
  const [workDate, setWorkDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("18:30");
  const [description, setDescription] = useState("");

  const workspace = membership?.organizations;
  const roleLabel = membership?.role?.replaceAll("_", " ") ?? "";
  const calculatedMinutes = minutesBetween(startTime, endTime);

  const loadWorkspace = useCallback(async (id: string, userEmailAddress: string) => {
    if (!supabase) return;
    setUserId(id);
    setUserEmail(userEmailAddress);
    setMembership(null);
    setClients([]);
    setClientId("");
    setClientSearch("");
    setEntries([]);
    setNotice("");

    const { data, error } = await supabase
      .from("memberships")
      .select("organization_id, role, organizations(id, name, slug)")
      .eq("user_id", id)
      .limit(1)
      .maybeSingle();

    if (error) {
      setNotice(`Could not load workspace access: ${error.message}`);
      return;
    }
    if (!data) {
      setNotice("Your account has no workspace membership. Ask your administrator to check access.");
      return;
    }

    const member = data as unknown as Membership;
    setMembership(member);

    const { data: clientRows, error: clientError } = await supabase
      .from("clients")
      .select("id, client_code, client_name, is_active")
      .eq("organization_id", member.organization_id)
      .eq("is_active", true)
      .order("client_name", { ascending: true });

    if (clientError) {
      setNotice(`Could not load clients: ${clientError.message}`);
    } else {
      setClients((clientRows ?? []) as Client[]);
    }

    const { data: rows, error: timesheetError } = await supabase
      .from("timesheet_entries")
      .select("id, work_date, client_id, project_id, start_time, end_time, break_minutes, work_minutes, description, status")
      .eq("organization_id", member.organization_id)
      .eq("user_id", id)
      .order("work_date", { ascending: false })
      .limit(100);

    if (timesheetError) {
      setNotice(`Timesheet could not load: ${timesheetError.message}`);
    } else {
      setEntries((rows ?? []) as Timesheet[]);
    }
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
      if (error) setNotice(error.message);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        setSignedIn(true);
        window.setTimeout(() => {
          if (active) void loadWorkspace(session.user.id, session.user.email ?? "");
        }, 0);
      } else {
        setSignedIn(false);
        setMembership(null);
        setClients([]);
        setClientId("");
        setClientSearch("");
            setEntries([]);
        setUserId("");
        setUserEmail("");
        setNotice("");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  // Keyboard shortcuts: Alt+Shift+D = Date, Alt+Shift+I = Time In, Alt+Shift+O = Time Out.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      const fieldIds: Record<string, string> = {
        d: "workDate",
        i: "startTime",
        o: "endTime",
      };
      const fieldId = fieldIds[key];
      if (!fieldId) return;

      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === "TEXTAREA") return;
      if (target instanceof HTMLInputElement &&
          !["date", "time"].includes(target.type)) return;

      const field = document.getElementById(fieldId) as HTMLInputElement | null;
      if (!field || field.disabled) return;

      event.preventDefault();
      field.focus();
      try {
        field.showPicker?.();
      } catch {
        // Some browsers do not allow opening a native picker from every shortcut.
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    if (!userId) return;
    setBusy(true);
    await loadWorkspace(userId, userEmail);
    setBusy(false);
  }

  async function submitTimesheet(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !membership || !clientId) {
      setNotice("Please select a client for this timesheet entry.");
      return;
    }
    if (!clients.some(client => client.id === clientId && client.is_active)) {
      setNotice("Please select an active client from your company list.");
      return;
    }
    if (!startTime || !endTime || calculatedMinutes <= 0) {
      setNotice("End time must be later than start time. Overnight shifts are not supported yet.");
      return;
    }
    setBusy(true);
    setNotice("");

    const { error } = await supabase.from("timesheet_entries").insert({
      organization_id: membership.organization_id,
      user_id: userId,
      client_id: clientId,
      project_id: null,
      work_date: workDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: 0,
      description: description.trim() || null,
      status: "pending"
    });

    if (error) {
      setNotice(`Could not submit timesheet: ${error.message}`);
    } else {
      setNotice("Timesheet submitted successfully.");
      setDescription("");
      await loadWorkspace(userId, userEmail);
    }
    setBusy(false);
  }

  function exportTimesheets() {
    const clientForEntry = (id: string | null) => clients.find(client => client.id === id);
    const rows = [
      ["Work Date", "Client Name", "Client Code", "Client ID", "Start Time", "End Time", "Net Hours", "Description", "Status"],
      ...entries.map(entry => {
        const client = clientForEntry(entry.client_id);
        return [
          entry.work_date,
          client?.client_name ?? "",
          client?.client_code ?? "",
          entry.client_id,
          entry.start_time,
          entry.end_time,
          hoursLabel(Number(entry.work_minutes)),
          entry.description ?? "",
          entry.status
        ];
      })
    ];
    downloadCSV(rows, "Team-WorkTrack-Timesheets.csv");
  }

  const pendingCount = entries.filter(entry => entry.status === "pending").length;
  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.work_minutes || 0), 0);

  return (
    <main className="shell">
      <header>
        <div className="brand"><span className="mark"><Activity /></span> Team <b>WorkTrack</b></div>
        <span className="secure"><ShieldCheck size={16} /> Secure workspace portal</span>
      </header>

      {!supabaseConfigured ? (
        <section className="card">
          <h2>Configuration required</h2>
          <p>Supabase environment variables are missing. Configure them in Vercel and redeploy.</p>
        </section>
      ) : loading ? (
        <section className="card"><RefreshCw className="spin" /><h2>Checking your session…</h2></section>
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
            <small>WELCOME BACK</small><h2>Sign in to WorkTrack</h2>
            <p>Use your organization account to continue.</p>
            <form onSubmit={login}>
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            </form>
            {notice && <p className="notice" role="alert">{notice}</p>}
            <footer><ShieldCheck size={15} /> Secure authentication via Supabase</footer>
          </section>
        </section>
      ) : (
        <section className="dashboard">
          <div className="dashboard-heading">
            <div><small>WORKSPACE OVERVIEW</small><h1>Welcome to WorkTrack</h1><p>{userEmail}</p></div>
            <button onClick={logout} disabled={busy}><LogOut size={16} /> Sign out</button>
          </div>

          {workspace && membership ? (
            <>
              <section className="workspace-card">
                <Building2 size={24} />
                <div><small>ACTIVE WORKSPACE</small><h2>{workspace.name}</h2><p>{workspace.slug}</p></div>
                <span className="role-badge">{roleLabel}</span>
              </section>

              <div className="module-grid">
                <article className="module-card">
                  <CalendarClock /><h3>Timesheets</h3>
                  <p>Entries submitted: {entries.length}</p>
                  <span className="module-status">{pendingCount} pending</span>
                </article>
                <article className="module-card">
                  <Clock3 /><h3>Net Hours</h3>
                  <p>Total hours in loaded entries</p>
                  <span className="module-status">{hoursLabel(totalMinutes)}</span>
                </article>
                <article className="module-card">
                  <BriefcaseBusiness /><h3>Available Clients</h3>
                  <p>Choose the client you worked for on each timesheet entry.</p>
                  <span className="module-status">{clients.length} active</span>
                </article>
                <article className="module-card">
                  <FileSpreadsheet /><h3>Excel Reports</h3>
                  <p>Export your loaded timesheet entries to a spreadsheet-compatible file.</p>
                  <button type="button" onClick={exportTimesheets} disabled={!entries.length}>
                    <Download size={15} /> Export CSV
                  </button>
                </article>
              </div>

              <section className="card timesheet-panel">
                <h2><Plus size={20} /> Add Daily Timesheet</h2>
                <p>Select the client you worked for on each entry. Client records are maintained by your team leader; no project assignment is required. Net working time is calculated automatically from Time In and Time Out. Keyboard shortcuts: Alt + Shift + D (Date), Alt + Shift + I (Time In), Alt + Shift + O (Time Out).</p>
                <form onSubmit={submitTimesheet}>
                  <label htmlFor="workDate">Work date</label>
                  <input id="workDate" type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} required />

                  <label htmlFor="clientSearch">Client Name</label>
                  <input
                    id="clientSearch"
                    list="worktrack-client-options"
                    value={clientSearch}
                    onChange={e => {
                      const value = e.target.value;
                      setClientSearch(value);
                      const match = clients.find(client =>
                        client.client_name.toLocaleLowerCase() === value.trim().toLocaleLowerCase()
                      );
                      setClientId(match?.id ?? "");
                    }}
                    placeholder="Search and select a client..."
                    autoComplete="off"
                    required
                  />
                  <datalist id="worktrack-client-options">
                    {clients.map(client => (
                      <option key={client.id} value={client.client_name}>
                        {client.client_code}
                      </option>
                    ))}
                  </datalist>

                  <label htmlFor="clientCode">Client Code</label>
                  <input
                    id="clientCode"
                    value={clients.find(client => client.id === clientId)?.client_code ?? ""}
                    readOnly
                    placeholder="Auto-filled from selected client"
                  />

                  <label htmlFor="clientUuid">Client ID</label>
                  <input
                    id="clientUuid"
                    value={clientId}
                    readOnly
                    placeholder="Auto-filled from selected client"
                  />

                  <label htmlFor="clientUuid">Client ID</label>
                  <input
                    id="clientUuid"
                    value={clientId}
                    readOnly
                    placeholder="Automatically mapped from Client Name"
                  />

                  {!clients.length && <p className="notice">No active clients found for this workspace. Ask your team leader to create a client.</p>}

                  <div className="time-grid">
                    <div><label htmlFor="startTime">Start time</label><input id="startTime" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required /></div>
                    <div><label htmlFor="endTime">End time</label><input id="endTime" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required /></div>
                  </div>

                  <label htmlFor="description">Work description / remarks</label>
                  <textarea id="description" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the work completed…" />

                  <div className="hours-preview"><Clock3 size={18} /><span>Net working time</span><b>{hoursLabel(calculatedMinutes)}</b></div>
                  <button disabled={busy || !clientId || calculatedMinutes <= 0}>
                    {busy ? "Processing…" : "Submit Timesheet"}
                  </button>
                </form>
              </section>

              <section className="card timesheet-panel">
                <div className="dashboard-heading">
                  <div><h2>My Timesheet History</h2><p>Latest 100 entries</p></div>
                  <button type="button" onClick={exportTimesheets} disabled={!entries.length}><Download size={15} /> Export CSV</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Client</th><th>Client Code</th><th>Time</th><th>Net hours</th><th>Status</th></tr></thead>
                    <tbody>
                      {entries.map(entry => (
                        <tr key={entry.id}>
                          <td>{entry.work_date}</td>
                          <td>{clients.find(client => client.id === entry.client_id)?.client_name ?? "Client"}</td>
                          <td>{clients.find(client => client.id === entry.client_id)?.client_code ?? "—"}</td>
                          <td>{entry.start_time?.slice(0, 5)}–{entry.end_time?.slice(0, 5)}</td>
                          <td>{hoursLabel(Number(entry.work_minutes || 0))}</td>
                          <td><span className="role-badge">{entry.status}</span></td>
                        </tr>
                      ))}
                      {!entries.length && <tr><td colSpan={6}>No timesheet entries yet. Submit your first entry above.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="security-note">
                <LockKeyhole />
                <div><b>Workspace membership verified</b><p>Database access remains controlled by Supabase policies.</p></div>
                <button className="secondary-button" onClick={refreshWorkspace} disabled={busy}><RefreshCw size={15} /> Refresh</button>
              </section>
            </>
          ) : (
            <section className="card access-card">
              <LockKeyhole size={28} /><h2>Workspace access not available</h2>
              <p>Your account is authenticated, but the app could not confirm a workspace membership.</p>
              <button onClick={refreshWorkspace} disabled={busy}>Check again</button>
            </section>
          )}
          {notice && <p className="notice" role="alert">{notice}</p>}
        </section>
      )}

      <div className="bottom">© {new Date().getFullYear()} Team WorkTrack <span>Timesheet · Conveyance · Reporting</span></div>
    </main>
  );
}
