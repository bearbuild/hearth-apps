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

const GROUPS = [
  {
    id: "calendar-read",
    label: "Read calendar events",
    description: "List and view upcoming calendar events.",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
  },
  {
    id: "calendar-write",
    label: "Create calendar events",
    description: "Add new events to your calendar.",
    scope: "https://www.googleapis.com/auth/calendar.events",
  },
  {
    id: "gmail-read",
    label: "Read emails",
    description: "List and read Gmail messages.",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
  },
  {
    id: "gmail-drafts",
    label: "Compose email drafts",
    description: "Create unsent Gmail drafts. Note: Google's compose scope is required for drafts and also allows sending.",
    scope: "https://www.googleapis.com/auth/gmail.compose",
  },
  {
    id: "drive-read",
    label: "Read Google Drive files",
    description: "List, search, and download files from your Google Drive.",
    scope: "https://www.googleapis.com/auth/drive.readonly",
  },
];

function formatConnectedBy(
  connectedBy: string | { name?: string; email?: string }
): string {
  return typeof connectedBy === "string"
    ? connectedBy
    : connectedBy?.name || connectedBy?.email || "Unknown";
}

function groupsFromScopes(scopes: string[]) {
  const set = new Set(scopes);
  return GROUPS.filter((g) => set.has(g.scope));
}

function App() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(
    () => new Set(GROUPS.map((g) => g.id))
  );

  async function loadAccounts() {
    try {
      const list = await capabilities.integrations.list("google");
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

  function toggleGroup(groupId: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function connectAccount() {
    const scopes = GROUPS.filter((g) => selectedGroups.has(g.id)).map((g) => g.scope);
    if (scopes.length === 0) {
      setStatus("Select at least one capability to connect.");
      return;
    }
    setLoading(true);
    setStatus("Opening Google consent…");
    try {
      const linked = await capabilities.integrations.connect("google", { scopes });
      if (!linked) {
        setStatus("Connection cancelled.");
      } else {
        await loadAccounts();
        setStatus(`Connected ${linked.label}.`);
        setShowAddForm(false);
        setSelectedGroups(new Set(GROUPS.map((g) => g.id)));
      }
    } catch (err: any) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Google Workspace</h1>
      <p className="text-muted-foreground mb-6">
        Connect Google accounts and choose which capabilities the agent can use for each. To change an account's capabilities, disconnect it from Google and reconnect with the desired scopes.
      </p>

      {/* Connected accounts — read-only summary */}
      {accounts.length > 0 && (
        <div className="space-y-4 mb-6">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Connected accounts</h2>
          {accounts.map((a) => {
            const enabled = groupsFromScopes(a.scopes);
            return (
              <div key={a.id} className="border rounded-md p-4">
                <div className="font-medium">{a.label}</div>
                <div className="text-sm text-muted-foreground mb-3">
                  connected by {formatConnectedBy(a.connectedBy)}
                  {a.isDefault && " · default"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {enabled.length > 0 ? (
                    enabled.map((g) => (
                      <span
                        key={g.id}
                        className="inline-block text-xs px-2 py-1 rounded-full border bg-accent"
                      >
                        {g.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No capabilities enabled.</span>
                  )}
                </div>
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
          {accounts.length === 0 ? "Connect a Google account" : "Add another Google account"}
        </button>
      ) : (
        <div className="border rounded-md p-4 mb-6">
          <h2 className="font-medium mb-2">Connect a Google account</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose which capabilities to request. You can reconnect later with different scopes.
          </p>
          <div className="space-y-2 mb-4">
            {GROUPS.map((g) => (
              <label
                key={g.id}
                className="flex items-start gap-3 cursor-pointer hover:bg-accent p-2 rounded-md"
              >
                <input
                  type="checkbox"
                  checked={selectedGroups.has(g.id)}
                  onChange={() => toggleGroup(g.id)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-sm">{g.label}</div>
                  <div className="text-xs text-muted-foreground">{g.description}</div>
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
                setSelectedGroups(new Set(GROUPS.map((g) => g.id)));
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