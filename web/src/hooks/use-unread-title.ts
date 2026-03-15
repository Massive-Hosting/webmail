/** Update tab title with unread count */

import { useEffect } from "react";

export function useUnreadTitle(unreadCount: number, mailboxName: string) {
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${mailboxName} — Webmail`;
    } else {
      document.title = `${mailboxName} — Webmail`;
    }

    return () => {
      document.title = "Webmail";
    };
  }, [unreadCount, mailboxName]);
}
