/** Filter rules management UI with drag-to-reorder */

import React, { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Trash2,
  Plus,
  X,
  Save,
  Filter,
} from "lucide-react";
import { useFilterRules } from "@/hooks/use-filter-rules.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import {
  type FilterRule,
  type FilterCondition,
  type FilterAction,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  ACTION_TYPES,
  actionNeedsValue,
  createEmptyRule,
} from "@/types/filter-rules.ts";

/** Main filter rules panel */
export const FilterRulesPanel = React.memo(function FilterRulesPanel() {
  const { rules, isLoading, saveRules, isSaving } = useFilterRules();
  const [localRules, setLocalRules] = useState<FilterRule[] | null>(null);
  const [editingRule, setEditingRule] = useState<FilterRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Use local state if user has made changes, otherwise use server state
  const activeRules = localRules ?? rules;

  // Sync local state from server when rules load
  React.useEffect(() => {
    if (rules.length > 0 && localRules === null) {
      setLocalRules(null); // Use server rules directly
    }
  }, [rules, localRules]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const current = localRules ?? rules;
      const oldIndex = current.findIndex((r) => r.id === active.id);
      const newIndex = current.findIndex((r) => r.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(current, oldIndex, newIndex).map((r, i) => ({
        ...r,
        order: i,
      }));
      setLocalRules(reordered);
      saveRules(reordered);
    },
    [localRules, rules, saveRules],
  );

  const handleToggleEnabled = useCallback(
    (ruleId: string) => {
      const current = localRules ?? rules;
      const updated = current.map((r) =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
      );
      setLocalRules(updated);
      saveRules(updated);
    },
    [localRules, rules, saveRules],
  );

  const handleDeleteRule = useCallback(
    (ruleId: string) => {
      const current = localRules ?? rules;
      const updated = current
        .filter((r) => r.id !== ruleId)
        .map((r, i) => ({ ...r, order: i }));
      setLocalRules(updated);
      saveRules(updated);
    },
    [localRules, rules, saveRules],
  );

  const handleAddRule = useCallback(() => {
    const current = localRules ?? rules;
    const newRule = createEmptyRule(current.length);
    setEditingRule(newRule);
    setShowEditor(true);
  }, [localRules, rules]);

  const handleEditRule = useCallback((rule: FilterRule) => {
    setEditingRule({ ...rule });
    setShowEditor(true);
  }, []);

  const handleSaveRule = useCallback(
    (rule: FilterRule) => {
      const current = localRules ?? rules;
      const existingIdx = current.findIndex((r) => r.id === rule.id);
      let updated: FilterRule[];
      if (existingIdx >= 0) {
        updated = current.map((r) => (r.id === rule.id ? rule : r));
      } else {
        updated = [...current, rule];
      }
      setLocalRules(updated);
      saveRules(updated);
      setShowEditor(false);
      setEditingRule(null);
    },
    [localRules, rules, saveRules],
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          Loading filter rules...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={20} style={{ color: "var(--color-text-accent)" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Filter Rules
          </h2>
        </div>
        <button
          onClick={handleAddRule}
          className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-md transition-colors"
          style={{
            backgroundColor: "var(--color-bg-accent)",
            color: "var(--color-text-inverse)",
          }}
        >
          <Plus size={16} />
          New Rule
        </button>
      </div>

      <p
        className="text-sm mb-4"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Filter rules automatically process incoming email. Drag to reorder — rules are
        evaluated top to bottom.
      </p>

      {activeRules.length === 0 ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            border: "1px dashed var(--color-border-primary)",
          }}
        >
          <Filter
            size={48}
            strokeWidth={1.5}
            className="mx-auto mb-3"
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            No filter rules
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Create a rule to automatically organize incoming mail.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeRules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: "1px solid var(--color-border-primary)",
              }}
            >
              {activeRules.map((rule, index) => (
                <SortableRuleItem
                  key={rule.id}
                  rule={rule}
                  index={index}
                  onToggleEnabled={handleToggleEnabled}
                  onEdit={handleEditRule}
                  onDelete={handleDeleteRule}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Rule editor dialog */}
      {editingRule && (
        <RuleEditorDialog
          open={showEditor}
          onOpenChange={(open) => {
            setShowEditor(open);
            if (!open) setEditingRule(null);
          }}
          rule={editingRule}
          onSave={handleSaveRule}
        />
      )}
    </div>
  );
});

/** Sortable rule list item */
function SortableRuleItem({
  rule,
  index,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  rule: FilterRule;
  index: number;
  onToggleEnabled: (id: string) => void;
  onEdit: (rule: FilterRule) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const actionSummary = rule.actions
    .map((a) => {
      const actionLabel =
        ACTION_TYPES.find((at) => at.value === a.type)?.label ?? a.type;
      return a.value ? `${actionLabel}: ${a.value}` : actionLabel;
    })
    .join(", ");

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: "var(--color-bg-primary)",
        borderBottom:
          index < 100 ? "1px solid var(--color-border-secondary)" : undefined,
      }}
      className="flex items-center gap-2 px-3 py-2.5 group"
    >
      {/* Drag handle */}
      <button
        className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-[var(--color-bg-tertiary)] transition-colors"
        style={{ color: "var(--color-text-tertiary)", touchAction: "none" }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      {/* Rule info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium truncate"
            style={{
              color: rule.enabled
                ? "var(--color-text-primary)"
                : "var(--color-text-tertiary)",
            }}
          >
            {index + 1}. {rule.name}
          </span>
        </div>
        <p
          className="text-xs truncate"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {actionSummary}
        </p>
      </div>

      {/* Toggle */}
      <Switch.Root
        checked={rule.enabled}
        onCheckedChange={() => onToggleEnabled(rule.id)}
        className="w-9 h-5 rounded-full relative transition-colors"
        style={{
          backgroundColor: rule.enabled
            ? "var(--color-bg-accent)"
            : "var(--color-bg-tertiary)",
        }}
      >
        <Switch.Thumb
          className="block w-4 h-4 rounded-full transition-transform"
          style={{
            backgroundColor: "white",
            transform: rule.enabled ? "translateX(17px)" : "translateX(2px)",
          }}
        />
      </Switch.Root>

      {/* Edit */}
      <button
        onClick={() => onEdit(rule)}
        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-tertiary)] transition-all"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <Pencil size={14} />
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(rule.id)}
        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-tertiary)] transition-all"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** Rule editor dialog */
function RuleEditorDialog({
  open,
  onOpenChange,
  rule,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: FilterRule;
  onSave: (rule: FilterRule) => void;
}) {
  const [localRule, setLocalRule] = useState<FilterRule>({ ...rule });
  const { sortedMailboxes } = useMailboxes();

  const inputStyle = {
    backgroundColor: "var(--color-bg-tertiary)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border-primary)",
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSave(localRule);
    },
    [localRule, onSave],
  );

  const updateCondition = useCallback(
    (index: number, updates: Partial<FilterCondition>) => {
      setLocalRule((prev) => ({
        ...prev,
        conditions: prev.conditions.map((c, i) =>
          i === index ? { ...c, ...updates } : c,
        ),
      }));
    },
    [],
  );

  const addCondition = useCallback(() => {
    setLocalRule((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { field: "from" as const, operator: "contains" as const, value: "" },
      ],
    }));
  }, []);

  const removeCondition = useCallback((index: number) => {
    setLocalRule((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  }, []);

  const updateAction = useCallback(
    (index: number, updates: Partial<FilterAction>) => {
      setLocalRule((prev) => ({
        ...prev,
        actions: prev.actions.map((a, i) =>
          i === index ? { ...a, ...updates } : a,
        ),
      }));
    },
    [],
  );

  const addAction = useCallback(() => {
    setLocalRule((prev) => ({
      ...prev,
      actions: [
        ...prev.actions,
        { type: "moveTo" as const, value: "" },
      ],
    }));
  }, []);

  const removeAction = useCallback((index: number) => {
    setLocalRule((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-xl)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {rule.name === "New Rule" ? "Create Rule" : `Edit Rule: "${rule.name}"`}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rule name */}
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Rule name
              </label>
              <input
                type="text"
                value={localRule.name}
                onChange={(e) =>
                  setLocalRule((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full h-8 px-3 text-sm rounded-md outline-none"
                style={inputStyle}
                placeholder="e.g., Newsletters to Archive"
              />
            </div>

            {/* Conditions */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  When
                </span>
                <select
                  value={localRule.conditionMatch}
                  onChange={(e) =>
                    setLocalRule((prev) => ({
                      ...prev,
                      conditionMatch: e.target.value as "all" | "any",
                    }))
                  }
                  className="h-7 px-2 text-sm rounded outline-none"
                  style={inputStyle}
                >
                  <option value="all">all</option>
                  <option value="any">any</option>
                </select>
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  of these conditions are met:
                </span>
              </div>

              <div className="space-y-2">
                {localRule.conditions.map((condition, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={condition.field}
                      onChange={(e) =>
                        updateCondition(index, {
                          field: e.target.value as FilterCondition["field"],
                        })
                      }
                      className="h-8 px-2 text-sm rounded-md outline-none"
                      style={inputStyle}
                    >
                      {CONDITION_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={condition.operator}
                      onChange={(e) =>
                        updateCondition(index, {
                          operator: e.target.value as FilterCondition["operator"],
                        })
                      }
                      className="h-8 px-2 text-sm rounded-md outline-none"
                      style={inputStyle}
                    >
                      {CONDITION_OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={condition.value}
                      onChange={(e) =>
                        updateCondition(index, { value: e.target.value })
                      }
                      className="flex-1 h-8 px-3 text-sm rounded-md outline-none min-w-0"
                      style={inputStyle}
                      placeholder="Value"
                    />
                    <button
                      type="button"
                      onClick={() => removeCondition(index)}
                      className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors shrink-0"
                      style={{ color: "var(--color-text-tertiary)" }}
                      disabled={localRule.conditions.length <= 1}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addCondition}
                className="flex items-center gap-1 mt-2 text-xs px-2 py-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-accent)" }}
              >
                <Plus size={12} />
                Add condition
              </button>
            </div>

            {/* Actions */}
            <div>
              <p
                className="text-sm font-medium mb-2"
                style={{ color: "var(--color-text-primary)" }}
              >
                Do the following:
              </p>

              <div className="space-y-2">
                {localRule.actions.map((action, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={action.type}
                      onChange={(e) =>
                        updateAction(index, {
                          type: e.target.value as FilterAction["type"],
                          value: actionNeedsValue(
                            e.target.value as FilterAction["type"],
                          )
                            ? action.value
                            : undefined,
                        })
                      }
                      className="h-8 px-2 text-sm rounded-md outline-none"
                      style={inputStyle}
                    >
                      {ACTION_TYPES.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>

                    {actionNeedsValue(action.type) && (
                      <>
                        {(action.type === "moveTo" || action.type === "copyTo") ? (
                          <select
                            value={action.value ?? ""}
                            onChange={(e) =>
                              updateAction(index, { value: e.target.value })
                            }
                            className="flex-1 h-8 px-2 text-sm rounded-md outline-none"
                            style={inputStyle}
                          >
                            <option value="">Select mailbox...</option>
                            {sortedMailboxes.map((mb) => (
                              <option key={mb.id} value={mb.name}>
                                {mb.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={action.value ?? ""}
                            onChange={(e) =>
                              updateAction(index, { value: e.target.value })
                            }
                            className="flex-1 h-8 px-3 text-sm rounded-md outline-none min-w-0"
                            style={inputStyle}
                            placeholder={
                              action.type === "forward"
                                ? "Email address"
                                : "Value"
                            }
                          />
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => removeAction(index)}
                      className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors shrink-0"
                      style={{ color: "var(--color-text-tertiary)" }}
                      disabled={localRule.actions.length <= 1}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addAction}
                className="flex items-center gap-1 mt-2 text-xs px-2 py-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
                style={{ color: "var(--color-text-accent)" }}
              >
                <Plus size={12} />
                Add action
              </button>
            </div>

            {/* Submit */}
            <div
              className="flex items-center justify-end gap-2 pt-3"
              style={{ borderTop: "1px solid var(--color-border-secondary)" }}
            >
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="text-sm px-4 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md transition-colors font-medium"
                style={{
                  backgroundColor: "var(--color-bg-accent)",
                  color: "var(--color-text-inverse)",
                }}
              >
                <Save size={14} />
                Save
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
