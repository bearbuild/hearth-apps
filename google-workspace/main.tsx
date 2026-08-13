import { createRoot } from "https://esm.sh/react-dom@19/client";
import { useEffect, useState } from "https://esm.sh/react@19";

declare const capabilities: {
  integrations: {
    fetch: (id: string, url: string, init?: RequestInit & { connection?: string }) => Promise<Response>;
    list: (id: string) => Promise<
      Array<{
        id: string;
        label: string;
        connectedBy: string | { name?: string; email?: string };
        scopes: string[];
        isDefault: boolean;
        live: boolean;
      }>
    >;
    connect: (id: string, opts?: { scopes?: string[] }) => Promise<{ connectionId: string; label: string } | null>;
  };
};

// Google via Composio connects PER SERVICE: Calendar, Gmail, and Drive are
// three separate connections, even for the same person. Each service's consent
// grants a fixed set of scopes, decided by the operator's Composio auth config
// and not by anything we pass. So the unit of choice here is the SERVICE —
// which is also the unit the host connects: one consent pass links one of them.
//
// Finer-grained checkboxes (read vs. write, read-mail vs. draft-mail) would be
// theatre: unchecking "read email" cannot stop a Gmail connection from
// carrying gmail.readonly. What actually bounds this app is the scope list it
// DECLARES in playground.json, which the host enforces as a ceiling.
const SERVICES = [
  {
    id: "calendar",
    label: "Google Calendar",
    description: "Read upcoming events and create new ones.",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  },
  {
    id: "gmail",
    label: "Gmail",
    description:
      "Read messages and compose drafts. Google grants these together — a connection that can draft can also read.",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
    warning:
      "Emails can contain hidden instructions from untrusted senders. When the agent can read your inbox, a crafted message could attempt prompt injection — tricking the agent into following attacker instructions — or expose sensitive details like password resets and verification codes. Connecting Gmail grants reading and drafting together; there is no draft-only option. Consider whether you need this before enabling.",
  },
  {
    id: "drive",
    label: "Google Drive",
    description: "List, search, and download files. Read-only.",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  },
];

// Services enabled by default when opening the connect form. Gmail is OFF:
// inbox content comes from untrusted senders and can carry prompt-injection or
// credential-leakage attacks, so it stays an explicit opt-in.
const DEFAULT_SERVICE_IDS = SERVICES.filter((s) => s.id !== "gmail").map((s) => s.id);

type Account = {
  id: string;
  label: string;
  connectedBy: string | { name?: string; email?: string };
  scopes: string[];
  isDefault: boolean;
  live: boolean;
};

function formatConnectedBy(
  connectedBy: string | { name?: string; email?: string }
): string {
  return typeof connectedBy === "string"
    ? connectedBy
    : connectedBy?.name || connectedBy?.email || "Unknown";
}

// Which service a connection serves. Rows carry their own service's scopes
// only, so the scope list identifies it.
function servicesFromScopes(scopes: string[]) {
  const set = new Set(scopes);
  return SERVICES.filter((s) => s.scopes.every((scope) => set.has(scope)));
}

// One Google account is up to three connections (one per service), all sharing
// the account email as their label — so group by label or the same person
// renders three times.
function groupByAccount(accounts: Account[]) {
  const groups = new Map<string, { label: string; rows: Account[] }>();
  for (const a of accounts) {
    const key = a.label || a.id;
    const group = groups.get(key) ?? { label: a.label || "Unknown account", rows: [] };
    group.rows.push(a);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    () => new Set(DEFAULT_SERVICE_IDS)
  );

  async function loadAccounts() {
    try {
      const list = await capabilities.integrations.list("google-composio");
      setAccounts(list);
      return list;
    } catch {
      setAccounts([]);
      return [];
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function toggleService(serviceId: string) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  }

  // One consent pass links ONE service, so connecting Calendar + Drive means
  // two passes. We drive them here rather than leaving the user to guess why
  // only part of what they checked ended up connected. Each pass requests just
  // that service's scopes, which is what makes the host pick it.
  async function connectAccount() {
    const chosen = SERVICES.filter((s) => selectedServices.has(s.id));
    if (chosen.length === 0) {
      setStatus("Select at least one service to connect.");
      return;
    }
    setLoading(true);
    const connected: string[] = [];
    try {
      for (const service of chosen) {
        setStatus(`Opening Google consent for ${service.label}…`);
        const linked = await capabilities.integrations.connect("google-composio", {
          scopes: service.scopes,
        });
        if (!linked) {
          setStatus(
            connected.length > 0
              ? `Connected ${connected.join(", ")}. Cancelled at ${service.label}.`
              : "Connection cancelled."
          );
          return;
        }
        connected.push(`${service.label} (${linked.label})`);
        await loadAccounts();
      }
      setStatus(`Connected ${connected.join(", ")}.`);
      setShowAddForm(false);
      setSelectedServices(new Set(DEFAULT_SERVICE_IDS));
    } catch (err: any) {
      const detail = err instanceof Error ? err.message : String(err);
      setStatus(
        connected.length > 0
          ? `Connected ${connected.join(", ")}, then failed: ${detail}`
          : `Error: ${detail}`
      );
    } finally {
      setLoading(false);
    }
  }

  const groups = groupByAccount(accounts);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <style>{`
        .gw-info { position: relative; display: inline-flex; align-items: center; cursor: help; opacity: .55; font-size: .85em; }
        .gw-info:hover { opacity: 1; }
        .gw-info-tip {
          display: none; position: absolute; bottom: calc(100% + 8px); left: 50%;
          transform: translateX(-50%); width: 300px; padding: 10px 12px;
          border-radius: 6px; background: #1c1c28; color: #e8e8ef;
          font-size: 12px; line-height: 1.5; z-index: 50; font-weight: normal;
          box-shadow: 0 4px 14px rgba(0,0,0,.35); text-align: left; white-space: normal;
        }
        .gw-info:hover .gw-info-tip { display: block; }
      `}</style>
      <h1 className="text-xl font-semibold mb-2">Google Workspace</h1>
      <p className="text-muted-foreground mb-6">
        Connect Google accounts and choose which services the agent can use. Calendar, Gmail, and Drive connect separately, so each one you pick opens its own Google consent step. To remove a service, disconnect it in Settings → Integrations.
      </p>

      {/* Connected accounts — read-only summary, one card per Google account */}
      {groups.length > 0 && (
        <div className="space-y-4 mb-6">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Connected accounts</h2>
          {groups.map((group) => {
            const linked = SERVICES.filter((s) =>
              group.rows.some((row) => servicesFromScopes(row.scopes).some((rs) => rs.id === s.id))
            );
            const connectedBy = formatConnectedBy(group.rows[0].connectedBy);
            const isDefault = group.rows.some((row) => row.isDefault);
            return (
              <div key={group.label} className="border rounded-md p-4">
                <div className="font-medium">{group.label}</div>
                <div className="text-sm text-muted-foreground mb-3">
                  connected by {connectedBy}
                  {isDefault && " · default"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {linked.length > 0 ? (
                    linked.map((s) => (
                      <span
                        key={s.id}
                        className="inline-block text-xs px-2 py-1 rounded-full border bg-accent"
                      >
                        {s.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No services connected.</span>
                  )}
                </div>
                {linked.length < SERVICES.length && (
                  <div className="text-xs text-muted-foreground mt-3">
                    Not connected: {SERVICES.filter((s) => !linked.includes(s)).map((s) => s.label).join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add account button / inline form */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          disabled={loading}
          className="px-4 py-2 border rounded-md hover:bg-accent disabled:opacity-50"
        >
          {accounts.length === 0 ? "Connect a Google account" : "Connect more services or another account"}
        </button>
      ) : (
        <div className="border rounded-md p-4 mb-6">
          <h2 className="font-medium mb-2">Connect Google services</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Each service you check opens its own Google consent step, one after the other.
          </p>
          <div className="space-y-2 mb-4">
            {SERVICES.map((s) => (
              <label
                key={s.id}
                className="flex items-start gap-3 cursor-pointer hover:bg-accent p-2 rounded-md"
              >
                <input
                  type="checkbox"
                  checked={selectedServices.has(s.id)}
                  onChange={() => toggleService(s.id)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {s.label}
                    {s.warning && (
                      <span className="gw-info" role="img" aria-label="Security note">
                        <span aria-hidden="true">ⓘ</span>
                        <span className="gw-info-tip">{s.warning}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={connectAccount}
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Connecting…" : "Connect"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setSelectedServices(new Set(DEFAULT_SERVICE_IDS));
                setStatus("");
              }}
              disabled={loading}
              className="px-4 py-2 border rounded-md hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && <p className="mt-4 text-sm">{status}</p>}
    </div>
  );
}

export default (root: HTMLElement) => {
  const r = createRoot(root);
  r.render(<App />);
  return () => r.unmount();
};
