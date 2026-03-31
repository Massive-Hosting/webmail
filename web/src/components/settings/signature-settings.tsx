/** Signature settings — edit per-identity signatures via JMAP Identity/set */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchIdentities, jmapRequest } from "@/api/mail.ts";
import type { Identity } from "@/types/mail.ts";
import { Loader2, Check, AlertCircle, PenLine, ImagePlus } from "lucide-react";
import { StyledSelect } from "@/components/ui/styled-select.tsx";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/auth-store.ts";

export const SignatureSettings = React.memo(function SignatureSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const loginEmail = useAuthStore((s) => s.email);
  const { data: identities, isLoading } = useQuery({
    queryKey: ["identities"],
    queryFn: fetchIdentities,
    staleTime: 5 * 60 * 1000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first identity
  useEffect(() => {
    if (!selectedId && identities && identities.length > 0) {
      setSelectedId(identities[0].id);
    }
  }, [selectedId, identities]);

  const selectedIdentity = identities?.find((i) => i.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2
          size={20}
          className="animate-spin text-tertiary"
        />
      </div>
    );
  }

  if (!identities || identities.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-tertiary">
          {t("signatures.noIdentities")}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Identity selector */}
      {identities.length > 1 && (
        <div>
          <label className="text-xs font-medium block mb-1.5 text-secondary">
            {t("signatures.identity")}
          </label>
          <StyledSelect
            value={selectedId ?? ""}
            onValueChange={setSelectedId}
            options={identities.map((id) => {
              const isPrimary = id.email.toLowerCase() === loginEmail.toLowerCase();
              return {
                value: id.id,
                label: isPrimary
                  ? `${id.name} <${id.email}> ★`
                  : `${id.name} <${id.email}>`,
              };
            })}
            className="w-full"
          />
          <p className="text-xs mt-1 text-tertiary">
            {t("signatures.primaryHint", { defaultValue: "★ marks the identity shown in your avatar" })}
          </p>
        </div>
      )}

      {/* Signature editor for selected identity */}
      {selectedIdentity && (
        <SignatureEditor
          key={selectedIdentity.id}
          identity={selectedIdentity}
        />
      )}
    </div>
  );
});

function SignatureEditor({ identity }: { identity: Identity }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(identity.name ?? "");
  const [htmlSig, setHtmlSig] = useState(identity.htmlSignature ?? "");
  const [textSig, setTextSig] = useState(identity.textSignature ?? "");
  const [mode, setMode] = useState<"html" | "text">("html");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const response = await fetch("/api/blob/upload", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const results = await response.json();
      const blobId = Array.isArray(results) ? results[0]?.blobId : results.blobId;
      if (!blobId) throw new Error("No blobId");

      const imgTag = `<img src="/api/blob/${blobId}/inline" alt="Logo" style="max-height: 80px; max-width: 200px;">`;

      // Insert at cursor in contentEditable, or append
      if (editorRef.current) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const temp = document.createElement("div");
          temp.innerHTML = imgTag;
          const frag = document.createDocumentFragment();
          while (temp.firstChild) frag.appendChild(temp.firstChild);
          range.insertNode(frag);
          range.collapse(false);
        } else {
          editorRef.current.innerHTML += imgTag;
        }
        setHtmlSig(editorRef.current.innerHTML);
      } else {
        setHtmlSig((prev) => prev + imgTag);
      }
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setUploading(false);
    }
  }, []);

  const saveMutation = useMutation({
    mutationFn: async ({
      name,
      htmlSignature,
      textSignature,
    }: {
      name: string;
      htmlSignature: string;
      textSignature: string;
    }) => {
      await jmapRequest({
        using: [
          "urn:ietf:params:jmap:core",
          "urn:ietf:params:jmap:mail",
          "urn:ietf:params:jmap:submission",
        ],
        methodCalls: [
          [
            "Identity/set",
            {
              update: {
                [identity.id]: {
                  name,
                  htmlSignature,
                  textSignature,
                },
              },
            },
            "s0",
          ],
        ],
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["identities"] });
      // Update the avatar display name if this is the primary identity
      const authState = useAuthStore.getState();
      if (identity.email.toLowerCase() === authState.email.toLowerCase()) {
        authState.setDisplayName(variables.name);
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const handleSave = useCallback(() => {
    setSaveStatus("saving");
    saveMutation.mutate({
      name: displayName,
      htmlSignature: htmlSig,
      textSignature: textSig,
    });
  }, [displayName, htmlSig, textSig, saveMutation]);

  return (
    <div className="space-y-3">
      {/* Display name */}
      <div>
        <label className="text-xs font-medium block mb-1.5 text-secondary">
          {t("signatures.displayName")}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={identity.email}
          className="w-full h-9 px-3 text-sm rounded-md outline-none transition-colors bg-primary text-primary border-primary"
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-primary)";
          }}
        />
        <p className="text-xs mt-1 text-tertiary">
          {t("signatures.displayNameHint")}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine size={14} className="text-secondary" />
          <h3 className="text-sm font-medium text-primary">
            {t("signatures.signatureFor", { email: identity.email })}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md overflow-hidden border-primary">
            <button
              onClick={() => setMode("html")}
              className="px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor:
                  mode === "html"
                    ? "var(--color-bg-accent)"
                    : "var(--color-bg-primary)",
                color:
                  mode === "html"
                    ? "var(--color-text-inverse)"
                    : "var(--color-text-secondary)",
              }}
            >
              {t("signatures.richText")}
            </button>
            <button
              onClick={() => setMode("text")}
              className="px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor:
                  mode === "text"
                    ? "var(--color-bg-accent)"
                    : "var(--color-bg-primary)",
                color:
                  mode === "text"
                    ? "var(--color-text-inverse)"
                    : "var(--color-text-secondary)",
                borderLeft: "1px solid var(--color-border-primary)",
              }}
            >
              {t("signatures.plainText")}
            </button>
          </div>
          {mode === "html" && (
            <>
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors bg-primary text-secondary border-primary"
                style={{ opacity: uploading ? 0.6 : 1 }}
                title={t("signatures.insertImage")}
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                {t("signatures.insertImage")}
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Editor area */}
      {mode === "html" ? (
        <div
          ref={editorRef}
          className="min-h-[120px] rounded-md p-3 text-sm outline-none bg-primary text-primary border-primary"
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: htmlSig }}
          onBlur={(e) => setHtmlSig(e.currentTarget.innerHTML)}
        />
      ) : (
        <textarea
          value={textSig}
          onChange={(e) => setTextSig(e.target.value)}
          rows={5}
          className="w-full rounded-md p-3 text-sm outline-none resize-y bg-primary text-primary border-primary font-mono"
          placeholder={t("signatures.plainTextPlaceholder")}
        />
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors bg-accent text-inverse"
          style={{ opacity: saveStatus === "saving" ? 0.7 : 1 }}
        >
          {saveStatus === "saving" && (
            <Loader2 size={14} className="animate-spin" />
          )}
          {saveStatus === "saved" && <Check size={14} />}
          {saveStatus === "saving"
            ? t("signatures.saving")
            : saveStatus === "saved"
              ? t("signatures.saved")
              : t("signatures.saveSignature")}
        </button>
        {saveStatus === "error" && (
          <span className="flex items-center gap-1 text-xs text-danger">
            <AlertCircle size={12} />
            {t("signatures.failedToSave")}
          </span>
        )}
      </div>

      {/* Live preview — only for plain text mode (rich text editor already shows the rendered signature) */}
      {mode === "text" && textSig && (
        <div>
          <label className="text-xs font-medium block mb-1.5 text-secondary">
            {t("signatures.preview")}
          </label>
          <div className="rounded-md p-4 text-sm bg-primary border-primary text-primary">
            <div className="border-t-secondary" style={{ paddingTop: 12 }}>
              <p className="text-tertiary" style={{ margin: "0 0 4px 0", fontSize: 13 }}>-- </p>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", margin: 0, fontSize: 13 }}>{textSig}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
