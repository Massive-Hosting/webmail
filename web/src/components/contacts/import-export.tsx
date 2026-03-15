/** vCard import/export for contacts */

import { batchCreateContacts } from "@/api/contacts.ts";
import type { Contact, ContactCreate } from "@/types/contacts.ts";
import { getContactDisplayName } from "@/hooks/use-contacts.ts";

// ---- vCard Parser ----

/** Parse a vCard string into ContactCreate objects */
export function parseVCard(vcardText: string): ContactCreate[] {
  const contacts: ContactCreate[] = [];
  const cards = vcardText.split(/(?=BEGIN:VCARD)/i);

  for (const card of cards) {
    if (!card.trim()) continue;
    if (!/BEGIN:VCARD/i.test(card)) continue;

    const contact: ContactCreate = {
      name: {},
      emails: [],
      phones: [],
      addresses: [],
      urls: [],
      addressBookIds: {},
    };

    // Unfold lines (RFC 6350: continuation lines start with space/tab)
    const unfolded = card.replace(/\r?\n[ \t]/g, "");
    const lines = unfolded.split(/\r?\n/);

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const rawProp = line.substring(0, colonIdx);
      const value = line.substring(colonIdx + 1).trim();

      // Split property name from parameters
      const semicolonIdx = rawProp.indexOf(";");
      const propName = (
        semicolonIdx === -1 ? rawProp : rawProp.substring(0, semicolonIdx)
      ).toUpperCase();
      const params =
        semicolonIdx === -1 ? "" : rawProp.substring(semicolonIdx + 1);

      // Extract TYPE parameter
      const typeMatch = params.match(/TYPE=([^;,]+)/i);
      const label = typeMatch ? capitalize(typeMatch[1]) : undefined;

      switch (propName) {
        case "FN":
          contact.name.full = decodeVCardValue(value);
          break;

        case "N": {
          const parts = value.split(";");
          contact.name.surname = decodeVCardValue(parts[0] ?? "");
          contact.name.given = decodeVCardValue(parts[1] ?? "");
          // parts[2] = additional names, parts[3] = prefix, parts[4] = suffix
          if (parts[3]) contact.name.prefix = decodeVCardValue(parts[3]);
          if (parts[4]) contact.name.suffix = decodeVCardValue(parts[4]);
          break;
        }

        case "EMAIL":
          if (value) {
            contact.emails.push({
              address: decodeVCardValue(value),
              label,
            });
          }
          break;

        case "TEL":
          if (value) {
            contact.phones.push({
              number: decodeVCardValue(value),
              label,
            });
          }
          break;

        case "ADR": {
          const addrParts = value.split(";");
          // ADR: PO Box;Extended;Street;City;Region;Postal Code;Country
          const addr = {
            street: decodeVCardValue(addrParts[2] ?? ""),
            city: decodeVCardValue(addrParts[3] ?? ""),
            state: decodeVCardValue(addrParts[4] ?? ""),
            postalCode: decodeVCardValue(addrParts[5] ?? ""),
            country: decodeVCardValue(addrParts[6] ?? ""),
            label,
          };
          if (addr.street || addr.city || addr.state || addr.postalCode || addr.country) {
            contact.addresses.push(addr);
          }
          break;
        }

        case "ORG": {
          const orgParts = value.split(";");
          contact.organization = {
            name: decodeVCardValue(orgParts[0] ?? ""),
            department: decodeVCardValue(orgParts[1] ?? ""),
          };
          break;
        }

        case "TITLE":
          if (!contact.organization) contact.organization = {};
          contact.organization.title = decodeVCardValue(value);
          break;

        case "NOTE":
          contact.notes = decodeVCardValue(value);
          break;

        case "BDAY":
          contact.birthday = value;
          break;

        case "URL":
          if (value) {
            contact.urls.push({ url: decodeVCardValue(value), label });
          }
          break;
      }
    }

    // Only add if has meaningful data
    if (
      contact.name.full ||
      contact.name.given ||
      contact.name.surname ||
      contact.emails.length > 0
    ) {
      contacts.push(contact);
    }
  }

  return contacts;
}

/** Decode escaped vCard values */
function decodeVCardValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ---- vCard Serializer ----

/** Serialize contacts to vCard 4.0 format */
export function serializeVCards(contacts: Contact[]): string {
  const cards: string[] = [];

  for (const contact of contacts) {
    const lines: string[] = [];
    lines.push("BEGIN:VCARD");
    lines.push("VERSION:4.0");

    // FN (required)
    const fn = getContactDisplayName(contact);
    lines.push(`FN:${escapeVCardValue(fn)}`);

    // N
    const n = [
      contact.name.surname ?? "",
      contact.name.given ?? "",
      "", // additional names
      contact.name.prefix ?? "",
      contact.name.suffix ?? "",
    ].join(";");
    lines.push(`N:${n}`);

    // Emails
    for (const email of contact.emails) {
      const typeParam = email.label ? `;TYPE=${email.label.toUpperCase()}` : "";
      lines.push(`EMAIL${typeParam}:${email.address}`);
    }

    // Phones
    for (const phone of contact.phones) {
      const typeParam = phone.label ? `;TYPE=${phone.label.toUpperCase()}` : "";
      lines.push(`TEL${typeParam}:${phone.number}`);
    }

    // Addresses
    for (const addr of contact.addresses) {
      const typeParam = addr.label ? `;TYPE=${addr.label.toUpperCase()}` : "";
      const parts = [
        "", // PO Box
        "", // Extended
        addr.street ?? "",
        addr.city ?? "",
        addr.state ?? "",
        addr.postalCode ?? "",
        addr.country ?? "",
      ].join(";");
      lines.push(`ADR${typeParam}:${parts}`);
    }

    // Org
    if (contact.organization?.name || contact.organization?.department) {
      const org = [
        contact.organization.name ?? "",
        contact.organization.department ?? "",
      ].join(";");
      lines.push(`ORG:${escapeVCardValue(org)}`);
    }
    if (contact.organization?.title) {
      lines.push(`TITLE:${escapeVCardValue(contact.organization.title)}`);
    }

    // Notes
    if (contact.notes) {
      lines.push(`NOTE:${escapeVCardValue(contact.notes)}`);
    }

    // Birthday
    if (contact.birthday) {
      lines.push(`BDAY:${contact.birthday}`);
    }

    // URLs
    for (const url of contact.urls) {
      const typeParam = url.label ? `;TYPE=${url.label.toUpperCase()}` : "";
      lines.push(`URL${typeParam}:${url.url}`);
    }

    lines.push("END:VCARD");
    cards.push(lines.join("\r\n"));
  }

  return cards.join("\r\n");
}

function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// ---- Import ----

/** Open file picker, parse vCard, and create contacts. Returns count imported. */
export async function importVCards(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".vcf,.vcard";
    input.multiple = false;

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(0);
        return;
      }

      try {
        const text = await file.text();
        const contacts = parseVCard(text);
        if (contacts.length === 0) {
          resolve(0);
          return;
        }

        // Batch create
        const BATCH_SIZE = 50;
        let total = 0;
        for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
          const batch = contacts.slice(i, i + BATCH_SIZE);
          const ids = await batchCreateContacts(batch);
          total += ids.length;
        }
        resolve(total);
      } catch (err) {
        reject(err);
      }
    };

    input.click();
  });
}

// ---- Export ----

/** Export contacts as a vCard 4.0 file download */
export function exportVCards(contacts: Contact[]): void {
  if (contacts.length === 0) return;

  const vcardContent = serializeVCards(contacts);
  const blob = new Blob([vcardContent], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "contacts.vcf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
