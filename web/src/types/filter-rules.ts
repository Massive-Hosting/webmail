/** Filter rule types for Sieve-based server-side filtering */

export interface FilterRule {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  conditions: FilterCondition[];
  conditionMatch: "all" | "any";
  actions: FilterAction[];
}

export interface FilterCondition {
  field: "from" | "to" | "cc" | "subject" | "body" | "size" | "hasAttachment";
  operator:
    | "contains"
    | "equals"
    | "startsWith"
    | "endsWith"
    | "regex"
    | "greaterThan"
    | "lessThan";
  value: string;
}

export interface FilterAction {
  type: "moveTo" | "copyTo" | "markRead" | "star" | "forward" | "delete" | "reject";
  value?: string;
}

export const CONDITION_FIELDS: { value: FilterCondition["field"]; label: string }[] = [
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "cc", label: "CC" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
  { value: "size", label: "Size" },
  { value: "hasAttachment", label: "Has Attachment" },
];

export const CONDITION_OPERATORS: { value: FilterCondition["operator"]; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "regex", label: "matches regex" },
  { value: "greaterThan", label: "greater than" },
  { value: "lessThan", label: "less than" },
];

export const ACTION_TYPES: { value: FilterAction["type"]; label: string }[] = [
  { value: "moveTo", label: "Move to" },
  { value: "copyTo", label: "Copy to" },
  { value: "markRead", label: "Mark as read" },
  { value: "star", label: "Star" },
  { value: "forward", label: "Forward to" },
  { value: "delete", label: "Delete" },
  { value: "reject", label: "Reject" },
];

/** Check if an action type requires a value */
export function actionNeedsValue(type: FilterAction["type"]): boolean {
  return type === "moveTo" || type === "copyTo" || type === "forward";
}

/** Create a new empty filter rule */
export function createEmptyRule(order: number): FilterRule {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "New Rule",
    enabled: true,
    order,
    conditions: [
      { field: "from", operator: "contains", value: "" },
    ],
    conditionMatch: "all",
    actions: [
      { type: "moveTo", value: "" },
    ],
  };
}
