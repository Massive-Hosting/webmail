/** Inline contact edit form */

import React, { useState, useCallback } from "react";
import { Plus, X, Save, XCircle } from "lucide-react";
import type { Contact, ContactEmail, ContactPhone, ContactAddress, ContactUrl } from "@/types/contacts.ts";
import { getContactDisplayName, getContactInitials } from "@/hooks/use-contacts.ts";
import { getAvatarColor } from "@/lib/format.ts";
import { toast } from "sonner";
import { StyledSelect } from "@/components/ui/styled-select.tsx";

const LABELS = ["Work", "Home", "Other"];

interface ContactFormProps {
  contact?: Contact | null;
  onSave: (data: Partial<Contact>) => void;
  onCancel: () => void;
}

export const ContactForm = React.memo(function ContactForm({
  contact,
  onSave,
  onCancel,
}: ContactFormProps) {
  const [fullName, setFullName] = useState(contact?.name.full ?? "");
  const [givenName, setGivenName] = useState(contact?.name.given ?? "");
  const [surname, setSurname] = useState(contact?.name.surname ?? "");
  const [prefix, setPrefix] = useState(contact?.name.prefix ?? "");
  const [suffix, setSuffix] = useState(contact?.name.suffix ?? "");
  const [emails, setEmails] = useState<ContactEmail[]>(
    contact?.emails.length ? [...contact.emails] : [{ address: "" }],
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

  const displayName = fullName || `${givenName} ${surname}`.trim() || emails[0]?.address || "New Contact";
  const initials = displayName[0]?.toUpperCase() ?? "?";
  const avatarColor = getAvatarColor(emails[0]?.address || displayName);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Validate: at least name or email
      const hasName = fullName || givenName || surname;
      const hasEmail = emails.some((em) => em.address.trim());
      if (!hasName && !hasEmail) {
        toast.error("Please enter at least a name or email");
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
      onSave,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col items-center pt-8 pb-4 px-6">
        <div
          className="inline-flex items-center justify-center rounded-full text-white font-semibold mb-4"
          style={{
            width: 80,
            height: 80,
            backgroundColor: avatarColor,
            fontSize: 32,
          }}
        >
          {initials}
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
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <XCircle size={14} />
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-4 px-6 py-4">
        {/* Name section */}
        <FormSection label="Name">
          <FormInput
            label="Full name"
            value={fullName}
            onChange={setFullName}
            placeholder="Full name"
          />
          <div className="flex gap-2">
            <FormInput
              label="First"
              value={givenName}
              onChange={setGivenName}
              placeholder="First name"
            />
            <FormInput
              label="Last"
              value={surname}
              onChange={setSurname}
              placeholder="Last name"
            />
          </div>
          <div className="flex gap-2">
            <FormInput
              label="Prefix"
              value={prefix}
              onChange={setPrefix}
              placeholder="Prefix"
            />
            <FormInput
              label="Suffix"
              value={suffix}
              onChange={setSuffix}
              placeholder="Suffix"
            />
          </div>
        </FormSection>

        {/* Email section */}
        <FormSection label="Email">
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
        <FormSection label="Phone">
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
        <FormSection label="Address">
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
                  placeholder="Street"
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
                    placeholder="City"
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
                    placeholder="State"
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
                    placeholder="ZIP"
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
                    placeholder="Country"
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
        <FormSection label="URLs">
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
        <FormSection label="Organization">
          <FormInput
            label="Company"
            value={orgName}
            onChange={setOrgName}
            placeholder="Company name"
          />
          <FormInput
            label="Department"
            value={orgDepartment}
            onChange={setOrgDepartment}
            placeholder="Department"
          />
          <FormInput
            label="Title"
            value={orgTitle}
            onChange={setOrgTitle}
            placeholder="Job title"
          />
        </FormSection>

        {/* Birthday */}
        <FormSection label="Birthday">
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
        <FormSection label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes..."
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
  return (
    <StyledSelect
      value={value}
      onValueChange={onChange}
      options={[
        { value: "", label: "Label" },
        ...LABELS.map((l) => ({ value: l, label: l })),
      ]}
      placeholder="Label"
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
        Add
      </button>
    </div>
  );
}
