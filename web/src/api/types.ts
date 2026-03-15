/** Re-export all types for convenient imports */
export type {
  JMAPRequest,
  JMAPResponse,
  JMAPMethodCall,
  JMAPMethodResponse,
  JMAPError,
  JMAPQueryResponse,
  JMAPGetResponse,
  JMAPSetResponse,
  JMAPFilter,
  JMAPSort,
} from "@/types/jmap.ts";

export type {
  Email,
  EmailAddress,
  EmailBodyPart,
  EmailBodyValue,
  EmailHeader,
  EmailListItem,
  Mailbox,
  MailboxRole,
  MailboxRights,
  Thread,
  Identity,
} from "@/types/mail.ts";

export { isUnread, isFlagged, isDraft } from "@/types/mail.ts";
