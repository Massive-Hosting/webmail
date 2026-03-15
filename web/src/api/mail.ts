/** JMAP request builders for Email, Mailbox, Thread operations */

import { apiPost } from "./client.ts";
import type {
  JMAPRequest,
  JMAPResponse,
  JMAPMethodCall,
  JMAPFilter,
  JMAPSort,
} from "@/types/jmap.ts";
import type { Email, EmailListItem, Mailbox, Thread, Identity } from "@/types/mail.ts";
import type { Recipient, AttachmentState } from "@/stores/compose-store.ts";
import { useJMAPStateStore } from "@/stores/jmap-state-store.ts";

const JMAP_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:submission",
];

/** Send a JMAP request through our proxy */
export async function jmapRequest(request: JMAPRequest): Promise<JMAPResponse> {
  return apiPost<JMAPResponse>("/api/jmap", request);
}

/** Email list properties - lightweight for list view */
const EMAIL_LIST_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "from",
  "to",
  "cc",
  "subject",
  "receivedAt",
  "size",
  "preview",
  "keywords",
  "hasAttachment",
];

/** Full email properties - for reading pane */
const EMAIL_FULL_PROPERTIES = [
  ...EMAIL_LIST_PROPERTIES,
  "bcc",
  "replyTo",
  "sentAt",
  "bodyStructure",
  "bodyValues",
  "htmlBody",
  "textBody",
  "attachments",
  "headers",
];

/** Fetch all mailboxes */
export async function fetchMailboxes(): Promise<Mailbox[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Mailbox/get",
        {
          properties: [
            "id", "name", "parentId", "role", "sortOrder",
            "totalEmails", "unreadEmails", "totalThreads", "unreadThreads",
            "myRights",
          ],
        },
        "m0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, result] = response.methodResponses[0];
  const getResult = result as { list: Mailbox[]; state?: string };

  // Store the JMAP state for delta sync
  if (getResult.state) {
    useJMAPStateStore.getState().setMailboxState(getResult.state);
  }

  return getResult.list;
}

/** Query emails in a mailbox with pagination */
export async function fetchEmails(params: {
  mailboxId: string;
  position?: number;
  limit?: number;
  sort?: JMAPSort[];
  filter?: JMAPFilter;
}): Promise<{ emails: EmailListItem[]; total: number; position: number; threadCounts: Record<string, number> }> {
  const {
    mailboxId,
    position = 0,
    limit = 50,
    sort = [{ property: "receivedAt", isAscending: false }],
    filter,
  } = params;

  const queryFilter: JMAPFilter = {
    inMailbox: mailboxId,
    ...filter,
  };

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Email/query",
        {
          filter: queryFilter,
          sort,
          collapseThreads: true,
          position,
          limit,
        },
        "q0",
      ],
      [
        "Email/get",
        {
          "#ids": {
            resultOf: "q0",
            name: "Email/query",
            path: "/ids",
          },
          properties: EMAIL_LIST_PROPERTIES,
        },
        "g0",
      ],
      [
        "Thread/get",
        {
          "#ids": {
            resultOf: "g0",
            name: "Email/get",
            path: "/list/*/threadId",
          },
        },
        "t0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, queryResult] = response.methodResponses[0];
  const [, getResult] = response.methodResponses[1];
  const [, threadResult] = response.methodResponses[2];

  const qr = queryResult as { total: number; position: number; ids: string[] };
  const gr = getResult as { list: EmailListItem[]; state?: string };
  const tr = threadResult as { list: Thread[] };

  // Store the JMAP state for delta sync
  if (gr.state) {
    useJMAPStateStore.getState().setEmailState(gr.state);
  }

  // Build a map of threadId -> number of emails in thread
  const threadCounts: Record<string, number> = {};
  if (tr.list) {
    for (const thread of tr.list) {
      threadCounts[thread.id] = thread.emailIds.length;
    }
  }

  return {
    emails: gr.list,
    total: qr.total,
    position: qr.position,
    threadCounts,
  };
}

/** Fetch a single full email */
export async function fetchEmail(emailId: string): Promise<Email | null> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Email/get",
        {
          ids: [emailId],
          properties: EMAIL_FULL_PROPERTIES,
          fetchHTMLBodyValues: true,
          fetchTextBodyValues: true,
          maxBodyValueBytes: 1048576,
        },
        "e0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, result] = response.methodResponses[0];
  const list = (result as { list: Email[] }).list;
  return list.length > 0 ? list[0] : null;
}

/** Fetch thread emails in lightweight list format (for inline thread expansion) */
export async function fetchThreadListEmails(threadId: string): Promise<{
  thread: Thread;
  emails: EmailListItem[];
}> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Thread/get",
        {
          ids: [threadId],
        },
        "t0",
      ],
      [
        "Email/get",
        {
          "#ids": {
            resultOf: "t0",
            name: "Thread/get",
            path: "/list/*/emailIds",
          },
          properties: EMAIL_LIST_PROPERTIES,
        },
        "e0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, threadResult] = response.methodResponses[0];
  const [, emailResult] = response.methodResponses[1];

  const threads = (threadResult as { list: Thread[] }).list;
  const emails = (emailResult as { list: EmailListItem[] }).list;

  return {
    thread: threads[0],
    emails: emails.sort(
      (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
    ),
  };
}

/** Fetch a thread and all its emails */
export async function fetchThread(threadId: string): Promise<{
  thread: Thread;
  emails: Email[];
}> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Thread/get",
        {
          ids: [threadId],
        },
        "t0",
      ],
      [
        "Email/get",
        {
          "#ids": {
            resultOf: "t0",
            name: "Thread/get",
            path: "/list/*/emailIds",
          },
          properties: EMAIL_FULL_PROPERTIES,
          fetchHTMLBodyValues: true,
          fetchTextBodyValues: true,
          maxBodyValueBytes: 1048576,
        },
        "e0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, threadResult] = response.methodResponses[0];
  const [, emailResult] = response.methodResponses[1];

  const threads = (threadResult as { list: Thread[] }).list;
  const emails = (emailResult as { list: Email[] }).list;

  return {
    thread: threads[0],
    emails: emails.sort(
      (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
    ),
  };
}

/** Email mutations via Email/set */
export interface EmailUpdate {
  [emailId: string]: Record<string, unknown>;
}

export async function updateEmails(updates: EmailUpdate): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Email/set",
        {
          update: updates,
        },
        "s0",
      ],
    ],
  };

  await jmapRequest(request);
}

export async function destroyEmails(emailIds: string[]): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Email/set",
        {
          destroy: emailIds,
        },
        "s0",
      ],
    ],
  };

  await jmapRequest(request);
}

/** Query email IDs matching a filter (for bulk operations) */
export async function queryEmailIds(params: {
  filter: JMAPFilter;
  limit?: number;
}): Promise<string[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Email/query",
        {
          filter: params.filter,
          limit: params.limit ?? 500,
        },
        "q0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, result] = response.methodResponses[0];
  return (result as { ids: string[] }).ids;
}

/** Mailbox mutations */
export async function createMailbox(params: {
  name: string;
  parentId?: string;
}): Promise<string> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Mailbox/set",
        {
          create: {
            new: {
              name: params.name,
              parentId: params.parentId ?? null,
            },
          },
        },
        "m0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, result] = response.methodResponses[0];
  const created = (result as { created?: Record<string, { id: string }> }).created;
  return created?.new?.id ?? "";
}

export async function updateMailbox(
  mailboxId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Mailbox/set",
        {
          update: {
            [mailboxId]: updates,
          },
        },
        "m0",
      ],
    ],
  };

  await jmapRequest(request);
}

export async function deleteMailbox(mailboxId: string): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Mailbox/set",
        {
          destroy: [mailboxId],
          onDestroyRemoveEmails: true,
        },
        "m0",
      ],
    ],
  };

  await jmapRequest(request);
}

/** Delta sync: fetch email changes since a known state */
export interface EmailChangesResult {
  oldState: string;
  newState: string;
  created: EmailListItem[];
  updated: EmailListItem[];
  destroyed: string[];
  hasMoreChanges: boolean;
}

export async function fetchEmailChanges(
  sinceState: string,
): Promise<EmailChangesResult> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Email/changes",
        {
          sinceState,
        },
        "c0",
      ],
      [
        "Email/get",
        {
          "#ids": {
            resultOf: "c0",
            name: "Email/changes",
            path: "/created",
          },
          properties: EMAIL_LIST_PROPERTIES,
        },
        "g_created",
      ],
      [
        "Email/get",
        {
          "#ids": {
            resultOf: "c0",
            name: "Email/changes",
            path: "/updated",
          },
          properties: EMAIL_LIST_PROPERTIES,
        },
        "g_updated",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, changesResult] = response.methodResponses[0];
  const [, createdResult] = response.methodResponses[1];
  const [, updatedResult] = response.methodResponses[2];

  const changes = changesResult as {
    oldState: string;
    newState: string;
    created: string[];
    updated: string[];
    destroyed: string[];
    hasMoreChanges: boolean;
  };

  return {
    oldState: changes.oldState,
    newState: changes.newState,
    created: (createdResult as { list: EmailListItem[] }).list,
    updated: (updatedResult as { list: EmailListItem[] }).list,
    destroyed: changes.destroyed,
    hasMoreChanges: changes.hasMoreChanges,
  };
}

/** Delta sync: fetch mailbox changes since a known state */
export interface MailboxChangesResult {
  oldState: string;
  newState: string;
  created: Mailbox[];
  updated: Mailbox[];
  destroyed: string[];
  hasMoreChanges: boolean;
}

export async function fetchMailboxChanges(
  sinceState: string,
): Promise<MailboxChangesResult> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Mailbox/changes",
        {
          sinceState,
        },
        "c0",
      ],
      [
        "Mailbox/get",
        {
          "#ids": {
            resultOf: "c0",
            name: "Mailbox/changes",
            path: "/created",
          },
          properties: [
            "id", "name", "parentId", "role", "sortOrder",
            "totalEmails", "unreadEmails", "totalThreads", "unreadThreads",
            "myRights",
          ],
        },
        "g_created",
      ],
      [
        "Mailbox/get",
        {
          "#ids": {
            resultOf: "c0",
            name: "Mailbox/changes",
            path: "/updated",
          },
          properties: [
            "id", "name", "parentId", "role", "sortOrder",
            "totalEmails", "unreadEmails", "totalThreads", "unreadThreads",
            "myRights",
          ],
        },
        "g_updated",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, changesResult] = response.methodResponses[0];
  const [, createdResult] = response.methodResponses[1];
  const [, updatedResult] = response.methodResponses[2];

  const changes = changesResult as {
    oldState: string;
    newState: string;
    created: string[];
    updated: string[];
    destroyed: string[];
    hasMoreChanges: boolean;
  };

  return {
    oldState: changes.oldState,
    newState: changes.newState,
    created: (createdResult as { list: Mailbox[] }).list,
    updated: (updatedResult as { list: Mailbox[] }).list,
    destroyed: changes.destroyed,
    hasMoreChanges: changes.hasMoreChanges,
  };
}

// ---- Identity operations ----

/** Fetch all identities (for From dropdown and signatures) */
export async function fetchIdentities(): Promise<Identity[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "Identity/get",
        {
          properties: ["id", "name", "email", "replyTo", "bcc", "textSignature", "htmlSignature"],
        },
        "i0",
      ],
    ],
  };

  const response = await jmapRequest(request);
  const [, result] = response.methodResponses[0];
  return (result as { list: Identity[] }).list;
}

// ---- Draft save/destroy ----

interface SaveDraftParams {
  emailId?: string;
  mailboxId: string;
  from: Identity | null;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  bodyHTML: string;
  bodyText: string;
  attachments: AttachmentState[];
  inReplyTo?: string;
  references?: string[];
}

function buildEmailObject(params: SaveDraftParams) {
  const email: Record<string, unknown> = {
    mailboxIds: { [params.mailboxId]: true },
    keywords: { $draft: true, $seen: true },
    from: params.from
      ? [{ name: params.from.name, email: params.from.email }]
      : undefined,
    to: params.to.map((r) => ({ name: r.name ?? r.email, email: r.email })),
    cc:
      params.cc.length > 0
        ? params.cc.map((r) => ({ name: r.name ?? r.email, email: r.email }))
        : undefined,
    bcc:
      params.bcc.length > 0
        ? params.bcc.map((r) => ({ name: r.name ?? r.email, email: r.email }))
        : undefined,
    subject: params.subject,
    bodyValues: {
      html: { value: params.bodyHTML, isEncodingProblem: false, isTruncated: false },
      text: { value: params.bodyText, isEncodingProblem: false, isTruncated: false },
    },
    textBody: [{ partId: "text", type: "text/plain" }],
    htmlBody: [{ partId: "html", type: "text/html" }],
  };

  // Add headers for threading
  const headers: Array<{ name: string; value: string }> = [];
  if (params.inReplyTo) {
    headers.push({ name: "In-Reply-To", value: params.inReplyTo });
  }
  if (params.references && params.references.length > 0) {
    headers.push({ name: "References", value: params.references.join(" ") });
  }
  if (headers.length > 0) {
    email["header:In-Reply-To:asMessageIds"] = params.inReplyTo
      ? [params.inReplyTo.replace(/[<>]/g, "")]
      : undefined;
    email["header:References:asMessageIds"] = params.references
      ? params.references.map((r) => r.replace(/[<>]/g, ""))
      : undefined;
  }

  // Attachments
  const completedAttachments = params.attachments.filter(
    (a) => a.blobId && a.status === "complete",
  );
  if (completedAttachments.length > 0) {
    email.attachments = completedAttachments.map((a) => ({
      blobId: a.blobId,
      type: a.type,
      name: a.name,
      size: a.size,
    }));
  }

  return email;
}

/** Save draft to Drafts mailbox. Returns emailId. */
export async function saveDraft(params: SaveDraftParams): Promise<string | undefined> {
  const emailObj = buildEmailObject(params);

  let methodCalls: JMAPMethodCall[];

  if (params.emailId) {
    // Update existing draft
    methodCalls = [
      [
        "Email/set",
        {
          update: {
            [params.emailId]: emailObj,
          },
        },
        "s0",
      ],
    ];
  } else {
    // Create new draft
    methodCalls = [
      [
        "Email/set",
        {
          create: {
            draft: emailObj,
          },
        },
        "s0",
      ],
    ];
  }

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls,
  };

  const response = await jmapRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    created?: Record<string, { id: string }>;
    notCreated?: Record<string, unknown>;
    notUpdated?: Record<string, unknown>;
  };

  if (setResult.notCreated?.draft || setResult.notUpdated?.[params.emailId ?? ""]) {
    throw new Error("Failed to save draft");
  }

  return setResult.created?.draft?.id ?? params.emailId;
}

/** Destroy a draft email */
export async function destroyDraft(emailId: string): Promise<void> {
  await destroyEmails([emailId]);
}

// ---- Send email ----

interface SendEmailParams {
  from: Identity | null;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  bodyHTML: string;
  bodyText: string;
  attachments: AttachmentState[];
  inReplyTo?: string;
  references?: string[];
  draftEmailId?: string;
  draftsMailboxId?: string;
  sentMailboxId?: string;
}

/** Send an email via JMAP EmailSubmission/set */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const emailObj: Record<string, unknown> = {
    from: params.from
      ? [{ name: params.from.name, email: params.from.email }]
      : undefined,
    to: params.to.map((r) => ({ name: r.name ?? r.email, email: r.email })),
    cc:
      params.cc.length > 0
        ? params.cc.map((r) => ({ name: r.name ?? r.email, email: r.email }))
        : undefined,
    bcc:
      params.bcc.length > 0
        ? params.bcc.map((r) => ({ name: r.name ?? r.email, email: r.email }))
        : undefined,
    subject: params.subject,
    bodyValues: {
      html: { value: params.bodyHTML, isEncodingProblem: false, isTruncated: false },
      text: { value: params.bodyText, isEncodingProblem: false, isTruncated: false },
    },
    textBody: [{ partId: "text", type: "text/plain" }],
    htmlBody: [{ partId: "html", type: "text/html" }],
    keywords: { $seen: true },
  };

  // Threading headers
  if (params.inReplyTo) {
    emailObj["header:In-Reply-To:asMessageIds"] = [
      params.inReplyTo.replace(/[<>]/g, ""),
    ];
  }
  if (params.references && params.references.length > 0) {
    emailObj["header:References:asMessageIds"] = params.references.map((r) =>
      r.replace(/[<>]/g, ""),
    );
  }

  // Every email must belong to at least one mailbox (Stalwart requirement).
  // Prefer Drafts (submission will move it to Sent), fall back to Sent.
  if (params.draftsMailboxId) {
    emailObj.mailboxIds = { [params.draftsMailboxId]: true };
  } else if (params.sentMailboxId) {
    emailObj.mailboxIds = { [params.sentMailboxId]: true };
  } else {
    // Last resort: fetch mailboxes and pick Drafts or Sent
    const mailboxes = await fetchMailboxes();
    const drafts = mailboxes.find((m) => m.role === "drafts");
    const sent = mailboxes.find((m) => m.role === "sent");
    const fallback = drafts ?? sent ?? mailboxes[0];
    if (fallback) {
      emailObj.mailboxIds = { [fallback.id]: true };
    } else {
      throw new Error("No mailbox available to create the email in.");
    }
  }

  // Attachments
  const completedAttachments = params.attachments.filter(
    (a) => a.blobId && a.status === "complete",
  );
  if (completedAttachments.length > 0) {
    emailObj.attachments = completedAttachments.map((a) => ({
      blobId: a.blobId,
      type: a.type,
      name: a.name,
      size: a.size,
    }));
  }

  // Build the method calls
  const methodCalls: JMAPMethodCall[] = [];

  // If we have an existing draft, destroy it and create a new email
  if (params.draftEmailId) {
    methodCalls.push([
      "Email/set",
      {
        destroy: [params.draftEmailId],
      },
      "destroy_draft",
    ]);
  }

  // Create the email
  methodCalls.push([
    "Email/set",
    {
      create: {
        sendEmail: emailObj,
      },
    },
    "create_email",
  ]);

  // Resolve identity ID: use the one from the identity object, or fetch from server
  let identityId = params.from?.id;
  if (!identityId) {
    // Fetch identities to get a valid ID
    const identities = await fetchIdentities();
    if (identities.length > 0) {
      identityId = identities[0].id;
    }
  }

  if (!identityId) {
    throw new Error("No sending identity available. Please configure an identity.");
  }

  // Create submission with onSuccessUpdateEmail to move to Sent
  const submissionObj: Record<string, unknown> = {
    emailId: "#sendEmail",
    identityId,
  };

  // Move to Sent on success
  const onSuccessUpdate: Record<string, unknown> = {};
  if (params.sentMailboxId && params.draftsMailboxId) {
    onSuccessUpdate[`mailboxIds/${params.draftsMailboxId}`] = null;
    onSuccessUpdate[`mailboxIds/${params.sentMailboxId}`] = true;
  } else if (params.sentMailboxId) {
    onSuccessUpdate[`mailboxIds/${params.sentMailboxId}`] = true;
  }
  // Remove draft keyword
  onSuccessUpdate["keywords/$draft"] = null;

  methodCalls.push([
    "EmailSubmission/set",
    {
      create: {
        sub: submissionObj,
      },
      onSuccessUpdateEmail: {
        "#sub": onSuccessUpdate,
      },
    },
    "submit",
  ]);

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls,
  };

  const response = await jmapRequest(request);

  // Check for errors in submission
  for (const [method, result] of response.methodResponses) {
    if (method === "error") {
      throw new Error(
        (result as { description?: string }).description ?? "Send failed",
      );
    }
    const setResult = result as {
      notCreated?: Record<string, { type: string; description?: string }>;
    };
    if (setResult.notCreated) {
      const firstError = Object.values(setResult.notCreated)[0];
      if (firstError) {
        throw new Error(firstError.description ?? firstError.type ?? "Send failed");
      }
    }
  }
}
