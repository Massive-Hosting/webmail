/** Email, Mailbox, Thread, Identity types */

export interface EmailAddress {
  name: string | null;
  email: string;
}

export interface Email {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  cc: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  replyTo: EmailAddress[] | null;
  subject: string;
  sentAt: string | null;
  receivedAt: string;
  size: number;
  preview: string;
  keywords: Record<string, boolean>;
  hasAttachment: boolean;
  bodyStructure?: EmailBodyPart;
  bodyValues?: Record<string, EmailBodyValue>;
  htmlBody?: EmailBodyPart[];
  textBody?: EmailBodyPart[];
  attachments?: EmailBodyPart[];
  headers?: EmailHeader[];
}

export interface EmailBodyPart {
  partId: string | null;
  blobId: string | null;
  size: number;
  name: string | null;
  type: string;
  charset?: string | null;
  disposition?: string | null;
  cid?: string | null;
  subParts?: EmailBodyPart[];
}

export interface EmailBodyValue {
  value: string;
  isEncodingProblem: boolean;
  isTruncated: boolean;
}

export interface EmailHeader {
  name: string;
  value: string;
}

export interface Mailbox {
  id: string;
  name: string;
  parentId: string | null;
  role: MailboxRole | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  myRights: MailboxRights;
}

export type MailboxRole =
  | "inbox"
  | "drafts"
  | "sent"
  | "archive"
  | "junk"
  | "trash"
  | "all"
  | "flagged"
  | "important";

export interface MailboxRights {
  mayReadItems: boolean;
  mayAddItems: boolean;
  mayRemoveItems: boolean;
  maySetSeen: boolean;
  maySetKeywords: boolean;
  mayCreateChild: boolean;
  mayRename: boolean;
  mayDelete: boolean;
  maySubmit: boolean;
}

export interface Thread {
  id: string;
  emailIds: string[];
}

export interface Identity {
  id: string;
  name: string;
  email: string;
  replyTo: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  textSignature: string;
  htmlSignature: string;
}

/** List-level email properties (without body) */
export type EmailListItem = Pick<
  Email,
  | "id"
  | "threadId"
  | "mailboxIds"
  | "from"
  | "to"
  | "cc"
  | "subject"
  | "receivedAt"
  | "size"
  | "preview"
  | "keywords"
  | "hasAttachment"
>;

/** Helper to check email keywords */
export function isUnread(email: Pick<Email, "keywords">): boolean {
  return !email.keywords["$seen"];
}

export function isFlagged(email: Pick<Email, "keywords">): boolean {
  return !!email.keywords["$flagged"];
}

export function isDraft(email: Pick<Email, "keywords">): boolean {
  return !!email.keywords["$draft"];
}
