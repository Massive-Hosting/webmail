/** Inline contact edit form */

import React, { useState, useCallback, useRef } from "react";
import { Plus, X, Save, XCircle, Camera } from "lucide-react";
import type { Contact, ContactEmail, ContactPhone, ContactAddress, ContactUrl } from "@/types/contacts.ts";
import { getAvatarColor } from "@/lib/format.ts";
import { toast } from "sonner";
import { StyledSelect } from "@/components/ui/styled-select.tsx";
import { useTranslation } from "react-i18next";

interface ContactFormProps {
  contact?: Contact | null;
  onSave: (data: Partial<Contact>) => void;
  onCancel: () => void;
  initialEmail?: string;
  initialName?: string;
}

export const ContactForm = React.memo(function ContactForm({
  contact,
  onSave,
  onCancel,
  initialEmail,
  initialName,
}: ContactFormProps) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(contact?.name.full ?? initialName ?? "");
  const [givenName, setGivenName] = useState(contact?.name.given ?? "");
  const [surname, setSurname] = useState(contact?.name.surname ?? "");
  const [prefix, setPrefix] = useState(contact?.name.prefix ?? "");
  const [suffix, setSuffix] = useState(contact?.name.suffix ?? "");
  // Show expanded name fields only when prefix/suffix are set or user expands
  const [showNameDetails, setShowNameDetails] = useState(
    !!(contact?.name.prefix || contact?.name.suffix)
  );
  const [emails, setEmails] = useState<ContactEmail[]>(
    contact?.emails.length ? [...contact.emails] : [{ address: initialEmail ?? "" }],
  );
  const [phones, setPhones] = useState<ContactPhone[]>(
    contact?.phones.length ? [...contact.phones] : [],
  );
  const [addresses, setAddresses] = useState<ContactAddress[]>(
    contact?.addresses.length ? [...contact.addresses] : [],
  );
  const [urls, setUrls] = useState<ContactUrl[]>(
    contact?.urls.length ? [...contact.urls] : [],
  );
  const [orgName, setOrgName] = useState(contact?.organization?.name ?? "");
  const [orgDepartment, setOrgDepartment] = useState(
    contact?.organization?.department ?? "",
  );
  const [orgTitle, setOrgTitle] = useState(contact?.organization?.title ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [birthday, setBirthday] = useState(contact?.birthday ?? "");
  const [avatarBlobId, setAvatarBlobId] = useState<string | undefined>(
    contact?.avatar?.blobId,
  );
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = fullName || `${givenName} ${surname}`.trim() || emails[0]?.address || "New Contact";
  const initials = displayName[0]?.toUpperCase() ?? "?";
  const avatarColor = getAvatarColor(emails[0]?.address || displayName);
  const avatarUrl = avatarBlobId ? `/api/blob/${avatarBlobId}/inline` : undefined;

  const handlePhotoUpload = useCallback(async (file: File) => {
    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const response = await fetch("/api/blob/upload", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const result = await response.json();
      setAvatarBlobId(result.blobId);
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handlePhotoUpload(file);
      }
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [handlePhotoUpload],
  );

  const handleRemovePhoto = useCallback(() => {
    setAvatarBlobId(undefined);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Validate: at least name or email
      const hasName = fullName || givenName || surname;
      const hasEmail = emails.some((em) => em.address.trim());
      if (!hasName && !hasEmail) {
        toast.error(t("contacts.enterNameOrEmail"));
        return;
      }

      const data: Partial<Contact> = {
        name: {
          full: fullName || undefined,
          given: givenName || undefined,
          surname: surname || undefined,
          prefix: prefix || undefined,
          suffix: suffix || undefined,
        },
        emails: emails.filter((e) => e.address.trim()),
        phones: phones.filter((p) => p.number.trim()),
        addresses: addresses.filter(
          (a) => a.street || a.city || a.state || a.postalCode || a.country,
        ),
        urls: urls.filter((u) => u.url.trim()),
        notes: notes || undefined,
        birthday: birthday || undefined,
        avatar: avatarBlobId ? { blobId: avatarBlobId } : undefined,
      };

      if (orgName || orgDepartment || orgTitle) {
        data.organization = {
          name: orgName || undefined,
          department: orgDepartment || undefined,
          title: orgTitle || undefined,
        };
      }

      onSave(data);
    },
    [
      fullName, givenName, surname, prefix, suffix,
      emails, phones, addresses, urls,
      orgName, orgDepartment, orgTitle, notes, birthday,
      avatarBlobId, onSave, t,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col items-center pt-8 pb-4 px-6">
        <div className="relative mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative rounded-full overflow-hidden cursor-pointer group"
            style={{ width: 80, height: 80 }}
            title={t("contacts.uploadPhoto")}
            disabled={isUploadingPhoto}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-semibold"
                style={{ backgroundColor: avatarColor, fontSize: 32 }}
              >
                {initials}
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <Camera
                size={20}
                className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
            {isUploadingPhoto && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white bg-red-500 hover:bg-red-600 transition-colors shadow-sm"
              title={t("contacts.removePhoto")}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div
        className="flex items-center justify-center gap-2 px-6 pb-4"
        style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
      >
        <button
          type="submit"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150"
          style={{
            backgroundColor: "var(--color-text-accent)",
            color: "white",
          }}
        >
          <Save size={14} />
          {t("contacts.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <XCircle size={14} />
          {t("contacts.cancel")}
        </button>
      </div>

      <div className="flex flex-col gap-4 px-6 py-4">
        {/* Name section — simple by default, expandable */}
        <FormSection label={t("contacts.name")}>
          <FormInput
            label={t("contacts.name")}
            value={fullName}
            onChange={(val) => {
              setFullName(val);
              // Auto-split into given/surname for JSContact
              if (!showNameDetails) {
                const parts = val.trim().split(/\s+/);
                if (parts.length >= 2) {
                  setGivenName(parts[0]);
                  setSurname(parts.slice(1).join(" "));
                } else {
                  setGivenName(val.trim());
                  setSurname("");
                }
              }
            }}
            placeholder={t("contacts.namePlaceholder")}
          />
          <button
            type="button"
            onClick={() => setShowNameDetails((v) => !v)}
            className="text-xs font-medium transition-colors self-start"
            style={{ color: "var(--color-text-accent)" }}
          >
            {showNameDetails ? t("contacts.hideNameDetails") : t("contacts.showNameDetails")}
          </button>
          {showNameDetails && (
            <>
              <div className="flex gap-2">
                <FormInput
                  label={t("contacts.first")}
                  value={givenName}
                  onChange={setGivenName}
                  placeholder={t("contacts.firstName")}
                />
                <FormInput
                  label={t("contacts.last")}
                  value={surname}
                  onChange={setSurname}
                  placeholder={t("contacts.lastName")}
                />
              </div>
              <div className="flex gap-2">
                <FormInput
                  label={t("contacts.prefix")}
                  value={prefix}
                  onChange={setPrefix}
                  placeholder={t("contacts.prefix")}
                />
                <FormInput
                  label={t("contacts.suffix")}
                  value={suffix}
                  onChange={setSuffix}
                  placeholder={t("contacts.suffix")}
                />
              </div>
            </>
          )}
        </FormSection>

        {/* Email section */}
        <FormSection label={t("contacts.email")}>
          <MultiField
            items={emails}
            onChange={setEmails}
            renderItem={(email, i) => (
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={email.address}
                  onChange={(e) => {
                    const next = [...emails];
                    next[i] = { ...next[i], address: e.target.value };
                    setEmails(next);
                  }}
                  placeholder="email@example.com"
                  className="flex-1 text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                  style={{
                    color: "var(--color-text-primary)",
                    borderColor: "var(--color-border-primary)",
                  }}
                />
                <LabelSelect
                  value={email.label ?? ""}
                  onChange={(label) => {
                    const next = [...emails];
                    next[i] = { ...next[i], label };
                    setEmails(next);
                  }}
                />
              </div>
            )}
            createEmpty={(): ContactEmail => ({ address: "" })}
          />
        </FormSection>

        {/* Phone section */}
        <FormSection label={t("contacts.phone")}>
          <MultiField
            items={phones}
            onChange={setPhones}
            renderItem={(phone, i) => (
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  value={phone.number}
                  onChange={(e) => {
                    const next = [...phones];
                    next[i] = { ...next[i], number: e.target.value };
                    setPhones(next);
                  }}
                  placeholder="+1 555-0123"
                  className="flex-1 text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                  style={{
                    color: "var(--color-text-primary)",
                    borderColor: "var(--color-border-primary)",
                  }}
                />
                <LabelSelect
                  value={phone.label ?? ""}
                  onChange={(label) => {
                    const next = [...phones];
                    next[i] = { ...next[i], label };
                    setPhones(next);
                  }}
                />
              </div>
            )}
            createEmpty={(): ContactPhone => ({ number: "" })}
          />
        </FormSection>

        {/* Address section */}
        <FormSection label={t("contacts.address")}>
          <MultiField
            items={addresses}
            onChange={setAddresses}
            renderItem={(addr, i) => (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={addr.street ?? ""}
                  onChange={(e) => {
                    const next = [...addresses];
                    next[i] = { ...next[i], street: e.target.value };
                    setAddresses(next);
                  }}
                  placeholder={t("contacts.street")}
                  className="text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                  style={{
                    color: "var(--color-text-primary)",
                    borderColor: "var(--color-border-primary)",
                  }}
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addr.city ?? ""}
                    onChange={(e) => {
                      const next = [...addresses];
                      next[i] = { ...next[i], city: e.target.value };
                      setAddresses(next);
                    }}
                    placeholder={t("contacts.city")}
                    className="flex-1 text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                    style={{
                      color: "var(--color-text-primary)",
                      borderColor: "var(--color-border-primary)",
                    }}
                  />
                  <input
                    type="text"
                    value={addr.state ?? ""}
                    onChange={(e) => {
                      const next = [...addresses];
                      next[i] = { ...next[i], state: e.target.value };
                      setAddresses(next);
                    }}
                    placeholder={t("contacts.state")}
                    className="w-20 text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                    style={{
                      color: "var(--color-text-primary)",
                      borderColor: "var(--color-border-primary)",
                    }}
                  />
                  <input
                    type="text"
                    value={addr.postalCode ?? ""}
                    onChange={(e) => {
                      const next = [...addresses];
                      next[i] = { ...next[i], postalCode: e.target.value };
                      setAddresses(next);
                    }}
                    placeholder={t("contacts.zip")}
                    className="w-20 text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                    style={{
                      color: "var(--color-text-primary)",
                      borderColor: "var(--color-border-primary)",
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addr.country ?? ""}
                    onChange={(e) => {
                      const next = [...addresses];
                      next[i] = { ...next[i], country: e.target.value };
                      setAddresses(next);
                    }}
                    placeholder={t("contacts.country")}
                    className="flex-1 text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                    style={{
                      color: "var(--color-text-primary)",
                      borderColor: "var(--color-border-primary)",
                    }}
                  />
                  <LabelSelect
                    value={addr.label ?? ""}
                    onChange={(label) => {
                      const next = [...addresses];
                      next[i] = { ...next[i], label };
                      setAddresses(next);
                    }}
                  />
                </div>
              </div>
            )}
            createEmpty={(): ContactAddress => ({})}
          />
        </FormSection>

        {/* URLs */}
        <FormSection label={t("contacts.urls")}>
          <MultiField
            items={urls}
            onChange={setUrls}
            renderItem={(url, i) => (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={url.url}
                  onChange={(e) => {
                    const next = [...urls];
                    next[i] = { ...next[i], url: e.target.value };
                    setUrls(next);
                  }}
                  placeholder="https://..."
                  className="flex-1 text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
                  style={{
                    color: "var(--color-text-primary)",
                    borderColor: "var(--color-border-primary)",
                  }}
                />
                <LabelSelect
                  value={url.label ?? ""}
                  onChange={(label) => {
                    const next = [...urls];
                    next[i] = { ...next[i], label };
                    setUrls(next);
                  }}
                />
              </div>
            )}
            createEmpty={(): ContactUrl => ({ url: "" })}
          />
        </FormSection>

        {/* Organization */}
        <FormSection label={t("contacts.organization")}>
          <FormInput
            label={t("contacts.company")}
            value={orgName}
            onChange={setOrgName}
            placeholder={t("contacts.companyName")}
          />
          <FormInput
            label={t("contacts.department")}
            value={orgDepartment}
            onChange={setOrgDepartment}
            placeholder={t("contacts.department")}
          />
          <FormInput
            label={t("contacts.title")}
            value={orgTitle}
            onChange={setOrgTitle}
            placeholder={t("contacts.jobTitle")}
          />
        </FormSection>

        {/* Birthday */}
        <FormSection label={t("contacts.birthday")}>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="text-sm px-2 py-1.5 rounded border outline-none bg-transparent"
            style={{
              color: "var(--color-text-primary)",
              borderColor: "var(--color-border-primary)",
            }}
          />
        </FormSection>

        {/* Notes */}
        <FormSection label={t("contacts.notes")}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("contacts.addNotes")}
            rows={3}
            className="text-sm px-2 py-1.5 rounded border outline-none bg-transparent resize-y"
            style={{
              color: "var(--color-text-primary)",
              borderColor: "var(--color-border-primary)",
            }}
          />
        </FormSection>
      </div>
    </form>
  );
});

/** Form section wrapper */
function FormSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pb-4"
      style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
    >
      <label
        className="block text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </label>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/** Single text input with label */
function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="text-sm px-2 py-1.5 rounded border outline-none bg-transparent w-full"
      style={{
        color: "var(--color-text-primary)",
        borderColor: "var(--color-border-primary)",
      }}
    />
  );
}

/** Label dropdown (Work, Home, Other) */
function LabelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const LABELS = [
    { value: "Work", label: t("contacts.labelWork") },
    { value: "Home", label: t("contacts.labelHome") },
    { value: "Other", label: t("contacts.labelOther") },
  ];
  return (
    <StyledSelect
      value={value}
      onValueChange={onChange}
      options={[
        { value: "", label: t("contacts.label") },
        ...LABELS,
      ]}
      placeholder={t("contacts.label")}
      className="shrink-0"
    />
  );
}

/** Multi-value field with add/remove */
function MultiField<T>({
  items,
  onChange,
  renderItem,
  createEmpty,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  createEmpty: () => T;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-1">
          <div className="flex-1">{renderItem(item, i)}</div>
          <button
            type="button"
            onClick={() => {
              const next = [...items];
              next.splice(i, 1);
              onChange(next);
            }}
            className="mt-1.5 p-0.5 rounded hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, createEmpty()])}
        className="flex items-center gap-1 text-xs py-1 hover:underline"
        style={{ color: "var(--color-text-accent)" }}
      >
        <Plus size={12} />
        {t("contacts.add")}
      </button>
    </div>
  );
}
