/** Contact detail view with organized sections */

import React, { useState, useCallback } from "react";
import {
  Mail,
  Phone,
  Building2,
  StickyNote,
  Globe,
  MapPin,
  Cake,
  Edit2,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { Contact } from "@/types/contacts.ts";
import { getContactDisplayName, getContactInitials } from "@/hooks/use-contacts.ts";
import { getAvatarColor } from "@/lib/format.ts";
import { ContactForm } from "./contact-form.tsx";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store.ts";

interface ContactDetailProps {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  onComposeEmail: (email: string, name?: string) => void;
  onSave: (contactId: string, updates: Partial<Contact>) => void;
  onWaveCall?: (email: string, name: string) => void;
}

export const ContactDetail = React.memo(function ContactDetail({
  contact,
  onEdit,
  onDelete,
  onComposeEmail,
  onSave,
  onWaveCall,
}: ContactDetailProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const displayName = getContactDisplayName(contact);
  const initials = getContactInitials(contact);
  const primaryEmail = contact.emails[0]?.address ?? "";
  const avatarColor = getAvatarColor(primaryEmail || displayName);
  const userEmail = useAuthStore((s) => s.email);
  const canWaveCall = primaryEmail && primaryEmail !== userEmail &&
    primaryEmail.split("@")[1]?.toLowerCase() === userEmail.split("@")[1]?.toLowerCase();

  const handleCopyPhone = useCallback((phone: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      toast.success(t("contacts.phoneNumberCopied"));
    });
  }, []);

  const handleSave = useCallback(
    (updates: Partial<Contact>) => {
      onSave(contact.id, updates);
      setIsEditing(false);
    },
    [contact.id, onSave],
  );

  const handleDelete = useCallback(() => {
    onDelete(contact.id);
    setShowDeleteConfirm(false);
  }, [contact.id, onDelete]);

  if (isEditing) {
    return (
      <ContactForm
        contact={contact}
        onSave={handleSave}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header / Avatar */}
      <div className="flex flex-col items-center pt-8 pb-6 px-6">
        <div
          className="inline-flex items-center justify-center rounded-full text-white font-semibold mb-4 overflow-hidden"
          style={{
            width: 80,
            height: 80,
            backgroundColor: contact.avatar?.blobId ? undefined : avatarColor,
            fontSize: 32,
          }}
        >
          {contact.avatar?.blobId ? (
            <img
              src={`/api/blob/${contact.avatar.blobId}/inline`}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <h2
          className="text-xl font-semibold text-center"
          style={{ color: "var(--color-text-primary)" }}
        >
          {displayName}
        </h2>
        {contact.organization?.title && (
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {contact.organization.title}
            {contact.organization.name ? ` ${t("contacts.atOrganization", { name: contact.organization.name })}` : ""}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center justify-center gap-2 px-6 pb-4"
        style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
      >
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <Edit2 size={14} />
          {t("contacts.edit")}
        </button>
        {primaryEmail && (
          <button
            onClick={() => onComposeEmail(primaryEmail, displayName)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-accent)" }}
          >
            <Mail size={14} />
            {t("contacts.email")}
          </button>
        )}
        {canWaveCall && onWaveCall && (
          <button
            onClick={() => onWaveCall(primaryEmail, displayName)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-accent)" }}
          >
            <Phone size={14} />
            {t("wave.startCall")}
          </button>
        )}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-error, #dc2626)" }}
        >
          <Trash2 size={14} />
          {t("contacts.delete")}
        </button>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          className="mx-6 mt-4 p-3 rounded-md text-sm"
          style={{
            backgroundColor: "var(--color-bg-error, #fee2e2)",
            border: "1px solid var(--color-border-error, #fca5a5)",
          }}
        >
          <p
            className="mb-2"
            style={{ color: "var(--color-text-error, #dc2626)" }}
          >
            {t("contacts.deleteConfirm")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="px-3 py-1 text-xs font-medium rounded text-white"
              style={{ backgroundColor: "var(--color-text-error, #dc2626)" }}
            >
              {t("contacts.delete")}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 text-xs font-medium rounded"
              style={{
                color: "var(--color-text-secondary)",
                backgroundColor: "var(--color-bg-tertiary)",
              }}
            >
              {t("contacts.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="flex flex-col gap-1 px-6 py-4">
        {/* Emails */}
        {contact.emails.length > 0 && (
          <DetailSection icon={<Mail size={16} />} label={t("contacts.email")}>
            {contact.emails.map((email, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <button
                  onClick={() => onComposeEmail(email.address, displayName)}
                  className="text-sm hover:underline"
                  style={{ color: "var(--color-text-accent)" }}
                >
                  {email.address}
                </button>
                {email.label && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    {email.label}
                  </span>
                )}
              </div>
            ))}
          </DetailSection>
        )}

        {/* Phones */}
        {contact.phones.length > 0 && (
          <DetailSection icon={<Phone size={16} />} label={t("contacts.phone")}>
            {contact.phones.map((phone, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <button
                  onClick={() => handleCopyPhone(phone.number)}
                  className="text-sm hover:underline flex items-center gap-1"
                  style={{ color: "var(--color-text-primary)" }}
                  title={t("contacts.clickToCopy")}
                >
                  {phone.number}
                  <Copy
                    size={12}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--color-text-tertiary)" }}
                  />
                </button>
                {phone.label && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    {phone.label}
                  </span>
                )}
              </div>
            ))}
          </DetailSection>
        )}

        {/* Addresses */}
        {contact.addresses.length > 0 && (
          <DetailSection icon={<MapPin size={16} />} label={t("contacts.address")}>
            {contact.addresses.map((addr, i) => (
              <div key={i} className="flex flex-col">
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {[addr.street, addr.city, addr.state, addr.postalCode, addr.country]
                    .filter(Boolean)
                    .join(", ")}
                </span>
                {addr.label && (
                  <span
                    className="text-xs mt-0.5"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {addr.label}
                  </span>
                )}
              </div>
            ))}
          </DetailSection>
        )}

        {/* Organization */}
        {contact.organization &&
          (contact.organization.name || contact.organization.department) && (
            <DetailSection icon={<Building2 size={16} />} label={t("contacts.organization")}>
              <div className="flex flex-col">
                {contact.organization.name && (
                  <span
                    className="text-sm"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {contact.organization.name}
                  </span>
                )}
                {contact.organization.department && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {contact.organization.department}
                  </span>
                )}
              </div>
            </DetailSection>
          )}

        {/* Birthday */}
        {contact.birthday && (
          <DetailSection icon={<Cake size={16} />} label={t("contacts.birthday")}>
            <span
              className="text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              {contact.birthday}
            </span>
          </DetailSection>
        )}

        {/* URLs */}
        {contact.urls.length > 0 && (
          <DetailSection icon={<Globe size={16} />} label={t("contacts.urls")}>
            {contact.urls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <a
                  href={url.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:underline flex items-center gap-1"
                  style={{ color: "var(--color-text-accent)" }}
                >
                  {url.url}
                  <ExternalLink size={12} />
                </a>
                {url.label && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    {url.label}
                  </span>
                )}
              </div>
            ))}
          </DetailSection>
        )}

        {/* Notes */}
        {contact.notes && (
          <DetailSection icon={<StickyNote size={16} />} label={t("contacts.notes")}>
            <p
              className="text-sm whitespace-pre-wrap"
              style={{ color: "var(--color-text-primary)" }}
            >
              {contact.notes}
            </p>
          </DetailSection>
        )}
      </div>
    </div>
  );
});

/** A labeled section with icon */
function DetailSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="py-3"
      style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "var(--color-text-tertiary)" }}>{icon}</span>
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 pl-6">{children}</div>
    </div>
  );
}
