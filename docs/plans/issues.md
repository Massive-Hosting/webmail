# Issue Tracker — March 16, 2026

## Batch 1: Mail UX (Agent A)

### 1. Thread child visual distinction
Expanded conversation children are hard to distinguish from standalone messages. Add a subtle left accent bar or indentation + lighter background to make the hierarchy clear.

### 2. Thread parent click behavior
Clicking the parent/top message in a conversation should:
- If thread is collapsed: expand it and select the latest message
- If thread is expanded AND a child is selected: select the parent message and show it in the reading pane (NOT collapse)
- If thread is expanded AND the parent is already selected: collapse the thread
Currently clicking the parent always toggles expand/collapse regardless of selection state.

### 3. Multi-select must work for ALL messages including thread items
Shift+Click and Ctrl+Click only work for standalone messages, not for thread parents or children. Fix handleItemClick routing for all message types.

### 4. Remove checkmark avatar on multi-select
When multiple messages are selected, just change the background color — don't replace the avatar with a blue checkmark circle.

### 5. AI reply whitespace before signature
AI-generated replies still leave too much gap before the signature. Ensure the HTML conversion produces tight paragraphs with no trailing empty elements.

## Batch 2: Compose & Contacts (Agent B)

### 6. Contact email button does nothing
Clicking the email icon/button on a contact in the contact detail view should open compose with that contact's email pre-filled as recipient.

### 7. Signature preview — remove for rich text
The signature preview section below the editor is redundant in rich text mode (it shows the same thing). Remove it for rich text, keep only for plain text mode.

### 8. Insert signature button in compose
Add a button next to the From: dropdown to re-insert the signature if the user deleted it. The button should insert the current identity's signature at the cursor position or before the quoted text.

### 9. Image resize handles in compose editor
When an image is inserted into the compose body (or signature), it should be resizable via drag handles. Tiptap supports this via the `@tiptap/extension-image` resize option or a resize wrapper.

## Batch 3: Calendar & Navigation (Agent C)

### 10. Month view day click → create event (not day view)
Clicking a day in month view currently switches to day view. Instead it should open the create event dialog pre-filled with that date, like week and day view do.

### 11. Event edit dialog — larger with day timeline
The event edit dialog should be wider (~900px) with a right pane showing an hour-view timeline for the event's day. The event should be draggable within this timeline (drag to move start time, drag handles on top/bottom to resize duration).

### 12. Remove settings icon from activity bar bottom
The settings cog in the lower-left activity bar is redundant — settings is already in the avatar dropdown (upper right). Remove it.

### 13. Activity bar icons — more colorful
The Mail/Contacts/Calendar icons in the left activity bar should be more visually distinctive. Use filled variants or colored icons that work in both light and dark modes.

### 14. User avatar initials source
The initials show "IN" from the email local part "info@...". The display name should come from the JMAP Identity name field (which is editable in Settings → Signatures). If the user sets their identity name to "Edvin Syse", the avatar should show "ES". Currently the auth store display name isn't populated from identities.
