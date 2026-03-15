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

// ---- ContactCard operations ----

const CONTACT_PROPERTIES = [
  "id",
  "name",
  "emails",
  "phones",
  "addresses",
  "organization",
  "notes",
  "avatar",
  "birthday",
  "urls",
  "addressBookIds",
];

/** Fetch all contacts */
export async function fetchContacts(): Promise<Contact[]> {
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/query",
        {
          sort: [{ property: "name/full", isAscending: true }],
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
  return (getResult as { list: Contact[] }).list;
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
  const list = (result as { list: Contact[] }).list;
  return list.length > 0 ? list[0] : null;
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
  return (getResult as { list: Contact[] }).list;
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

  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/set",
        {
          create: {
            new: contactData,
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
  const request: JMAPRequest = {
    using: JMAP_USING,
    methodCalls: [
      [
        "ContactCard/set",
        {
          update: {
            [contactId]: updates,
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

  const createMap: Record<string, ContactCreate> = {};
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    createMap[`import-${i}`] = (!c.addressBookIds || Object.keys(c.addressBookIds).length === 0)
      ? { ...c, addressBookIds: defaultBookIds }
      : c;
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
    created: (createdResult as { list: Contact[] }).list,
    updated: (updatedResult as { list: Contact[] }).list,
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
