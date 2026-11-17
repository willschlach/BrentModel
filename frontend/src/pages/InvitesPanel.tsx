import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { inviteActionMessage } from "../lib/inviteErrors";

type InviteStatus = "active" | "used" | "disabled" | "expired" | "revoked" | "locked";

interface InviteRow {
  id: string;
  email: string;
  role: "member" | "admin";
  status: InviteStatus;
  created_at: string;
  expires_at: string;
  created_by_email: string | null;
}

// A code that was just issued. Kept only in this component's state: it is shown once and is
// gone when another invite is made, when it is dismissed, and when you leave the page.
interface Issued {
  email: string;
  role: string;
  code: string;
  expiresAt: string;
}

type Confirming = { id: string; kind: "revoke" | "regenerate" } | null;

const when = (iso: string) => new Date(iso).toLocaleString();
const STATUS_LABEL: Record<InviteStatus, string> = {
  active: "Active",
  used: "Used",
  disabled: "Disabled",
  expired: "Expired",
  revoked: "Revoked",
  locked: "Locked",
};
// Which actions make sense for each status. The database enforces the real rules.
const CAN_REVOKE: ReadonlySet<InviteStatus> = new Set(["active", "expired", "locked"]);
const CAN_EDIT_ROLE: ReadonlySet<InviteStatus> = new Set(["active", "expired", "locked"]);
const CAN_REGENERATE: ReadonlySet<InviteStatus> = new Set(["active", "expired", "locked", "revoked"]);

export function InvitesPanel() {
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);

  // State updates are asynchronous, so a fast double click could start two requests before `busy`
  // is true. This flag closes that gap.
  const inFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const issuedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Invites · Brent Hedging Model";
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("invite_list")
      .select("id,email,role,status,created_at,expires_at,created_by_email")
      .order("created_at", { ascending: false });
    if (err) {
      setLoadError("Could not load the invites. Try again.");
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as InviteRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (issued) issuedRef.current?.focus();
  }, [issued]);

  // Runs one invite function. `ok` is separate from `data` because revoke returns nothing.
  async function run(
    action: () => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
  ): Promise<{ ok: boolean; data: unknown }> {
    if (inFlight.current) return { ok: false, data: null };
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setCopyNote(null);
    setIssued(null);
    setConfirming(null);
    try {
      const { data, error: err } = await action();
      if (err) {
        setError(inviteActionMessage(err));
        return { ok: false, data: null };
      }
      await load();
      return { ok: true, data };
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function showIssued(data: unknown, fallbackEmail: string, fallbackRole: string) {
    const first = Array.isArray(data) ? (data[0] as { new_code: string; new_expires_at: string } | undefined) : undefined;
    if (!first) return;
    setIssued({ email: fallbackEmail, role: fallbackRole, code: first.new_code, expiresAt: first.new_expires_at });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (busy || !supabase) return;
    if (!email.trim()) {
      setError("Enter the email address to invite.");
      emailRef.current?.focus();
      return;
    }
    const client = supabase;
    const target = email.trim();
    const { ok, data } = await run(() => client.rpc("create_invite", { p_email: target, p_role: role }));
    if (ok) {
      showIssued(data, target.toLowerCase(), role);
      setEmail("");
      // Back to the lower-privilege default, so the next invite is not an admin one by accident.
      setRole("member");
    } else {
      emailRef.current?.focus();
    }
  }

  async function onRevoke(row: InviteRow) {
    if (!supabase) return;
    const client = supabase;
    const { ok } = await run(() => client.rpc("revoke_invite", { p_invite_id: row.id }));
    if (ok) setNotice(`Invite for ${row.email} revoked.`);
  }

  async function onRegenerate(row: InviteRow) {
    if (!supabase) return;
    const client = supabase;
    const { ok, data } = await run(() => client.rpc("regenerate_invite", { p_invite_id: row.id }));
    if (ok) showIssued(data, row.email, row.role);
  }

  async function onChangeRole(row: InviteRow, newRole: "member" | "admin") {
    if (!supabase || newRole === row.role) return;
    const client = supabase;
    const { ok } = await run(() => client.rpc("update_invite_role", { p_invite_id: row.id, p_role: newRole }));
    if (ok) setNotice(`Role for ${row.email} changed to ${newRole}.`);
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopyNote("Copied.");
    } catch {
      setCopyNote("Could not copy. Select the code and copy it by hand.");
    }
  }

  return (
    <section className="invites">
      <p className="lede">
        An invite code lets one person create an account with the role you choose. It works once, for one
        email address, and expires after 24 hours. Each email has one invite: inviting it again gives the
        same invite a new code. Give the code to the person yourself; nothing is emailed.
      </p>

      <form className="invite-form" onSubmit={onCreate} noValidate>
        <div className="field">
          <label htmlFor="invite-email">Email to invite</label>
          <input
            id="invite-email" ref={emailRef} type="email" autoComplete="off"
            value={email} onChange={(e) => setEmail(e.target.value)}
            aria-describedby="invite-error"
          />
        </div>
        <div className="field">
          <label htmlFor="invite-role">Role</label>
          <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" className="primary" disabled={busy}>Create invite</button>
      </form>

      {/* Always rendered, so assistive technology is already watching them when text appears. */}
      <div id="invite-error" role="alert" className="form-error">{error}</div>
      <div role="status" className="note">{notice}</div>

      {issued && (
        <div className="code-box" ref={issuedRef} tabIndex={-1} aria-labelledby="issued-heading">
          <h2 id="issued-heading">Invite code for {issued.email}</h2>
          <p><code className="invite-code" data-testid="issued-code">{issued.code}</code></p>
          <p>
            Role: <strong>{issued.role}</strong>. Expires {when(issued.expiresAt)}.
          </p>
          <p className="warning">
            This is the only time the code is shown. Copy it now and pass it on; it cannot be shown again.
            If it is lost, regenerate the invite.
          </p>
          <div className="row-actions">
            <button type="button" onClick={() => void copy(issued.code)}>Copy code</button>
            <button type="button" onClick={() => { setIssued(null); setCopyNote(null); }}>Done</button>
          </div>
          <div role="status" className="note">{copyNote}</div>
        </div>
      )}

      <h2>All invites</h2>
      {loadError && <p role="alert" className="form-error">{loadError}</p>}
      {!loadError && rows === null && <p role="status">Loading…</p>}
      {rows && rows.length === 0 && <p>No invites yet.</p>}
      {rows && rows.length > 0 && (
        <table className="invite-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Created by</th>
              <th scope="col">Created</th>
              <th scope="col">Expires</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isConfirming = confirming?.id === row.id;
              return (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>
                    {CAN_EDIT_ROLE.has(row.status) ? (
                      <select
                        aria-label={`Role for ${row.email}`} value={row.role}
                        onChange={(e) => void onChangeRole(row, e.target.value as "member" | "admin")}
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      row.role
                    )}
                  </td>
                  <td><span className={`status status-${row.status}`}>{STATUS_LABEL[row.status]}</span></td>
                  <td>{row.created_by_email ?? "—"}</td>
                  <td>{when(row.created_at)}</td>
                  <td>{when(row.expires_at)}</td>
                  <td>
                    {isConfirming ? (
                      <span className="row-actions" role="group" aria-label={`Confirm ${confirming.kind} for ${row.email}`}>
                        <span>{confirming.kind === "revoke" ? "Revoke this invite?" : "Replace with a new code?"}</span>
                        <button
                          type="button" disabled={busy}
                          onClick={() => void (confirming.kind === "revoke" ? onRevoke(row) : onRegenerate(row))}
                        >
                          Yes, {confirming.kind}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="row-actions">
                        {CAN_REVOKE.has(row.status) && (
                          <button type="button" onClick={() => setConfirming({ id: row.id, kind: "revoke" })} aria-label={`Revoke invite for ${row.email}`}>
                            Revoke
                          </button>
                        )}
                        {CAN_REGENERATE.has(row.status) && (
                          <button type="button" onClick={() => setConfirming({ id: row.id, kind: "regenerate" })} aria-label={`Regenerate invite for ${row.email}`}>
                            Regenerate
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
