/** Contact hooks with TanStack Query */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchContacts,
  fetchContact,
  createContact as apiCreateContact,
  updateContact as apiUpdateContact,
  deleteContact as apiDeleteContact,
  searchContacts,
  fetchAddressBooks,
  createAddressBook as apiCreateAddressBook,
  updateAddressBook as apiUpdateAddressBook,
  deleteAddressBook as apiDeleteAddressBook,
} from "@/api/contacts.ts";
import type { Contact, ContactCreate, ContactUpdate, AddressBook } from "@/types/contacts.ts";
import { useCallback, useMemo, useState, useEffect } from "react";
import { toast } from "sonner";

// ---- Contact list ----

export function useContacts(searchQuery?: string, addressBookId?: string | null) {
  const query = useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  /** Client-side filtered and sorted contacts */
  const filteredContacts = useMemo(() => {
    if (!query.data) return [];
    let contacts = [...query.data];

    // Filter by address book
    if (addressBookId) {
      contacts = contacts.filter((c) => c.addressBookIds[addressBookId]);
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      contacts = contacts.filter((c) => {
        const nameMatch =
          c.name.full?.toLowerCase().includes(q) ||
          c.name.given?.toLowerCase().includes(q) ||
          c.name.surname?.toLowerCase().includes(q);
        const emailMatch = c.emails.some((e) =>
          e.address.toLowerCase().includes(q),
        );
        const orgMatch = c.organization?.name?.toLowerCase().includes(q);
        return nameMatch || emailMatch || orgMatch;
      });
    }

    // Sort alphabetically by display name
    contacts.sort((a, b) => {
      const nameA = getContactDisplayName(a).toLowerCase();
      const nameB = getContactDisplayName(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return contacts;
  }, [query.data, searchQuery, addressBookId]);

  return {
    contacts: filteredContacts,
    allContacts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ---- Single contact ----

export function useContact(contactId: string | null) {
  const query = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => (contactId ? fetchContact(contactId) : null),
    enabled: !!contactId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    contact: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ---- Contact mutations ----

export function useContactMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: apiCreateContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact created");
    },
    onError: (err: Error) => {
      toast.error(`Failed to create contact: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; updates: ContactUpdate }) =>
      apiUpdateContact(params.id, params.updates),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["contacts"] });
      const prev = queryClient.getQueryData<Contact[]>(["contacts"]);

      // Optimistic update
      if (prev) {
        queryClient.setQueryData<Contact[]>(
          ["contacts"],
          prev.map((c) =>
            c.id === params.id ? { ...c, ...params.updates } : c,
          ),
        );
      }

      return { prev };
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["contacts"], context.prev);
      }
      toast.error("Failed to update contact");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: apiDeleteContact,
    onMutate: async (contactId) => {
      await queryClient.cancelQueries({ queryKey: ["contacts"] });
      const prev = queryClient.getQueryData<Contact[]>(["contacts"]);

      // Optimistic remove
      if (prev) {
        queryClient.setQueryData<Contact[]>(
          ["contacts"],
          prev.filter((c) => c.id !== contactId),
        );
      }

      return { prev };
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["contacts"], context.prev);
      }
      toast.error("Failed to delete contact");
    },
    onSuccess: () => {
      toast.success("Contact deleted");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return {
    createContact: useCallback(
      (contact: ContactCreate) => createMutation.mutateAsync(contact),
      [createMutation],
    ),
    updateContact: useCallback(
      (id: string, updates: ContactUpdate) =>
        updateMutation.mutate({ id, updates }),
      [updateMutation],
    ),
    deleteContact: useCallback(
      (id: string) => deleteMutation.mutate(id),
      [deleteMutation],
    ),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ---- Address books ----

export function useAddressBooks() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["addressBooks"],
    queryFn: fetchAddressBooks,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: apiCreateAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addressBooks"] });
      toast.success("Group created");
    },
    onError: () => {
      toast.error("Failed to create group");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; name: string }) =>
      apiUpdateAddressBook(params.id, { name: params.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addressBooks"] });
    },
    onError: () => {
      toast.error("Failed to update group");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: apiDeleteAddressBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addressBooks"] });
      toast.success("Group deleted");
    },
    onError: () => {
      toast.error("Failed to delete group");
    },
  });

  return {
    addressBooks: query.data ?? [],
    isLoading: query.isLoading,
    createAddressBook: useCallback(
      (name: string) => createMutation.mutateAsync(name),
      [createMutation],
    ),
    updateAddressBook: useCallback(
      (id: string, name: string) => updateMutation.mutate({ id, name }),
      [updateMutation],
    ),
    deleteAddressBook: useCallback(
      (id: string) => deleteMutation.mutate(id),
      [deleteMutation],
    ),
  };
}

// ---- Contact search (for autocomplete) ----

export function useContactSearch(query: string, enabled = true) {
  const { allContacts, isLoading: isLoadingAll } = useContacts();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce 200ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Try client-side search first
  const clientResults = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 1) return [];
    const q = debouncedQuery.toLowerCase();
    return allContacts
      .filter((c) => {
        const nameMatch =
          c.name.full?.toLowerCase().includes(q) ||
          c.name.given?.toLowerCase().includes(q) ||
          c.name.surname?.toLowerCase().includes(q);
        const emailMatch = c.emails.some((e) =>
          e.address.toLowerCase().includes(q),
        );
        return nameMatch || emailMatch;
      })
      .slice(0, 10);
  }, [allContacts, debouncedQuery]);

  // Fall back to server search if no client results and query is long enough
  const serverQuery = useQuery({
    queryKey: ["contactSearch", debouncedQuery],
    queryFn: () => searchContacts(debouncedQuery),
    enabled:
      enabled &&
      debouncedQuery.length >= 2 &&
      clientResults.length === 0 &&
      !isLoadingAll,
    staleTime: 30 * 1000,
  });

  // Also search tenant directory (same-domain colleagues)
  const directoryQuery = useQuery({
    queryKey: ["directorySearch", debouncedQuery],
    queryFn: async () => {
      const { searchDirectory } = await import("@/api/availability.ts");
      return searchDirectory(debouncedQuery, 5);
    },
    enabled: enabled && debouncedQuery.length >= 2,
    staleTime: 60 * 1000,
  });

  // Merge: personal contacts first, then directory entries (deduplicated)
  const results = useMemo(() => {
    const personal = clientResults.length > 0 ? clientResults : (serverQuery.data ?? []);
    const directory = directoryQuery.data ?? [];
    if (directory.length === 0) return personal;

    // Deduplicate: collect all emails from personal results
    const personalEmails = new Set(personal.flatMap((c) => c.emails.map((e) => e.address.toLowerCase())));

    // Convert directory entries to Contact-like objects for uniform rendering
    const dirContacts: Contact[] = directory
      .filter((d) => !personalEmails.has(d.email.toLowerCase()))
      .map((d) => ({
        id: `dir-${d.email}`,
        name: { full: d.name },
        emails: [{ address: d.email }],
        phones: [],
        addresses: [],
        urls: [],
        addressBookIds: {},
      }));

    return [...personal, ...dirContacts].slice(0, 15);
  }, [clientResults, serverQuery.data, directoryQuery.data]);

  return {
    results,
    isSearching: serverQuery.isLoading || directoryQuery.isLoading,
  };
}

// ---- Helpers ----

/** Get a display name for a contact */
export function getContactDisplayName(contact: Contact): string {
  if (contact.name.full) return contact.name.full;
  const parts: string[] = [];
  if (contact.name.prefix) parts.push(contact.name.prefix);
  if (contact.name.given) parts.push(contact.name.given);
  if (contact.name.surname) parts.push(contact.name.surname);
  if (contact.name.suffix) parts.push(contact.name.suffix);
  if (parts.length > 0) return parts.join(" ");
  if (contact.emails.length > 0) return contact.emails[0].address;
  return "Unnamed Contact";
}

/** Get initials for a contact avatar */
export function getContactInitials(contact: Contact): string {
  const name = getContactDisplayName(contact);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0]?.toUpperCase() ?? "?";
}

/** Get the first letter for section header */
export function getContactSortLetter(contact: Contact): string {
  const name = getContactDisplayName(contact);
  const first = name[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(first) ? first : "#";
}

// ---- Frequent contacts (localStorage) ----

const FREQUENT_KEY = "frequentContacts";

export function getFrequentContacts(): Array<{ email: string; name?: string; count: number; lastUsed: number }> {
  try {
    const stored = localStorage.getItem(FREQUENT_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return [];
}

export function trackContactUsage(email: string, name?: string): void {
  try {
    const contacts = getFrequentContacts();
    const existing = contacts.find(
      (c) => c.email.toLowerCase() === email.toLowerCase(),
    );
    if (existing) {
      existing.count++;
      existing.lastUsed = Date.now();
      if (name) existing.name = name;
    } else {
      contacts.push({ email, name, count: 1, lastUsed: Date.now() });
    }
    // Keep top 100
    contacts.sort((a, b) => b.count - a.count);
    localStorage.setItem(FREQUENT_KEY, JSON.stringify(contacts.slice(0, 100)));
  } catch {
    // ignore
  }
}
