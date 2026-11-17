import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";
import { allowedActions, comparePending, comparePeople, type AccountStatus, type PersonRow } from "../lib/peopleRules";
import { peopleActionMessage, STALE_MESSAGE } from "../lib/peopleErrors";
import { usePendingCount } from "../people/PendingCount";

type NewRole = "member" | "admin";
type Confirming = { id: string; kind: "reject" | "disable" | "role"; role?: NewRole } | null;
interface ErrorLike {
  message?: string;
  code?: string;
}

const STATUS_LABEL: Record<AccountStatus, string> = { pending: "Pending", active: "Active", disabled: "Disabled" };
const day = (iso: string) => new Date(iso).toLocaleDateString();
const moment = (iso: string) => new Date(iso).toLocaleString();

// A small inline confirmation, in the same style as the Invites tab. Defined at module scope so it is
// not recreated (and its focus lost) on every render of the page.
function Confirm({ email, question, verb, busy, onYes, onCancel }: {
  email: string; question: string; verb: string; busy: boolean; onYes: () => void; onCancel: () => void;
}) {
  return (
    <span className="row-actions" role="group" aria-label={`Confirm for ${email}`}>
      <span>{question}</span>
      <button type="button" disabled={busy} onClick={onYes}>Yes, {verb}</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </span>
  );
}

export function PeopleTab() {
  const { state } = useAuth();
  const { refresh: refreshCount } = usePendingCount();
  const viewerRole = state.status === "signedIn" ? state.role : "member";
  const myId = state.status === "signedIn" ? state.session.user.id : "";

  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  // State updates are asynchronous; this closes the gap between two quick clicks.
  const inFlight = useRef(false);

  useEffect(() => {
    document.title = "People · Brent Hedging Model";
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase.from("profiles").select("id,email,role,status,created_at");
    if (err) {
      setLoadError("Could not load the people. Try again.");
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as PersonRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Runs one change, then reloads both lists and the header count whatever happened, so the screen
  // always shows the database's answer. `needRow` is for conditional updates: no row back means the
  // account changed since the page loaded (or the viewer may no longer see it).
  async function perform(
    run: () => PromiseLike<{ data: unknown; error: ErrorLike | null }>,
    opts: { success: string; needRow: boolean },
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirming(null);
    try {
      const { data, error: err } = await run();
      if (err) setError(peopleActionMessage(err));
      else if (opts.needRow && (!Array.isArray(data) || data.length === 0)) setError(STALE_MESSAGE);
      else setNotice(opts.success);
    } finally {
      await Promise.all([load(), refreshCount()]);
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Each update names the state the page showed, so a stale click cannot undo someone else's decision.
  const update = (row: PersonRow, patch: { status?: AccountStatus; role?: NewRole }, expect: { status?: AccountStatus; role?: string }) => {
    let query = supabase!.from("profiles").update(patch).eq("id", row.id);
    if (expect.status) query = query.eq("status", expect.status);
    if (expect.role) query = query.eq("role", expect.role);
    return query.select("id");
  };

  const approve = (row: PersonRow) =>
    perform(() => update(row, { status: "active" }, { status: "pending" }), {
      success: `Approved ${row.email}. They are now an active member and can sign in.`, needRow: true,
    });
  const reject = (row: PersonRow) =>
    perform(() => supabase!.rpc("reject_pending_request", { p_user_id: row.id }), {
      success: `Rejected the request from ${row.email}. They can ask again.`, needRow: false,
    });
  const disable = (row: PersonRow) =>
    perform(() => update(row, { status: "disabled" }, { status: "active" }), {
      success: `${row.email} is disabled. They will be signed out shortly.`, needRow: true,
    });
  const restore = (row: PersonRow) =>
    perform(() => update(row, { status: "active" }, { status: "disabled" }), {
      success: `${row.email} is active again.`, needRow: true,
    });
  const changeRole = (row: PersonRow, role: NewRole) =>
    perform(() => update(row, { role }, { role: row.role }), {
      success: `${row.email} is now ${role === "admin" ? "an admin" : "a member"}.`, needRow: true,
    });

  const pending = (rows ?? []).filter((r) => r.status === "pending").sort(comparePending);
  const people = (rows ?? []).filter((r) => r.status !== "pending").sort(comparePeople);

  return (
    <div>
      <div className="toolbar">
        <button type="button" onClick={() => void Promise.all([load(), refreshCount()])}>Refresh</button>
      </div>

      {/* Always rendered, so assistive technology is already watching them when text appears. */}
      <div role="alert" className="form-error">{error}</div>
      <div role="status" className="note">{notice}</div>

      {loadError && <p role="alert" className="form-error">{loadError}</p>}
      {!loadError && rows === null && <p role="status">Loading…</p>}

      {rows && (
        <>
          <h2 id="pending-heading">Pending requests</h2>
          {pending.length === 0 ? (
            <p>No pending requests.</p>
          ) : (
            <table className="people-table" aria-labelledby="pending-heading">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Requested</th>
                  <th scope="col">Note</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => {
                  const actions = allowedActions(viewerRole, row, row.id === myId);
                  const isConfirming = confirming?.id === row.id && confirming.kind === "reject";
                  return (
                    <tr key={row.id}>
                      <td>{row.email}</td>
                      <td>{moment(row.created_at)}</td>
                      <td><span className="flag">email not verified</span></td>
                      <td>
                        {isConfirming ? (
                          <Confirm email={row.email} question="Reject and delete this request?" verb="reject" busy={busy} onYes={() => void reject(row)} onCancel={() => setConfirming(null)} />
                        ) : (
                          <span className="row-actions">
                            {actions.approve && (
                              <button type="button" disabled={busy} onClick={() => void approve(row)} aria-label={`Approve request from ${row.email}`}>Approve</button>
                            )}
                            {actions.reject && (
                              <button type="button" onClick={() => setConfirming({ id: row.id, kind: "reject" })} aria-label={`Reject request from ${row.email}`}>Reject</button>
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

          <h2 id="people-heading">Everyone</h2>
          {people.length === 0 ? (
            <p>Nobody else yet.</p>
          ) : (
            <table className="people-table" aria-labelledby="people-heading">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((row) => {
                  const isSelf = row.id === myId;
                  const actions = allowedActions(viewerRole, row, isSelf);
                  const confirm = confirming?.id === row.id ? confirming : null;
                  return (
                    <tr key={row.id}>
                      <td>{row.email}{isSelf && " (you)"}</td>
                      <td>
                        {actions.roleOptions.length > 0 ? (
                          <select
                            aria-label={`Role for ${row.email}`} value={row.role}
                            onChange={(e) => {
                              const role = e.target.value as NewRole;
                              if (role !== row.role) setConfirming({ id: row.id, kind: "role", role });
                            }}
                          >
                            {actions.roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          row.role
                        )}
                      </td>
                      <td><span className={`status status-${row.status}`}>{STATUS_LABEL[row.status]}</span></td>
                      <td>{day(row.created_at)}</td>
                      <td>
                        {confirm?.kind === "disable" ? (
                          <Confirm email={row.email} question="Disable this account?" verb="disable" busy={busy} onYes={() => void disable(row)} onCancel={() => setConfirming(null)} />
                        ) : confirm?.kind === "role" && confirm.role ? (
                          <Confirm
                            email={row.email} busy={busy} verb={confirm.role === "admin" ? "make admin" : "make member"}
                            question={`Make this person ${confirm.role === "admin" ? "an admin" : "a member"}?`}
                            onYes={() => void changeRole(row, confirm.role as NewRole)} onCancel={() => setConfirming(null)}
                          />
                        ) : (
                          <span className="row-actions">
                            {actions.disable && (
                              <button type="button" onClick={() => setConfirming({ id: row.id, kind: "disable" })} aria-label={`Disable ${row.email}`}>Disable</button>
                            )}
                            {actions.restore && (
                              <button type="button" disabled={busy} onClick={() => void restore(row)} aria-label={`Restore ${row.email}`}>Restore</button>
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
        </>
      )}
    </div>
  );
}
