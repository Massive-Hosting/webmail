import { describe, it, expect } from "vitest";
import { parseVCard, serializeVCards } from "../import-export.tsx";
import type { Contact } from "@/types/contacts.ts";

describe("parseVCard", () => {
  it("parses vCard 4.0 with name, email, and phone", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Alice Smith",
      "N:Smith;Alice;;;",
      "EMAIL;TYPE=WORK:alice@example.com",
      "TEL;TYPE=CELL:+1-555-0100",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCard(vcard);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name.full).toBe("Alice Smith");
    expect(contacts[0].name.surname).toBe("Smith");
    expect(contacts[0].name.given).toBe("Alice");
    expect(contacts[0].emails).toHaveLength(1);
    expect(contacts[0].emails[0].address).toBe("alice@example.com");
    expect(contacts[0].emails[0].label).toBe("Work");
    expect(contacts[0].phones).toHaveLength(1);
    expect(contacts[0].phones[0].number).toBe("+1-555-0100");
    expect(contacts[0].phones[0].label).toBe("Cell");
  });

  it("parses vCard 3.0 format", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Bob Jones",
      "N:Jones;Bob;;;",
      "EMAIL;TYPE=HOME:bob@home.com",
      "TEL;TYPE=HOME:+1-555-0200",
      "ORG:Acme Corp;Engineering",
      "TITLE:Senior Engineer",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCard(vcard);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name.full).toBe("Bob Jones");
    expect(contacts[0].emails[0].address).toBe("bob@home.com");
    expect(contacts[0].organization?.name).toBe("Acme Corp");
    expect(contacts[0].organization?.department).toBe("Engineering");
    expect(contacts[0].organization?.title).toBe("Senior Engineer");
  });

  it("parses multiple vCards", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Alice",
      "EMAIL:alice@example.com",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Bob",
      "EMAIL:bob@example.com",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCard(vcard);
    expect(contacts).toHaveLength(2);
    expect(contacts[0].name.full).toBe("Alice");
    expect(contacts[1].name.full).toBe("Bob");
  });

  it("handles vCard with address", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Carol Davis",
      "ADR;TYPE=HOME:;;123 Main St;Springfield;IL;62704;US",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCard(vcard);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].addresses).toHaveLength(1);
    expect(contacts[0].addresses[0].street).toBe("123 Main St");
    expect(contacts[0].addresses[0].city).toBe("Springfield");
    expect(contacts[0].addresses[0].state).toBe("IL");
    expect(contacts[0].addresses[0].postalCode).toBe("62704");
    expect(contacts[0].addresses[0].country).toBe("US");
  });

  it("handles escaped values", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Test\\, User",
      "NOTE:Line 1\\nLine 2",
      "EMAIL:test@example.com",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCard(vcard);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name.full).toBe("Test, User");
    expect(contacts[0].notes).toBe("Line 1\nLine 2");
  });

  it("skips cards with no meaningful data", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "NOTE:just a note",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCard(vcard);
    expect(contacts).toHaveLength(0);
  });

  it("parses birthday and URL", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Dave",
      "BDAY:1990-05-15",
      "URL:https://dave.example.com",
      "END:VCARD",
    ].join("\r\n");

    const contacts = parseVCard(vcard);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].birthday).toBe("1990-05-15");
    expect(contacts[0].urls).toHaveLength(1);
    expect(contacts[0].urls[0].url).toBe("https://dave.example.com");
  });
});

describe("serializeVCards", () => {
  it("exports a contact to vCard 4.0 format", () => {
    const contact: Contact = {
      id: "c1",
      name: { full: "Alice Smith", given: "Alice", surname: "Smith" },
      emails: [{ address: "alice@example.com", label: "Work" }],
      phones: [{ number: "+1-555-0100", label: "Cell" }],
      addresses: [],
      urls: [],
      addressBookIds: { "ab1": true },
    };

    const vcf = serializeVCards([contact]);
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("VERSION:4.0");
    expect(vcf).toContain("FN:Alice Smith");
    expect(vcf).toContain("N:Smith;Alice;;;");
    expect(vcf).toContain("EMAIL;TYPE=WORK:alice@example.com");
    expect(vcf).toContain("TEL;TYPE=CELL:+1-555-0100");
    expect(vcf).toContain("END:VCARD");
  });

  it("exports multiple contacts", () => {
    const contacts: Contact[] = [
      {
        id: "c1",
        name: { full: "Alice" },
        emails: [{ address: "alice@example.com" }],
        phones: [],
        addresses: [],
        urls: [],
        addressBookIds: {},
      },
      {
        id: "c2",
        name: { full: "Bob" },
        emails: [{ address: "bob@example.com" }],
        phones: [],
        addresses: [],
        urls: [],
        addressBookIds: {},
      },
    ];

    const vcf = serializeVCards(contacts);
    const beginCount = (vcf.match(/BEGIN:VCARD/g) || []).length;
    expect(beginCount).toBe(2);
  });

  it("exports organization and notes", () => {
    const contact: Contact = {
      id: "c1",
      name: { full: "Carol" },
      emails: [],
      phones: [],
      addresses: [],
      urls: [],
      addressBookIds: {},
      organization: { name: "Acme", department: "Eng", title: "Lead" },
      notes: "Important contact",
    };

    const vcf = serializeVCards([contact]);
    expect(vcf).toContain("ORG:Acme\\;Eng");
    expect(vcf).toContain("TITLE:Lead");
    expect(vcf).toContain("NOTE:Important contact");
  });
});
