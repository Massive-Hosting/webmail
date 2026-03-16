/** Email template management UI for settings */

import React, { useState, useCallback } from "react";
import { Plus, Pencil, Trash2, FileText, Save, X } from "lucide-react";
import { useSettingsStore, type EmailTemplate } from "@/stores/settings-store.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const TemplateSettings = React.memo(function TemplateSettings() {
  const { t } = useTranslation();
  const templates = useSettingsStore((s) => s.emailTemplates);
  const addTemplate = useSettingsStore((s) => s.addTemplate);
  const updateTemplate = useSettingsStore((s) => s.updateTemplate);
  const removeTemplate = useSettingsStore((s) => s.removeTemplate);

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);

  const handleNew = useCallback(() => {
    setEditing({ id: "", name: "", subject: "", body: "" });
    setIsNew(true);
  }, []);

  const handleEdit = useCallback((template: EmailTemplate) => {
    setEditing({ ...template });
    setIsNew(false);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      removeTemplate(id);
      toast.success(t("templates.deleted"));
    },
    [removeTemplate, t],
  );

  const handleSave = useCallback(() => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error(t("templates.enterName"));
      return;
    }

    if (isNew) {
      addTemplate({
        name: editing.name,
        subject: editing.subject,
        body: editing.body,
      });
    } else {
      updateTemplate(editing.id, {
        name: editing.name,
        subject: editing.subject,
        body: editing.body,
      });
    }

    toast.success(t("templates.saved"));
    setEditing(null);
    setIsNew(false);
  }, [editing, isNew, addTemplate, updateTemplate, t]);

  const handleCancel = useCallback(() => {
    setEditing(null);
    setIsNew(false);
  }, []);

  const inputStyle = {
    backgroundColor: "var(--color-bg-tertiary)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border-primary)",
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={20} style={{ color: "var(--color-text-accent)" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {t("templates.title")}
          </h2>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-md transition-colors"
          style={{
            backgroundColor: "var(--color-bg-accent)",
            color: "var(--color-text-inverse)",
          }}
        >
          <Plus size={16} />
          {t("templates.newTemplate")}
        </button>
      </div>

      {templates.length === 0 && !editing ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            border: "1px dashed var(--color-border-primary)",
          }}
        >
          <FileText
            size={48}
            strokeWidth={1.5}
            className="mx-auto mb-3"
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("templates.noTemplates")}
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {t("templates.noTemplatesDesc")}
          </p>
        </div>
      ) : (
        !editing && (
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--color-border-primary)" }}
          >
            {templates.map((template, index) => (
              <div
                key={template.id}
                className="flex items-center gap-2 px-3 py-2.5 group"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderBottom:
                    index < templates.length - 1
                      ? "1px solid var(--color-border-secondary)"
                      : undefined,
                }}
              >
                <FileText
                  size={16}
                  style={{ color: "var(--color-text-tertiary)" }}
                />
                <div className="flex-1 min-w-0">
                  <span
                    className="text-sm font-medium truncate block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {template.name}
                  </span>
                  {template.subject && (
                    <span
                      className="text-xs truncate block"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {template.subject}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleEdit(template)}
                  className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-tertiary)] transition-all"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-bg-tertiary)] transition-all"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Edit / New form */}
      {editing && (
        <div
          className="mt-4 rounded-lg p-4 space-y-3"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-primary)",
          }}
        >
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {isNew ? t("templates.newTemplate") : t("templates.editTemplate")}
          </h3>

          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("templates.templateName")}
            </label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) =>
                setEditing((prev) => prev ? { ...prev, name: e.target.value } : prev)
              }
              className="w-full h-8 px-3 text-sm rounded-md outline-none"
              style={inputStyle}
              placeholder={t("templates.namePlaceholder")}
              autoFocus
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("templates.subject")}
            </label>
            <input
              type="text"
              value={editing.subject}
              onChange={(e) =>
                setEditing((prev) => prev ? { ...prev, subject: e.target.value } : prev)
              }
              className="w-full h-8 px-3 text-sm rounded-md outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {t("templates.body")}
            </label>
            <textarea
              value={editing.body}
              onChange={(e) =>
                setEditing((prev) => prev ? { ...prev, body: e.target.value } : prev)
              }
              className="w-full h-40 px-3 py-2 text-sm rounded-md outline-none resize-y font-mono"
              style={inputStyle}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              className="text-sm px-4 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span className="flex items-center gap-1">
                <X size={14} />
                {t("templates.cancel")}
              </span>
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md transition-colors font-medium"
              style={{
                backgroundColor: "var(--color-bg-accent)",
                color: "var(--color-text-inverse)",
              }}
            >
              <Save size={14} />
              {t("templates.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
