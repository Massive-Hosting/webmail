/** Contacts page - two-pane layout with groups sidebar, list, and detail */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { UserPlus, Upload, Download, Users } from "lucide-react";
import { ContactList } from "./contact-list.tsx";
import { ContactDetail } from "./contact-detail.tsx";
import { ContactForm } from "./contact-form.tsx";
import { ContactGroups } from "./contact-groups.tsx";
import {
  useContacts,
  useContactMutations,
  useAddressBooks,
  getContactDisplayName,
} from "@/hooks/use-contacts.ts";
import type { Contact, ContactCreate, AddressBook } from "@/types/contacts.ts";
import { ShareAddressBookDialog } from "./share-addressbook-dialog.tsx";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { importVCards, exportVCards } from "./import-export.tsx";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { ResizeHandle } from "@/components/layout/resize-handle.tsx";

export const ContactsPage = React.memo(function ContactsPage() {
  const { t } = useTranslation();
  // Sidebar width (resizable, persisted)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem("webmail:contactsSidebarWidth");
      if (stored) return Math.max(150, Math.min(350, Number(stored)));
    } catch {
      // ignore
    }
    return 220;
  });

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((prev) => {
      const next = Math.max(150, Math.min(350, prev + delta));
      try {
        localStorage.setItem("webmail:contactsSidebarWidth", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [initialEmail, setInitialEmail] = useState<string | undefined>(undefined);
  const [initialName, setInitialName] = useState<string | undefined>(undefined);
  const [shareAddressBook, setShareAddressBook] = useState<AddressBook | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    contact: Contact;
  } | null>(null);

  const { contacts, allContacts, isLoading } = useContacts(searchQuery, selectedGroupId);
  const { createContact, updateContact, deleteContact } = useContactMutations();
  const {
    addressBooks,
    createAddressBook,
    updateAddressBook,
    deleteAddressBook,
  } = useAddressBooks();

  // Check for pending "Add to contact" from recipient chip context menu
  useEffect(() => {
    const email = sessionStorage.getItem("newContactEmail");
    if (email) {
      const name = sessionStorage.getItem("newContactName");
      setInitialEmail(email);
      if (name) setInitialName(name);
      setIsCreating(true);
      setSelectedContactId(null);
      sessionStorage.removeItem("newContactEmail");
      sessionStorage.removeItem("newContactName");
    }
  }, []);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId],
  );

  /** Contact counts per address book */
  const contactCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const contact of allContacts) {
      for (const bookId of Object.keys(contact.addressBookIds)) {
        counts[bookId] = (counts[bookId] ?? 0) + 1;
      }
    }
    return counts;
  }, [allContacts]);

  const handleSelectContact = useCallback((contact: Contact) => {
    setSelectedContactId(contact.id);
    setIsCreating(false);
  }, []);

  const handleToggleSelection = useCallback((contactId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  }, []);

  const handleNewContact = useCallback(() => {
    setInitialEmail(undefined);
    setInitialName(undefined);
    setIsCreating(true);
    setSelectedContactId(null);
  }, []);

  const handleCreateSave = useCallback(
    async (data: Partial<Contact>) => {
      const contactData: ContactCreate = {
        name: data.name ?? {},
        emails: data.emails ?? [],
        phones: data.phones ?? [],
        addresses: data.addresses ?? [],
        urls: data.urls ?? [],
        notes: data.notes,
        organization: data.organization,
        birthday: data.birthday,
        addressBookIds: selectedGroupId ? { [selectedGroupId]: true } : {},
      };

      try {
        const id = await createContact(contactData);
        setIsCreating(false);
        setSelectedContactId(id);
      } catch {
        // error is handled in hook
      }
    },
    [createContact, selectedGroupId],
  );

  const handleUpdateSave = useCallback(
    (contactId: string, updates: Partial<Contact>) => {
      updateContact(contactId, updates);
    },
    [updateContact],
  );

  const handleDelete = useCallback(
    (contactId: string) => {
      deleteContact(contactId);
      if (selectedContactId === contactId) {
        setSelectedContactId(null);
      }
    },
    [deleteContact, selectedContactId],
  );

  const { open: openCompose } = useCompose();

  const handleComposeEmail = useCallback((email: string, name?: string) => {
    openCompose({
      mode: "new",
      prefillTo: [{ email, name }],
    });
  }, [openCompose]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, contact: Contact) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, contact });
    },
    [],
  );

  const handleImport = useCallback(async () => {
    try {
      const imported = await importVCards();
      if (imported > 0) {
        toast.success(t("contacts.imported", { count: imported }));
      }
    } catch {
      toast.error(t("contacts.importFailed"));
    }
  }, []);

  const handleExport = useCallback(() => {
    exportVCards(
      selectedContactIds.size > 0
        ? contacts.filter((c) => selectedContactIds.has(c.id))
        : contacts,
    );
  }, [contacts, selectedContactIds]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Groups sidebar */}
      <div
        className="shrink-0 flex flex-col overflow-y-auto overflow-x-hidden"
        style={{
          width: sidebarWidth,
          backgroundColor: "var(--color-bg-secondary)",
          borderRight: "1px solid var(--color-border-primary)",
        }}
      >
        {/* Toolbar */}
        <div
          className="flex items-center gap-1 px-3 py-2"
          style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
        >
          <button
            onClick={handleNewContact}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
            style={{ color: "var(--color-text-accent)" }}
          >
            <UserPlus size={14} />
            {t("contacts.new")}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleImport}
            className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title={t("contacts.importContacts")}
          >
            <Upload size={14} />
          </button>
          <button
            onClick={handleExport}
            className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title={t("contacts.exportContacts")}
          >
            <Download size={14} />
          </button>
        </div>

        <ContactGroups
          addressBooks={addressBooks}
          selectedGroupId={selectedGroupId}
          contactCounts={contactCounts}
          totalContacts={allContacts.length}
          onSelectGroup={setSelectedGroupId}
          onCreateGroup={createAddressBook}
          onRenameGroup={updateAddressBook}
          onDeleteGroup={deleteAddressBook}
          onShareGroup={setShareAddressBook}
        />
      </div>

      <ResizeHandle
        onResize={handleSidebarResize}
        onDoubleClick={() => {
          setSidebarWidth(220);
          try { localStorage.setItem("webmail:contactsSidebarWidth", "220"); } catch { /* ignore */ }
        }}
      />

      {/* Contact list */}
      <div
        className="w-72 shrink-0 flex flex-col overflow-hidden"
        style={{
          borderRight: "1px solid var(--color-border-primary)",
        }}
      >
        <ContactList
          contacts={contacts}
          isLoading={isLoading}
          selectedContactId={selectedContactId}
          selectedContactIds={selectedContactIds}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectContact={handleSelectContact}
          onToggleSelection={handleToggleSelection}
          onContextMenu={handleContextMenu}
          onNewContact={handleNewContact}
        />
      </div>

      {/* Detail / Form */}
      <div className="flex-1 overflow-hidden">
        {isCreating ? (
          <ContactForm
            onSave={handleCreateSave}
            onCancel={() => setIsCreating(false)}
            initialEmail={initialEmail}
            initialName={initialName}
          />
        ) : selectedContact ? (
          <ContactDetail
            contact={selectedContact}
            onEdit={() => {}}
            onDelete={handleDelete}
            onComposeEmail={handleComposeEmail}
            onSave={handleUpdateSave}
            onWaveCall={(email, name) => {
              window.dispatchEvent(new CustomEvent("wave:new-call", { detail: { email, name } }));
            }}
          />
        ) : (
          <EmptyState
            icon={<Users size={48} strokeWidth={1.5} />}
            title={t("contacts.selectContact")}
            description={t("contacts.selectContactDesc")}
            className="h-full"
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          contact={contextMenu.contact}
          onClose={() => setContextMenu(null)}
          onEdit={(c) => {
            setSelectedContactId(c.id);
            setContextMenu(null);
          }}
          onDelete={(c) => {
            handleDelete(c.id);
            setContextMenu(null);
          }}
          onCompose={(c) => {
            if (c.emails[0]) {
              handleComposeEmail(c.emails[0].address, getContactDisplayName(c));
            }
            setContextMenu(null);
          }}
        />
      )}

      {/* Share address book dialog */}
      {shareAddressBook && (
        <ShareAddressBookDialog
          open={!!shareAddressBook}
          onOpenChange={(open) => { if (!open) setShareAddressBook(null); }}
          addressBook={shareAddressBook}
        />
      )}
    </div>
  );
});

/** Right-click context menu */
function ContextMenu({
  x,
  y,
  contact,
  onClose,
  onEdit,
  onDelete,
  onCompose,
}: {
  x: number;
  y: number;
  contact: Contact;
  onClose: () => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onCompose: (contact: Contact) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 py-1 rounded-md shadow-lg min-w-[160px]"
        style={{
          left: x,
          top: y,
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-primary)",
        }}
      >
        <ContextMenuItem
          label={t("contacts.editContact")}
          onClick={() => onEdit(contact)}
        />
        {contact.emails[0] && (
          <ContextMenuItem
            label={t("contacts.composeEmail")}
            onClick={() => onCompose(contact)}
          />
        )}
        <div
          className="my-1"
          style={{ borderTop: "1px solid var(--color-border-secondary)" }}
        />
        <ContextMenuItem
          label={t("contacts.deleteContact")}
          danger
          onClick={() => onDelete(contact)}
        />
      </div>
    </>
  );
}

function ContextMenuItem({
  label,
  danger = false,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors"
      style={{
        color: danger
          ? "var(--color-text-error, #dc2626)"
          : "var(--color-text-primary)",
      }}
    >
      {label}
    </button>
  );
}
