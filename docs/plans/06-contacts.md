# Phase 5 — Contacts

## Goal

Full contact management integrated with the compose experience. Contacts are stored in Stalwart via JMAP Contacts, providing a unified address book across all devices (IMAP clients, mobile, webmail).

## Prerequisites

- Phase 3 (Compose & Attachments) complete

## JMAP Contacts Overview

Stalwart supports the JMAP Contacts specification. Key types:

- **ContactCard**: A contact with name, emails, phones, addresses, notes, avatar
- **AddressBook**: A collection of contacts (default + custom groups)

JMAP capabilities: `urn:ietf:params:jmap:contacts`

## Contact List View

Navigation: Click "Contacts" in sidebar (below Mail, above Calendar).

```
+----------+------------------------+----------------------------+
| Sidebar  | Contact List           | Contact Detail             |
|          |                        |                            |
| Mail     | [Search contacts    ]  | [Avatar]                   |
| Contacts | +--------------------+ | Alice Johnson              |
| Calendar | | A                  | | alice@example.com          |
|          | |   Alice Johnson    | |                            |
|          | |   alice@example..  | | Email                      |
|          | | B                  | |   alice@example.com (work) |
|          | |   Bob Smith        | |   alice@personal.com       |
|          | |   bob@company.com  | |                            |
|          | | D                  | | Phone                      |
|          | |   Diana Lee        | |   +1 555-0123 (mobile)     |
|          | +--------------------+ |                            |
|          |                        | Organization               |
|          | 42 contacts            |   Acme Corp, Engineering   |
|          |                        |                            |
|          |                        | Notes                      |
|          |                        |   Met at conference 2025   |
|          |                        |                            |
|          |                        | [Edit] [Email] [Delete]    |
+----------+------------------------+----------------------------+
```

**Contact list features:**
- Alphabetical section headers (A, B, C...)
- Virtualized scroll for large contact lists
- Search bar filters by name and email (client-side for cached contacts, JMAP query for uncached)
- Avatar (initials circle with consistent color hash, or uploaded photo)
- Click to view detail in right pane
- Bulk select for batch delete or group assignment

## Tasks

### 5.1 — Contact JMAP Integration

API layer for JMAP Contact operations.

**Methods used:**
- `ContactCard/get` — fetch contacts with all properties
- `ContactCard/query` — search/filter contacts
- `ContactCard/set` — create, update, delete contacts
- `AddressBook/get` — list address books
- `AddressBook/set` — create, update, delete address books

**Contact properties:**
```typescript
interface Contact {
  id: string;
  name: {
    full?: string;
    given?: string;
    surname?: string;
    prefix?: string;
    suffix?: string;
  };
  emails: Array<{ address: string; label?: string; isDefault?: boolean }>;
  phones: Array<{ number: string; label?: string }>;
  addresses: Array<{
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    label?: string;
  }>;
  organization?: { name?: string; department?: string; title?: string };
  notes?: string;
  avatar?: { blobId?: string }; // uploaded photo
  birthday?: string; // date
  urls: Array<{ url: string; label?: string }>;
  addressBookIds: Record<string, boolean>;
}
```

**Acceptance Criteria:**
- [ ] Full CRUD for contacts via JMAP
- [ ] Contact query with text filter (search by name/email)
- [ ] Contact changes sync via WebSocket (delta sync with ContactCard/changes)
- [ ] Proper error handling for JMAP errors
- [ ] TanStack Query integration with optimistic updates

### 5.2 — Contact List Component

Virtualized, searchable contact list.

**Acceptance Criteria:**
- [ ] Contacts displayed alphabetically with section headers
- [ ] Virtualized scroll handles 10,000+ contacts at 60fps
- [ ] Search filters contacts by name and email (debounced 200ms)
- [ ] Avatar shows initials with deterministic color (hash of email)
- [ ] Click selects contact and shows detail view
- [ ] Multi-select with checkboxes for bulk operations
- [ ] Right-click context menu: Edit, Delete, Compose email, Add to group
- [ ] Empty state with "Add your first contact" prompt
- [ ] Keyboard: arrow keys navigate, Enter selects, / focuses search

### 5.3 — Contact Detail & Edit

View and edit contact information.

**Detail view:**
- All contact fields displayed in organized sections
- Click email to compose new message to that contact
- Click phone to copy to clipboard
- Click URL to open in new tab
- Edit button opens edit form
- Delete button with confirmation dialog

**Edit form:**
- Inline edit (detail view transforms into form)
- Add/remove multiple emails, phones, addresses
- Each field has a label dropdown (Work, Home, Other)
- Avatar upload (image cropper for square crop)
- Save: JMAP `ContactCard/set` update
- Cancel: revert to detail view

**Acceptance Criteria:**
- [ ] All contact fields displayed in organized sections
- [ ] Clickable emails, phones (copy), URLs (open)
- [ ] Edit form with add/remove for multi-value fields
- [ ] Label selection per field (Work, Home, Other, custom)
- [ ] Avatar upload with image preview
- [ ] Save validates required fields (at least name or email)
- [ ] Optimistic update on save
- [ ] Delete with confirmation, removes from list immediately

### 5.4 — Contact Groups (Address Books)

Support for organizing contacts into groups.

**Features:**
- Default "All Contacts" group (all contacts regardless of address book)
- Create custom groups (JMAP AddressBook)
- Add/remove contacts from groups
- Groups shown in contact sidebar
- Group selection filters the contact list

**Acceptance Criteria:**
- [ ] "All Contacts" shows all contacts across all address books
- [ ] Custom groups can be created, renamed, deleted
- [ ] Contacts can belong to multiple groups
- [ ] Group membership editable from contact detail and via drag-drop
- [ ] Group contact count displayed
- [ ] Delete group does not delete contacts (only removes membership)

### 5.5 — Contact Autocomplete in Compose

Integrate contact search into the compose recipient fields (To/Cc/Bcc).

**Data sources (in priority order):**
1. Frequently contacted (tracked in localStorage: `{email: string, count: number, lastUsed: Date}`)
2. JMAP Contacts (via ContactCard/query)
3. Recently received from (extracted from cached emails)

**Behavior:**
- Show suggestions after 1 character typed
- Merge results from all sources, deduplicate by email
- Show contact name + email + avatar in dropdown
- Selecting a contact adds email chip with display name
- If contact has multiple emails, show sub-menu to pick which one
- "Create contact" option at bottom of dropdown for unknown addresses

**Performance:**
- Contact list cached in TanStack Query (full load on app start for small lists, paginated for large)
- Autocomplete search runs locally against cache first, falls back to JMAP query
- Target: suggestions appear within 100ms

**Acceptance Criteria:**
- [ ] Autocomplete works in To, Cc, and Bcc fields
- [ ] Results from all three sources merged and deduplicated
- [ ] Frequently contacted appear first (no typing needed, show on focus)
- [ ] Results show within 100ms for cached contacts
- [ ] Multi-email contacts show sub-menu
- [ ] "Create contact" option for new addresses
- [ ] Send to contact updates the frequency counter
- [ ] Works with keyboard navigation (arrow keys + Enter)

### 5.6 — Import/Export Contacts

**Import:**
- Accept .vcf (vCard) files via file picker or drag-and-drop
- Parse vCard, display preview of contacts to import
- Duplicate detection: warn if email already exists in contacts
- Import via JMAP ContactCard/set create (batched)
- Temporal workflow for large imports (>100 contacts) with progress

**Export:**
- Export all contacts or selected contacts as .vcf file
- Single vCard file with all contacts (vCard 4.0 format)
- Download via browser

**Acceptance Criteria:**
- [ ] Import .vcf files (vCard 3.0 and 4.0)
- [ ] Preview contacts before importing
- [ ] Duplicate warning for existing emails
- [ ] Large imports (>100) use Temporal with progress bar
- [ ] Export produces valid vCard 4.0
- [ ] Export respects current selection/filter
