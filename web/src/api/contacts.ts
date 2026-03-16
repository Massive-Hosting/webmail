/** JMAP request builders for ContactCard, AddressBook operations */

import { apiPost } from "./client.ts";
import type {
  JMAPRequest,
  JMAPResponse,
} from "@/types/jmap.ts";
import type {
  Contact,
  ContactCreate,
  ContactUpdate,
  ContactName,
  ContactEmail,
  ContactPhone,
  ContactAddress,
  ContactOrganization,
  ContactUrl,
  AddressBook,
} from "@/types/contacts.ts";

const JMAP_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:contacts",
];

/** Send a JMAP request through our proxy */
async function jmapContactRequest(request: JMAPRequest): Promise<JMAPResponse> {
  return apiPost<JMAPResponse>("/api/jmap", request);
}

// ---- JSContact conversion (RFC 9553) ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSContactCard = Record<string, any>;

/** Map a context label string to a JSContact contexts object */
function labelToContexts(label?: string): Record<string, boolean> | undefined {
  if (!label) return undefined;
  const l = label.toLowerCase();
  if (l === "work") return { work: true };
  if (l === "home" || l === "private") return { private: true };
  return { [l]: true };
}

/** Extract the first context key as a label string */
function contextsToLabel(contexts?: Record<string, boolean>): string | undefined {
  if (!contexts) return undefined;
  const keys = Object.keys(contexts);
  if (keys.length === 0) return undefined;
  const key = keys[0];
  // Map "private" back to "Home" for UI display
  if (key === "private") return "Home";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Convert frontend Contact/ContactCreate to JSContact format for JMAP create/update */
function toJSContact(contact: ContactCreate | ContactUpdate): JSContactCard {
  const card: JSContactCard = {};

  // addressBookIds — pass through as-is
  if (contact.addressBookIds) {
    card.addressBookIds = contact.addressBookIds;
  }

  // Name → components array
  if (contact.name) {
    const components: Array<{ kind: string; value: string }> = [];
    if (contact.name.prefix) components.push({ kind: "prefix", value: contact.name.prefix });
    if (contact.name.given) components.push({ kind: "given", value: contact.name.given });
    if (contact.name.surname) components.push({ kind: "surname", value: contact.name.surname });
    if (contact.name.suffix) components.push({ kind: "suffix", value: contact.name.suffix });
    if (components.length > 0 || contact.name.full) {
      const nameObj: JSContactCard = { components };
      if (contact.name.full) nameObj.full = contact.name.full;
      card.name = nameObj;
    }
  }

  // Emails array → map with string keys
  if (contact.emails && contact.emails.length > 0) {
    const emails: JSContactCard = {};
    contact.emails.forEach((e, i) => {
      const entry: JSContactCard = { address: e.address };
      const ctx = labelToContexts(e.label);
      if (ctx) entry.contexts = ctx;
      emails[`e${i}`] = entry;
    });
    card.emails = emails;
  }

  // Phones array → map with string keys
  if (contact.phones && contact.phones.length > 0) {
    const phones: JSContactCard = {};
    contact.phones.forEach((p, i) => {
      const entry: JSContactCard = { number: p.number };
      const ctx = labelToContexts(p.label);
      if (ctx) entry.contexts = ctx;
      phones[`p${i}`] = entry;
    });
    card.phones = phones;
  }

  // Organization → organizations map and titles map (separate in JSContact)
  if (contact.organization) {
    if (contact.organization.name) {
      const orgEntry: JSContactCard = { name: contact.organization.name };
      if (contact.organization.department) {
        orgEntry.units = [{ name: contact.organization.department }];
      }
      card.organizations = { o0: orgEntry };
    }
    if (contact.organization.title) {
      card.titles = { t0: { name: contact.organization.title } };
    }
  }

  // Addresses array → map with components
  if (contact.addresses && contact.addresses.length > 0) {
    const addresses: JSContactCard = {};
    contact.addresses.forEach((a, i) => {
      const components: Array<{ kind: string; value: string }> = [];
      if (a.street) components.push({ kind: "name", value: a.street });
      if (a.city) components.push({ kind: "locality", value: a.city });
      if (a.state) components.push({ kind: "region", value: a.state });
      if (a.postalCode) components.push({ kind: "postcode", value: a.postalCode });
      if (a.country) components.push({ kind: "country", value: a.country });

      const entry: JSContactCard = { components };
      const ctx = labelToContexts(a.label);
      if (ctx) entry.contexts = ctx;
      addresses[`a${i}`] = entry;
    });
    card.addresses = addresses;
  }

  // Avatar
  if (contact.avatar !== undefined) {
    card.avatar = contact.avatar;
  }

  // Notes
  if (contact.notes) card.notes = contact.notes;

  // Birthday → anniversaries map
  if (contact.birthday) {
    card.anniversaries = {
      b0: { kind: "birth", date: contact.birthday },
    };
  }

  // URLs array → links map
  if (contact.urls && contact.urls.length > 0) {
    const links: JSContactCard = {};
    contact.urls.forEach((u, i) => {
      const entry: JSContactCard = { uri: u.url };
      const ctx = labelToContexts(u.label);
      if (ctx) entry.contexts = ctx;
      links[`l${i}`] = entry;
    });
    card.links = links;
  }

  return card;
}

/** Convert JSContact card from JMAP response to frontend Contact */
function fromJSContact(card: JSContactCard, id: string): Contact {
  // Parse name components
  const name: ContactName = {};
  if (card.name) {
    if (card.name.full) name.full = card.name.full;
    if (Array.isArray(card.name.components)) {
      for (const c of card.name.components as Array<{ kind: string; value: string }>) {
        if (c.kind === "given") name.given = c.value;
        else if (c.kind === "surname") name.surname = c.value;
        else if (c.kind === "prefix") name.prefix = c.value;
        else if (c.kind === "suffix") name.suffix = c.value;
      }
    }
    // Build full name if not present
    if (!name.full) {
      const parts = [name.prefix, name.given, name.surname, name.suffix].filter(Boolean);
      if (parts.length > 0) name.full = parts.join(" ");
    }
  }

  // Parse emails map → array
  const emails: ContactEmail[] = [];
  if (card.emails && typeof card.emails === "object") {
    for (const [, e] of Object.entries(card.emails)) {
      const entry = e as { address: string; contexts?: Record<string, boolean> };
      emails.push({
        address: entry.address,
        label: contextsToLabel(entry.contexts),
      });
    }
  }

  // Parse phones map → array
  const phones: ContactPhone[] = [];
  if (card.phones && typeof card.phones === "object") {
    for (const [, p] of Object.entries(card.phones)) {
      const entry = p as { number: string; contexts?: Record<string, boolean> };
      phones.push({
        number: entry.number,
        label: contextsToLabel(entry.contexts),
      });
    }
  }

  // Parse addresses map → array
  const addresses: ContactAddress[] = [];
  if (card.addresses && typeof card.addresses === "object") {
    for (const [, a] of Object.entries(card.addresses)) {
      const entry = a as {
        components?: Array<{ kind: string; value: string }>;
        contexts?: Record<string, boolean>;
      };
      const addr: ContactAddress = {
        label: contextsToLabel(entry.contexts),
      };
      if (Array.isArray(entry.components)) {
        for (const c of entry.components) {
          if (c.kind === "name" || c.kind === "streetAddress") addr.street = c.value;
          else if (c.kind === "locality") addr.city = c.value;
          else if (c.kind === "region") addr.state = c.value;
          else if (c.kind === "postcode") addr.postalCode = c.value;
          else if (c.kind === "country") addr.country = c.value;
        }
      }
      addresses.push(addr);
    }
  }

  // Parse organization from organizations + titles maps
  const organization: ContactOrganization = {};
  if (card.organizations && typeof card.organizations === "object") {
    const firstOrg = Object.values(card.organizations)[0] as
      | { name?: string; units?: Array<{ name: string }> }
      | undefined;
    if (firstOrg) {
      organization.name = firstOrg.name;
      if (firstOrg.units && firstOrg.units.length > 0) {
        organization.department = firstOrg.units[0].name;
      }
    }
  }
  if (card.titles && typeof card.titles === "object") {
    const firstTitle = Object.values(card.titles)[0] as { name?: string } | undefined;
    if (firstTitle) {
      organization.title = firstTitle.name;
    }
  }

  // Parse notes
  const notes = typeof card.notes === "string" ? card.notes : undefined;

  // Parse birthday from anniversaries map
  let birthday: string | undefined;
  if (card.anniversaries && typeof card.anniversaries === "object") {
    for (const [, ann] of Object.entries(card.anniversaries)) {
      const entry = ann as { kind?: string; date?: string };
      if (entry.kind === "birth" && entry.date) {
        birthday = entry.date;
        break;
      }
    }
  }

  // Parse URLs from links map → array
  const urls: ContactUrl[] = [];
  if (card.links && typeof card.links === "object") {
    for (const [, link] of Object.entries(card.links)) {
      const entry = link as { uri?: string; contexts?: Record<string, boolean> };
      if (entry.uri) {
        urls.push({
          url: entry.uri,
          label: contextsToLabel(entry.contexts),
        });
      }
    }
  }

  return {
    id,
    name,
    emails,
    phones,
    addresses,
    organization: (organization.name || organization.department || organization.title)
      ? organization
      : undefined,
    notes,
    avatar: card.avatar,
    birthday,
    urls,
    addressBookIds: card.addressBookIds ?? {},
  };
}

// ---- ContactCard operations ----

/** JSContact properties to request from server */
const CONTACT_PROPERTIES = [
  "id",
  "name",
  "emails",
  "phones",
  "addresses",
  "organizations",
  "titles",
  "notes",
  "avatar",
  "anniversaries",
  "links",
  "addressBookIds",
];

/** Convert a raw JMAP list of JSContact cards to frontend Contact objects */
function convertCardList(list: JSContactCard[]): Contact[] {
  return list.map((card) => fromJSContact(card, card.id as string));
}

/** Fetch all contacts */
export async function fetchContacts(): Promise<Contact[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/query",
        {
          limit: 10000,
        },
        "q0",
      ],
      [
        "ContactCard/get",
        {
          "#ids": {
            resultOf: "q0",
            name: "ContactCard/query",
            path: "/ids",
          },
          properties: CONTACT_PROPERTIES,
        },
        "g0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, getResult] = response.methodResponses[1] ?? response.methodResponses[0];
  return convertCardList((getResult as { list: JSContactCard[] }).list);
}

/** Fetch a single contact by ID */
export async function fetchContact(contactId: string): Promise<Contact | null> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/get",
        {
          ids: [contactId],
          properties: CONTACT_PROPERTIES,
        },
        "g0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, result] = response.methodResponses[0];
  const list = (result as { list: JSContactCard[] }).list;
  if (list.length === 0) return null;
  return fromJSContact(list[0], list[0].id as string);
}

/** Search contacts by text query */
export async function searchContacts(query: string): Promise<Contact[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/query",
        {
          filter: { text: query },
          sort: [{ property: "name/full", isAscending: true }],
          limit: 50,
        },
        "q0",
      ],
      [
        "ContactCard/get",
        {
          "#ids": {
            resultOf: "q0",
            name: "ContactCard/query",
            path: "/ids",
          },
          properties: CONTACT_PROPERTIES,
        },
        "g0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, getResult] = response.methodResponses[1] ?? response.methodResponses[0];
  return convertCardList((getResult as { list: JSContactCard[] }).list);
}

/** Create a new contact — ensures addressBookIds is set */
export async function createContact(
  contact: ContactCreate,
): Promise<string> {
  // Ensure contact belongs to at least one address book (Stalwart requires this)
  let contactData = { ...contact };
  if (!contactData.addressBookIds || Object.keys(contactData.addressBookIds).length === 0) {
    const addressBooks = await fetchAddressBooks();
    const defaultBook = addressBooks.find((ab) => ab.isDefault) ?? addressBooks[0];
    if (defaultBook) {
      contactData = { ...contactData, addressBookIds: { [defaultBook.id]: true } };
    }
  }

  const jsContact = toJSContact(contactData);

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/set",
        {
          create: {
            new: jsContact,
          },
        },
        "s0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    created?: Record<string, { id: string }>;
    notCreated?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notCreated?.new) {
    throw new Error(
      setResult.notCreated.new.description ?? "Failed to create contact",
    );
  }

  return setResult.created?.new?.id ?? "";
}

/** Update an existing contact */
export async function updateContact(
  contactId: string,
  updates: ContactUpdate,
): Promise<void> {
  const jsContact = toJSContact(updates);

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/set",
        {
          update: {
            [contactId]: jsContact,
          },
        },
        "s0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    notUpdated?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notUpdated?.[contactId]) {
    throw new Error(
      setResult.notUpdated[contactId].description ?? "Failed to update contact",
    );
  }
}

/** Delete a contact */
export async function deleteContact(contactId: string): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/set",
        {
          destroy: [contactId],
        },
        "s0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    notDestroyed?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notDestroyed?.[contactId]) {
    throw new Error(
      setResult.notDestroyed[contactId].description ?? "Failed to delete contact",
    );
  }
}

/** Batch create contacts (for import) */
export async function batchCreateContacts(
  contacts: ContactCreate[],
): Promise<string[]> {
  // Ensure all contacts have addressBookIds
  const addressBooks = await fetchAddressBooks();
  const defaultBook = addressBooks.find((ab) => ab.isDefault) ?? addressBooks[0];
  const defaultBookIds = defaultBook ? { [defaultBook.id]: true } : {};

  const createMap: Record<string, JSContactCard> = {};
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const withBook = (!c.addressBookIds || Object.keys(c.addressBookIds).length === 0)
      ? { ...c, addressBookIds: defaultBookIds }
      : c;
    createMap[`import-${i}`] = toJSContact(withBook);
  }

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/set",
        {
          create: createMap,
        },
        "s0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    created?: Record<string, { id: string }>;
  };

  const ids: string[] = [];
  if (setResult.created) {
    for (let i = 0; i < contacts.length; i++) {
      const created = setResult.created[`import-${i}`];
      if (created) {
        ids.push(created.id);
      }
    }
  }
  return ids;
}

/** Fetch contact changes since a known state */
export async function fetchContactChanges(sinceState: string): Promise<{
  oldState: string;
  newState: string;
  created: Contact[];
  updated: Contact[];
  destroyed: string[];
  hasMoreChanges: boolean;
}> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/changes",
        { sinceState },
        "c0",
      ],
      [
        "ContactCard/get",
        {
          "#ids": {
            resultOf: "c0",
            name: "ContactCard/changes",
            path: "/created",
          },
          properties: CONTACT_PROPERTIES,
        },
        "g_created",
      ],
      [
        "ContactCard/get",
        {
          "#ids": {
            resultOf: "c0",
            name: "ContactCard/changes",
            path: "/updated",
          },
          properties: CONTACT_PROPERTIES,
        },
        "g_updated",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, changesResult] = response.methodResponses[0];
  const [, createdResult] = response.methodResponses[1];
  const [, updatedResult] = response.methodResponses[2];

  const changes = changesResult as {
    oldState: string;
    newState: string;
    created: string[];
    updated: string[];
    destroyed: string[];
    hasMoreChanges: boolean;
  };

  return {
    oldState: changes.oldState,
    newState: changes.newState,
    created: convertCardList((createdResult as { list: JSContactCard[] }).list),
    updated: convertCardList((updatedResult as { list: JSContactCard[] }).list),
    destroyed: changes.destroyed,
    hasMoreChanges: changes.hasMoreChanges,
  };
}

// ---- AddressBook operations ----

/** Fetch all address books */
export async function fetchAddressBooks(): Promise<AddressBook[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "AddressBook/get",
        {
          properties: ["id", "name", "isDefault"],
        },
        "a0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, result] = response.methodResponses[0];
  return (result as { list: AddressBook[] }).list;
}

/** Create a new address book */
export async function createAddressBook(name: string): Promise<string> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "AddressBook/set",
        {
          create: {
            new: { name, isDefault: false },
          },
        },
        "a0",
      ],
    ],
  };

  const response = await jmapContactRequest(request);
  const [, result] = response.methodResponses[0];
  const setResult = result as {
    created?: Record<string, { id: string }>;
    notCreated?: Record<string, { type: string; description?: string }>;
  };

  if (setResult.notCreated?.new) {
    throw new Error(
      setResult.notCreated.new.description ?? "Failed to create address book",
    );
  }

  return setResult.created?.new?.id ?? "";
}

/** Update an address book */
export async function updateAddressBook(
  addressBookId: string,
  updates: { name?: string },
): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "AddressBook/set",
        {
          update: {
            [addressBookId]: updates,
          },
        },
        "a0",
      ],
    ],
  };

  await jmapContactRequest(request);
}

/** Delete an address book */
export async function deleteAddressBook(addressBookId: string): Promise<void> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "AddressBook/set",
        {
          destroy: [addressBookId],
        },
        "a0",
      ],
    ],
  };

  await jmapContactRequest(request);
}
