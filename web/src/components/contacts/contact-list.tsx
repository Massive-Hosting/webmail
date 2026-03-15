/** Virtualized contact list with alphabetical sections */

import React, { useRef, useCallback, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { Contact } from "@/types/contacts.ts";
import {
  getContactDisplayName,
  getContactInitials,
  getContactSortLetter,
} from "@/hooks/use-contacts.ts";
import { getAvatarColor } from "@/lib/format.ts";
import { useTranslation } from "react-i18next";

const ROW_HEIGHT = 56;
const SECTION_HEIGHT = 28;
const OVERSCAN = 10;

interface ContactListProps {
  contacts: Contact[];
  isLoading: boolean;
  selectedContactId: string | null;
  selectedContactIds: Set<string>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectContact: (contact: Contact) => void;
  onToggleSelection: (contactId: string) => void;
  onContextMenu: (e: React.MouseEvent, contact: Contact) => void;
  onNewContact: () => void;
}

type ListRow =
  | { type: "section"; letter: string }
  | { type: "contact"; contact: Contact };

export const ContactList = React.memo(function ContactList({
  contacts,
  isLoading,
  selectedContactId,
  selectedContactIds,
  searchQuery,
  onSearchChange,
  onSelectContact,
  onToggleSelection,
  onContextMenu,
  onNewContact,
}: ContactListProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);

  /** Build rows with section headers */
  const rows = useMemo(() => {
    const result: ListRow[] = [];
    let lastLetter = "";
    for (const contact of contacts) {
      const letter = getContactSortLetter(contact);
      if (letter !== lastLetter) {
        result.push({ type: "section", letter });
        lastLetter = letter;
      }
      result.push({ type: "contact", contact });
    }
    return result;
  }, [contacts]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      rows[index].type === "section" ? SECTION_HEIGHT : ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const handleItemClick = useCallback(
    (contact: Contact, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        onToggleSelection(contact.id);
      } else {
        onSelectContact(contact);
      }
    },
    [onSelectContact, onToggleSelection],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <SearchHeader
          value={searchQuery}
          onChange={onSearchChange}
          onNewContact={onNewContact}
        />
        <div className="flex-1 flex flex-col">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 h-[56px]">
              <Skeleton width={36} height={36} rounded />
              <div className="flex-1 flex flex-col gap-1">
                <Skeleton width={120} height={14} />
                <Skeleton width={160} height={12} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (contacts.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <SearchHeader
          value={searchQuery}
          onChange={onSearchChange}
          onNewContact={onNewContact}
        />
        <EmptyState
          icon={<Users size={48} strokeWidth={1.5} />}
          title={searchQuery ? t("contacts.noContactsFound") : t("contacts.addFirstContact")}
          description={
            searchQuery
              ? t("contacts.tryDifferentSearch")
              : t("contacts.clickPlusToCreate")
          }
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <SearchHeader
        value={searchQuery}
        onChange={onSearchChange}
        onNewContact={onNewContact}
      />

      {/* Contact count */}
      <div
        className="px-3 py-1 text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {t("contacts.contactCount", { count: contacts.length })}
      </div>

      {/* Virtualized list */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        style={{ contain: "strict" }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (row.type === "section") {
              return (
                <div
                  key={`section-${row.letter}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: SECTION_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <SectionHeader letter={row.letter} />
                </div>
              );
            }

            const contact = row.contact;
            const isSelected = contact.id === selectedContactId;
            const isMultiSelected = selectedContactIds.has(contact.id);

            return (
              <div
                key={contact.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ContactRow
                  contact={contact}
                  isSelected={isSelected}
                  isMultiSelected={isMultiSelected}
                  onClick={handleItemClick}
                  onContextMenu={onContextMenu}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

/** Search bar at top */
function SearchHeader({
  value,
  onChange,
  onNewContact,
}: {
  value: string;
  onChange: (value: string) => void;
  onNewContact: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
    >
      <div
        className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-sm"
        style={{
          backgroundColor: "var(--color-bg-tertiary)",
          color: "var(--color-text-secondary)",
        }}
      >
        <Search size={14} style={{ color: "var(--color-text-tertiary)" }} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("contacts.searchContacts")}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--color-text-primary)" }}
        />
      </div>
      <button
        onClick={onNewContact}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
        style={{ color: "var(--color-text-secondary)" }}
        title={t("contacts.newContactBtn")}
      >
        <UserPlus size={16} />
      </button>
    </div>
  );
}

/** Alphabetical section header */
function SectionHeader({ letter }: { letter: string }) {
  return (
    <div
      className="flex items-center px-3 text-xs font-semibold h-full"
      style={{
        color: "var(--color-text-tertiary)",
        backgroundColor: "var(--color-bg-secondary)",
        borderBottom: "1px solid var(--color-border-secondary)",
      }}
    >
      {letter}
    </div>
  );
}

/** Single contact row */
const ContactRow = React.memo(function ContactRow({
  contact,
  isSelected,
  isMultiSelected,
  onClick,
  onContextMenu,
}: {
  contact: Contact;
  isSelected: boolean;
  isMultiSelected: boolean;
  onClick: (contact: Contact, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, contact: Contact) => void;
}) {
  const displayName = getContactDisplayName(contact);
  const initials = getContactInitials(contact);
  const primaryEmail = contact.emails[0]?.address ?? "";
  const avatarColor = getAvatarColor(primaryEmail || displayName);

  return (
    <div
      className="flex items-center gap-3 px-3 h-full cursor-pointer transition-colors duration-100"
      style={{
        backgroundColor: isSelected
          ? "var(--color-bg-tertiary)"
          : isMultiSelected
            ? "var(--color-bg-tertiary)"
            : "transparent",
        borderBottom: "1px solid var(--color-border-secondary)",
      }}
      onClick={(e) => onClick(contact, e)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, contact);
      }}
    >
      {/* Avatar */}
      <div
        className="inline-flex items-center justify-center rounded-full text-white font-medium shrink-0"
        style={{
          width: 36,
          height: 36,
          backgroundColor: avatarColor,
          fontSize: 14,
        }}
      >
        {initials}
      </div>

      {/* Name and email */}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: "var(--color-text-primary)" }}
        >
          {displayName}
        </div>
        {primaryEmail && (
          <div
            className="text-xs truncate"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {primaryEmail}
          </div>
        )}
      </div>
    </div>
  );
});
