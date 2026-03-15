/** Signature settings — edit per-identity signatures via JMAP Identity/set */

import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchIdentities, jmapRequest } from "@/api/mail.ts";
import type { Identity } from "@/types/mail.ts";
import { Loader2, Check, AlertCircle, PenLine } from "lucide-react";

export const SignatureSettings = React.memo(function SignatureSettings() {
  const queryClient = useQueryClient();
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
          className="animate-spin"
          style={{ color: "var(--color-text-tertiary)" }}
        />
      </div>
    );
  }

  if (!identities || identities.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
          No email identities found.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Identity selector */}
      {identities.length > 1 && (
        <div>
          <label
            className="text-xs font-medium block mb-1.5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Identity
          </label>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md outline-none"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-primary)",
            }}
          >
            {identities.map((id) => (
              <option key={id.id} value={id.id}>
                {id.name} &lt;{id.email}&gt;
              </option>
            ))}
          </select>
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
  const queryClient = useQueryClient();
  const [htmlSig, setHtmlSig] = useState(identity.htmlSignature ?? "");
  const [textSig, setTextSig] = useState(identity.textSignature ?? "");
  const [mode, setMode] = useState<"html" | "text">("html");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saveMutation = useMutation({
    mutationFn: async ({
      htmlSignature,
      textSignature,
    }: {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities"] });
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
      htmlSignature: htmlSig,
      textSignature: textSig,
    });
  }, [htmlSig, textSig, saveMutation]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine size={14} style={{ color: "var(--color-text-secondary)" }} />
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Signature for {identity.email}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex rounded-md overflow-hidden"
            style={{ border: "1px solid var(--color-border-primary)" }}
          >
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
              Rich text
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
              Plain text
            </button>
          </div>
        </div>
      </div>

      {/* Editor area */}
      {mode === "html" ? (
        <div
          className="min-h-[120px] rounded-md p-3 text-sm outline-none"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-primary)",
          }}
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
          className="w-full rounded-md p-3 text-sm outline-none resize-y"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-primary)",
            fontFamily: "monospace",
          }}
          placeholder="Your plain text signature..."
        />
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors"
          style={{
            backgroundColor: "var(--color-bg-accent)",
            color: "var(--color-text-inverse)",
            opacity: saveStatus === "saving" ? 0.7 : 1,
          }}
        >
          {saveStatus === "saving" && (
            <Loader2 size={14} className="animate-spin" />
          )}
          {saveStatus === "saved" && <Check size={14} />}
          {saveStatus === "saving"
            ? "Saving..."
            : saveStatus === "saved"
              ? "Saved"
              : "Save signature"}
        </button>
        {saveStatus === "error" && (
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: "var(--color-text-danger)" }}
          >
            <AlertCircle size={12} />
            Failed to save
          </span>
        )}
      </div>
    </div>
  );
}
