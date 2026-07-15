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
  };
};

const GROUPS = [
  {
    id: "calendar-read",
    tools: ["list_calendar_events", "get_calendar_event"],
    scope: "https://www.googleapis.com/auth/calendar.readonly",
  },
  {
    id: "calendar-write",
    tools: ["create_calendar_event"],
    scope: "https://www.googleapis.com/auth/calendar.events",
  },
  {
    id: "gmail-read",
    tools: ["list_emails", "get_email"],
    scope: "https://www.googleapis.com/auth/gmail.readonly",
  },
  {
    id: "gmail-drafts",
    tools: ["compose_draft"],
    scope: "https://www.googleapis.com/auth/gmail.compose",
  },
  {
    id: "drive-read",
    tools: ["list_drive_files", "stat_drive_file", "read_drive_file"],
    scope: "https://www.googleapis.com/auth/drive.readonly",
  },
];

const TOOL_TO_GROUP: Record<string, string> = {};
for (const g of GROUPS) {
  for (const t of g.tools) TOOL_TO_GROUP[t] = g.id;
}

function formatConnectedBy(
  connectedBy: string | { name?: string; email?: string }
): string {
  return typeof connectedBy === "string"
    ? connectedBy
    : connectedBy?.name || connectedBy?.email || "Unknown";
}

async function listGoogleAccounts() {
  try {
    return await capabilities.integrations.list("google");
  } catch {
    return [];
  }
}

// Pick the connection id to use for a tool.  If the caller passed a specific
// connection, verify it has the required scope granted.  Otherwise pick the
// default account, or the first account that has the tool's scope granted.
async function resolveConnection(
  toolName: string,
  requestedConnection?: string
): Promise<string> {
  const groupId = TOOL_TO_GROUP[toolName];
  if (!groupId) throw new Error(`Unknown tool: ${toolName}`);

  const group = GROUPS.find((g) => g.id === groupId)!;
  const requiredScope = group.scope;

  const accounts = await listGoogleAccounts();

  if (accounts.length === 0) {
    throw new Error(
      "No Google account is connected. Open the Google Workspace app to connect your account."
    );
  }

  if (requestedConnection) {
    const account = accounts.find((a) => a.id === requestedConnection);
    if (!account) {
      throw new Error(
        `Account ${requestedConnection} is not connected.`
      );
    }
    if (!account.scopes.includes(requiredScope)) {
      throw new Error(
        `Tool ${toolName} requires scope ${requiredScope} which is not granted for account ${requestedConnection}. ` +
          `Open the Google Workspace app to reconnect that account with the needed capability.`
      );
    }
    return requestedConnection;
  }

  // Prefer the default account if it has the required scope.
  const defaultAccount = accounts.find(
    (a) => a.isDefault && a.scopes.includes(requiredScope)
  );
  if (defaultAccount) return defaultAccount.id;

  // Fall back to any account with the required scope.
  const anyAccount = accounts.find((a) => a.scopes.includes(requiredScope));
  if (anyAccount) return anyAccount.id;

  throw new Error(
    `Tool ${toolName} requires scope ${requiredScope} which is not granted for any connected Google account. ` +
      `Open the Google Workspace app to connect an account with the needed capability.`
  );
}

// Handle a 409 "can't choose an account" response.  With per-member
// permissions, this happens when:
//  - the current member hasn't connected their own Google account yet, or
//  - there is no current member (background / scheduled run) and `connection`
//    was not provided.
// The 409 body carries `candidates` — the connected accounts the server
// could not auto-select from.  We surface them so the agent can guide the
// user (or the caller can retry with `init.connection`).
async function handle409(res: Response): Promise<never> {
  let body: any = {};
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  const candidates: any[] = body.candidates || [];
  if (candidates.length === 0) {
    throw new Error(
      "No Google account is connected for this workspace member. " +
        "Open the Google Workspace app to connect your own Google account and grant the required scopes."
    );
  }
  const labels = candidates
    .map(
      (c: any) =>
        `${c.label} (connected by ${formatConnectedBy(c.connectedBy)}${
          c.isDefault ? ", default" : ""
        })`
    )
    .join("; ");
  throw new Error(
    `Google account selection required. This app uses per-member permissions, ` +
      `so each member connects their own Google account. Available accounts: ${labels}. ` +
      `If this is a background or scheduled run, retry with init.connection set to the desired account id.`
  );
}

async function googleFetch(
  url: string,
  init?: RequestInit & { connection?: string }
): Promise<any> {
  const res = await capabilities.integrations.fetch("google", url, init);
  if (res.status === 409) await handle409(res);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google API error ${res.status}: ${body}`);
  }
  return res.json();
}

// Like googleFetch but returns the raw Response (for file downloads / exports
// where the body is not JSON).
async function googleFetchRaw(
  url: string,
  init?: RequestInit & { connection?: string }
): Promise<Response> {
  const res = await capabilities.integrations.fetch("google", url, init);
  if (res.status === 409) await handle409(res);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google API error ${res.status}: ${body}`);
  }
  return res;
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Standard base64 (NOT url-safe), chunked so large buffers don't overflow.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function getTextFromPayload(payload: any): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};
  if (!payload) return result;

  if (payload.body?.data) {
    const decoded = base64UrlDecode(payload.body.data);
    if (payload.mimeType === "text/plain") result.text = decoded;
    if (payload.mimeType === "text/html") result.html = decoded;
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const partText = getTextFromPayload(part);
      if (partText.text && !result.text) result.text = partText.text;
      if (partText.html && !result.html) result.html = partText.html;
    }
  }

  return result;
}

function headersToObject(headers: any[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const h of headers || []) {
    obj[h.name] = h.value;
  }
  return obj;
}

export async function list_calendar_events(input: {
  connection?: string;
  calendarId?: string;
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
  q?: string;
}) {
  const connection = await resolveConnection("list_calendar_events", input.connection);
  const calendarId = input.calendarId || "primary";
  const params = new URLSearchParams();
  params.set("maxResults", String(input.maxResults || 10));
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");
  if (input.timeMin) params.set("timeMin", input.timeMin);
  if (input.timeMax) params.set("timeMax", input.timeMax);
  if (input.q) params.set("q", input.q);

  const data = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { connection }
  );
  return { events: data.items || [], connection };
}

export async function get_calendar_event(input: {
  connection?: string;
  calendarId?: string;
  eventId: string;
}) {
  const connection = await resolveConnection("get_calendar_event", input.connection);
  const calendarId = input.calendarId || "primary";
  const data = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    { connection }
  );
  return { event: data, connection };
}

export async function create_calendar_event(input: {
  connection?: string;
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string }[];
}) {
  const connection = await resolveConnection("create_calendar_event", input.connection);
  const calendarId = input.calendarId || "primary";
  // Google accepts either { dateTime, timeZone } for a timed event or
  // { date } for an all-day event—not both. Tool callers may supply empty
  // optional fields, so remove them before forwarding to the Calendar API.
  const normalizeEventTime = (value: { dateTime?: string; date?: string; timeZone?: string }) => {
    if (value.dateTime) {
      return {
        dateTime: value.dateTime,
        ...(value.timeZone ? { timeZone: value.timeZone } : {}),
      };
    }
    return { date: value.date };
  };
  const body = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: normalizeEventTime(input.start),
    end: normalizeEventTime(input.end),
    attendees: input.attendees,
  };
  const data = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      connection,
    }
  );
  return { event: data, connection };
}

export async function list_emails(input: {
  connection?: string;
  maxResults?: number;
  q?: string;
  labelIds?: string[];
}) {
  const connection = await resolveConnection("list_emails", input.connection);
  const params = new URLSearchParams();
  params.set("maxResults", String(input.maxResults || 10));
  if (input.q) params.set("q", input.q);
  if (input.labelIds?.length) {
    for (const id of input.labelIds) params.append("labelIds", id);
  }

  const data = await googleFetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { connection }
  );
  const messages = data.messages || [];

  const enriched = await Promise.all(
    messages.slice(0, 10).map(async (m: any) => {
      try {
        const meta = await googleFetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { connection }
        );
        return {
          id: m.id,
          threadId: m.threadId,
          headers: headersToObject(meta.payload?.headers || []),
          snippet: meta.snippet,
          labelIds: meta.labelIds,
        };
      } catch {
        return { id: m.id, threadId: m.threadId };
      }
    })
  );

  return { messages: enriched, resultSizeEstimate: data.resultSizeEstimate, connection };
}

export async function get_email(input: {
  connection?: string;
  id: string;
  format?: "minimal" | "full" | "raw" | "metadata";
}) {
  const connection = await resolveConnection("get_email", input.connection);
  const format = input.format || "full";
  const data = await googleFetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${input.id}?format=${format}`,
    { connection }
  );
  const text = getTextFromPayload(data.payload);
  const headers = headersToObject(data.payload?.headers || []);

  return {
    message: {
      id: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds,
      snippet: data.snippet,
      headers,
      ...text,
      rawPayload: data.payload,
    },
    connection,
  };
}

export async function compose_draft(input: {
  connection?: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}) {
  const connection = await resolveConnection("compose_draft", input.connection);
  const lines = [
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : "",
    input.bcc ? `Bcc: ${input.bcc}` : "",
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    input.body,
  ].filter((line) => line !== "");

  const raw = base64UrlEncode(lines.join("\r\n"));
  const data = await googleFetch("https://www.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
    connection,
  });

  return { draft: data, connection };
}

// ── Google Drive ──────────────────────────────────────────────────────────

const DRIVE_FILE_FIELDS =
  "id,name,mimeType,modifiedTime,createdTime,size,parents,webViewLink,iconLink,thumbnailLink,description,trashed";

const EXPORT_DEFAULTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/markdown",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.drawing": "image/png",
};

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

export async function list_drive_files(input: {
  connection?: string;
  pageSize?: number;
  q?: string;
  orderBy?: string;
  pageToken?: string;
}) {
  const connection = await resolveConnection("list_drive_files", input.connection);
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.min(input.pageSize || 10, 100)));
  if (input.q) params.set("q", input.q);
  if (input.orderBy) params.set("orderBy", input.orderBy);
  if (input.pageToken) params.set("pageToken", input.pageToken);
  params.set("fields", `nextPageToken,files(${DRIVE_FILE_FIELDS})`);

  const data = await googleFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { connection }
  );
  return { files: data.files || [], nextPageToken: data.nextPageToken || null, connection };
}

export async function stat_drive_file(input: { connection?: string; fileId: string }) {
  const connection = await resolveConnection("stat_drive_file", input.connection);
  const params = new URLSearchParams();
  params.set("fields", DRIVE_FILE_FIELDS);

  const data = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?${params.toString()}`,
    { connection }
  );
  return { file: data, connection };
}

export async function read_drive_file(input: {
  connection?: string;
  fileId: string;
  mimeType?: string;
}) {
  const connection = await resolveConnection("read_drive_file", input.connection);
  const fileId = input.fileId;

  const meta = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
    { connection }
  );

  const mimeType: string = meta.mimeType || "";

  let res: Response;
  let effectiveMime = mimeType;
  if (EXPORT_DEFAULTS[mimeType]) {
    effectiveMime = input.mimeType || EXPORT_DEFAULTS[mimeType];
    res = await googleFetchRaw(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(effectiveMime)}`,
      { connection }
    );
  } else {
    res = await googleFetchRaw(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { connection }
    );
  }

  const isImage = effectiveMime.startsWith("image/");
  const isPdf = effectiveMime === "application/pdf";

  if (isImage || isPdf) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_MEDIA_BYTES) {
      return {
        type: "text",
        text:
          `File "${meta.name}" (${effectiveMime}, ${buf.byteLength} bytes) is too large to inline. ` +
          `Fetch a smaller export or a specific page range instead.`,
      };
    }
    const data = bytesToBase64(buf);
    const summary = `Read "${meta.name}" (${effectiveMime}, ${buf.byteLength} bytes, id ${fileId}).`;
    return {
      type: "content",
      value: [
        isImage
          ? { type: "image-data", data, mediaType: effectiveMime }
          : { type: "file-data", data, mediaType: effectiveMime, filename: meta.name },
        { type: "text", text: summary },
      ],
    };
  }

  const text = await res.text();
  return {
    type: "content",
    value: [{ type: "text", text: `"${meta.name}" (${effectiveMime}):\n\n${text}` }],
  };
}