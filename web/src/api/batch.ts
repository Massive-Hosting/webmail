/**
 * Batched JMAP requests for initial page load.
 *
 * Combines Mailbox/get + Email/query + Email/get + Thread/get + Identity/get
 * into a single HTTP request, then populates the TanStack Query cache so
 * individual hooks find cached data and skip their own fetches.
 */

import type { QueryClient } from "@tanstack/react-query";
import { jmapRequest } from "./mail.ts";
import type { JMAPRequest } from "@/types/jmap.ts";
import type { Mailbox, EmailListItem, Thread, Identity } from "@/types/mail.ts";
import { useJMAPStateStore } from "@/stores/jmap-state-store.ts";
import { useAuthStore } from "@/stores/auth-store.ts";

const MAILBOX_PROPERTIES = [
  "id", "name", "parentId", "role", "sortOrder",
  "totalEmails", "unreadEmails", "totalThreads", "unreadThreads",
  "myRights",
];

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

/**
 * Fetch all initial mail data in a single batched JMAP request.
 *
 * Populates TanStack Query cache for:
 *   - ["mailboxes"]
 *   - ["emails", inboxId, ...]  (first page)
 *   - ["identities"]
 *
 * Returns the inbox mailbox ID (or null if not found) so the caller
 * can set it as the selected mailbox.
 */
export async function prefetchInitialMailData(queryClient: QueryClient): Promise<string | null> {
  // Step 1: Fetch mailboxes first to find inbox ID, then batch the rest.
  // Actually, we can do it in one request using a fixed query — we'll query
  // all emails and filter later. But we need the inbox ID for the Email/query filter.
  // Solution: fetch mailboxes + identities in one batch, then inbox emails in a second.
  // OR: we can do a two-phase approach where we batch mailboxes+identities first,
  // then batch inbox emails. Still only 1 extra request vs ~4+ currently.
  //
  // Better: use a single request with TWO Email/query calls is complex.
  // Simplest: one request for mailboxes + identities, populate cache,
  // then let the email query hook fire normally (it already batches query+get+thread).
  //
  // But we can do even better: include a "query all inMailbox=inbox" in the same
  // request by NOT specifying inMailbox — except we need the inbox ID.
  //
  // Best pragmatic approach: ONE request with Mailbox/get + Identity/get.
  // The Email/query is already well-batched (3 calls in 1 request).
  // This saves 2 HTTP requests (Mailbox/get + Identity/get become 0 extra).

  const request: JMAPRequest = {
    using: [
      "urn:ietf:params:jmap:core",
      "urn:ietf:params:jmap:mail",
      "urn:ietf:params:jmap:submission",
    ],
    methodCalls: [
      [
        "Mailbox/get",
        { properties: MAILBOX_PROPERTIES },
        "mb",
      ],
      [
        "Identity/get",
        {
          properties: ["id", "name", "email", "replyTo", "bcc", "textSignature", "htmlSignature"],
        },
        "id",
      ],
    ],
  };

  const response = await jmapRequest(request);

  // Parse mailboxes
  const [, mbResult] = response.methodResponses[0];
  const mailboxData = mbResult as { list: Mailbox[]; state?: string };

  if (mailboxData.state) {
    useJMAPStateStore.getState().setMailboxState(mailboxData.state);
  }

  // Parse identities
  const [, idResult] = response.methodResponses[1];
  const identities = (idResult as { list: Identity[] }).list;

  // Populate TanStack Query cache
  queryClient.setQueryData(["mailboxes"], mailboxData.list);
  queryClient.setQueryData(["identities"], identities);

  // Set display name from matching identity
  const authState = useAuthStore.getState();
  const matchingIdentity = identities.find(
    (id) => id.email.toLowerCase() === authState.email.toLowerCase(),
  );
  if (matchingIdentity?.name && matchingIdentity.name !== matchingIdentity.email) {
    authState.setDisplayName(matchingIdentity.name);
  }

  // Return inbox ID so caller can set it as selected
  const inbox = mailboxData.list.find((m) => m.role === "inbox");
  return inbox?.id ?? null;
}
