/** Contact and AddressBook types (JMAP Contacts / JSContact RFC 9553) */

export interface ContactName {
  full?: string;
  given?: string;
  surname?: string;
  prefix?: string;
  suffix?: string;
}

export interface ContactEmail {
  address: string;
  label?: string;
  isDefault?: boolean;
}

export interface ContactPhone {
  number: string;
  label?: string;
}

export interface ContactAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  label?: string;
}

export interface ContactOrganization {
  name?: string;
  department?: string;
  title?: string;
}

export interface ContactUrl {
  url: string;
  label?: string;
}

export interface Contact {
  id: string;
  name: ContactName;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  organization?: ContactOrganization;
  notes?: string;
  avatar?: { blobId?: string };
  birthday?: string;
  urls: ContactUrl[];
  addressBookIds: Record<string, boolean>;
}

export interface AddressBook {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Contact data for create/update (without id) */
export type ContactCreate = Omit<Contact, "id">;

/** Partial contact data for updates */
export type ContactUpdate = Partial<ContactCreate>;

/** Frequently contacted entry stored in localStorage */
export interface FrequentContact {
  email: string;
  name?: string;
  count: number;
  lastUsed: number;
}
