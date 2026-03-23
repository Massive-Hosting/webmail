/** Tiptap rich text editor for compose */

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Plugin that renders a persistent highlight decoration for the AI edit selection */
const aiHighlightKey = new PluginKey("aiHighlight");
const AiSelectionHighlight = Extension.create({
  name: "aiSelectionHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: aiHighlightKey,
        state: {
          init() { return DecorationSet.empty; },
          apply(tr, set) {
            const meta = tr.getMeta(aiHighlightKey);
            if (meta?.clear) return DecorationSet.empty;
            if (meta?.from != null && meta?.to != null) {
              const deco = Decoration.inline(meta.from, meta.to, {
                style: "background-color: rgba(99, 102, 241, 0.15); border-radius: 2px;",
              });
              return DecorationSet.create(tr.doc, [deco]);
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) { return aiHighlightKey.getState(state); },
        },
      }),
    ];
  },
});

/** Custom FontSize extension — adds fontSize attribute to TextStyle */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => element.style.fontSize || null,
          renderHTML: (attributes) => {
            if (!attributes.fontSize) return {};
            return { style: `font-size: ${attributes.fontSize}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: any }) => {
        return chain().setMark("textStyle", { fontSize: size }).run();
      },
      unsetFontSize: () => ({ chain }: { chain: any }) => {
        return chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
      },
    } as any;
  },
});
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  ImageIcon,
  Code,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  LinkIcon as LinkOff,
  Sparkles,
  Check,
  X,
  RefreshCw,
  Loader2,
  AArrowUp,
  AArrowDown,
} from "lucide-react";
import { rewriteWithAI, composeWithAI } from "@/api/ai.ts";
import { useAIEnabled } from "@/hooks/use-ai-enabled.ts";

/** Upload an image file to the blob endpoint and return the blobId */
async function uploadImageBlob(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const response = await fetch("/api/blob/upload", {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  if (!response.ok) throw new Error("Upload failed");
  const result = await response.json();
  return result.blobId;
}

/** Create a placeholder element shown while an inline image uploads */
function createPlaceholder(): HTMLElement {
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.className = "inline-image-placeholder";
  el.style.cssText =
    "display: inline-block; width: 120px; height: 80px; background: var(--color-bg-tertiary, #e5e7eb); border-radius: 4px; vertical-align: middle; position: relative;";
  const spinner = document.createElement("span");
  spinner.style.cssText =
    "position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--color-text-tertiary, #9ca3af); font-size: 12px;";
  spinner.textContent = "\u2026";
  el.appendChild(spinner);
  return el;
}

/**
 * Tiptap extension that handles image drop and paste events.
 * Dropped/pasted image files are uploaded to /api/blob/upload and inserted
 * as <img src="/api/blob/{blobId}/inline"> nodes.
 */
const InlineImageUpload = Extension.create({
  name: "inlineImageUpload",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop(view, event) {
            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) return false;

            const images = Array.from(files).filter((f) =>
              f.type.startsWith("image/"),
            );
            if (images.length === 0) return false;

            event.preventDefault();

            // Determine drop position
            const dropPos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            const insertPos = dropPos?.pos ?? view.state.selection.to;

            for (const image of images) {
              // Insert placeholder
              const placeholder = createPlaceholder();
              const placeholderWidget =
                view.state.schema.text(" ");
              // We'll use a simpler approach: insert a temporary text node, then replace
              // Actually, insert the image directly after upload; show nothing blocking

              uploadImageBlob(image)
                .then((blobId) => {
                  const { schema } = view.state;
                  const imgNode = schema.nodes.image.create({
                    src: `/api/blob/${blobId}/inline`,
                    alt: image.name,
                  });
                  const tr = view.state.tr.insert(
                    Math.min(insertPos, view.state.doc.content.size),
                    imgNode,
                  );
                  view.dispatch(tr);
                })
                .catch(() => {
                  // Upload failed — silent (could add toast here)
                });
            }

            return true;
          },

          handlePaste(view, event) {
            const items = event.clipboardData?.items;
            if (!items) return false;

            const imageItems = Array.from(items).filter((i) =>
              i.type.startsWith("image/"),
            );
            if (imageItems.length === 0) return false;

            event.preventDefault();

            for (const item of imageItems) {
              const file = item.getAsFile();
              if (!file) continue;

              uploadImageBlob(file)
                .then((blobId) => {
                  const { schema } = view.state;
                  const imgNode = schema.nodes.image.create({
                    src: `/api/blob/${blobId}/inline`,
                    alt: "Pasted image",
                  });
                  const tr = view.state.tr.replaceSelectionWith(imgNode);
                  view.dispatch(tr);
                })
                .catch(() => {
                  // Upload failed
                });
            }

            return true;
          },
        },
      }),
    ];
  },
});

interface ComposeEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export const ComposeEditor = React.memo(function ComposeEditor({
  content,
  onChange,
  placeholder: placeholderProp,
}: ComposeEditorProps) {
  const { t } = useTranslation();
  const aiEnabled = useAIEnabled();
  const placeholder = placeholderProp ?? t("compose.writeMessage");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [editorFontSize, setEditorFontSize] = useState("");

  // AI Edit state
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiSelectedText, setAiSelectedText] = useState("");
  const [aiSelectionRange, setAiSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const aiEditRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        hardBreak: { keepMarks: true },
        // Disable extensions we configure separately to avoid duplicates
        link: false,
        underline: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            style: {
              default: null,
              parseHTML: (element) => element.getAttribute("style"),
              renderHTML: (attributes) => {
                if (!attributes.style) return {};
                return { style: attributes.style };
              },
            },
          };
        },
      }).configure({
        inline: true,
        allowBase64: false,
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder,
      }),
      Typography,
      CharacterCount,
      FontSize,
      AiSelectionHighlight,
      InlineImageUpload,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "compose-editor-content",
        style:
          "min-height: 200px; max-height: 60vh; overflow-y: auto; outline: none; padding: 12px 16px;",
      },
      handleKeyDown: (_view, event) => {
        // Ctrl+Shift+E: AI Edit
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
          event.preventDefault();
          aiEditRef.current();
          return true;
        }
        // Tab key indentation in lists
        if (event.key === "Tab") {
          if (editor?.isActive("listItem")) {
            if (event.shiftKey) {
              editor.chain().focus().liftListItem("listItem").run();
            } else {
              editor.chain().focus().sinkListItem("listItem").run();
            }
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
    },
  });

  // Sync content prop -> editor when it changes from outside (e.g. signature swap)
  const lastContentRef = useRef(content);
  useEffect(() => {
    if (editor && content !== lastContentRef.current) {
      const currentHTML = editor.getHTML();
      if (content !== currentHTML) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
      lastContentRef.current = content;
    }
  }, [content, editor]);

  // Track onChange changes
  useEffect(() => {
    if (editor) {
      lastContentRef.current = editor.getHTML();
    }
  });

  // Apply font size to editor element so placeholder text inherits it
  useEffect(() => {
    if (editor && editor.isEditable) {
      try {
        const el = editor.view.dom as HTMLElement;
        el.style.fontSize = editorFontSize || "";
      } catch { /* editor not mounted yet */ }
    }
  }, [editor, editorFontSize]);

  const handleLinkSubmit = useCallback(() => {
    if (!editor) return;
    if (linkUrl) {
      const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href ?? "";
    setLinkUrl(previousUrl);
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 50);
  }, [editor]);

  const handleInsertImage = useCallback(() => {
    if (!editor) return;
    const url = prompt(t("compose.imageUrl"));
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  // AI Edit: trigger the popover
  const handleAiEdit = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    let rangeFrom: number;
    let rangeTo: number;

    if (hasSelection) {
      const selectedText = editor.state.doc.textBetween(from, to, '\n');
      setAiSelectedText(selectedText);
      rangeFrom = from;
      rangeTo = to;
    } else {
      // No selection: get all text before quote/signature (or empty for compose from scratch)
      const fullText = editor.state.doc.textContent;
      const sigIdx = fullText.indexOf('\n-- \n');
      const text = sigIdx !== -1 ? fullText.slice(0, sigIdx).trim() : fullText.trim();
      setAiSelectedText(text); // May be empty — AI will generate from scratch
      let endPos = editor.state.doc.content.size;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text?.includes('-- ')) {
          const resolved = editor.state.doc.resolve(pos);
          const parent = resolved.parent;
          if (parent.textContent.trim() === '--') {
            endPos = Math.min(endPos, resolved.before());
            return false;
          }
        }
      });
      rangeFrom = 0;
      rangeTo = endPos;
    }

    setAiSelectionRange({ from: rangeFrom, to: rangeTo });
    setAiEditOpen(true);
    setAiResult("");
    setAiInstruction("");

    // Apply persistent highlight decoration on the selected range
    const tr = editor.state.tr.setMeta(aiHighlightKey, { from: rangeFrom, to: rangeTo });
    editor.view.dispatch(tr);

    setTimeout(() => aiInputRef.current?.focus(), 50);
  }, [editor]);

  // Keep the ref updated so the keyboard shortcut can access it
  aiEditRef.current = handleAiEdit;

  // AI Edit: run the rewrite with a given instruction
  const runAiRewrite = useCallback(async (instruction: string, selectedText: string) => {
    if (!instruction.trim()) return;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setAiStreaming(true);
    setAiResult("");

    try {
      let result = "";
      // If no text selected, use compose mode (generate from scratch)
      const stream = selectedText
        ? rewriteWithAI(selectedText, instruction.trim(), controller.signal)
        : composeWithAI(instruction.trim(), "", "professional", controller.signal);
      for await (const chunk of stream) {
        result += chunk;
        setAiResult(result);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error("[AI] Rewrite failed:", e);
      }
    } finally {
      setAiStreaming(false);
    }
  }, []);

  // AI Edit: submit from the input field
  const handleAiRewrite = useCallback(() => {
    runAiRewrite(aiInstruction, aiSelectedText);
  }, [runAiRewrite, aiInstruction, aiSelectedText]);

  // AI Edit: quick preset
  const handleAiPreset = useCallback((preset: string) => {
    setAiInstruction(preset);
    runAiRewrite(preset, aiSelectedText);
  }, [runAiRewrite, aiSelectedText]);

  // AI Edit: accept the result
  const handleAiAccept = useCallback(() => {
    if (!editor || !aiResult || !aiSelectionRange) return;

    // Capture text styles from the selection before replacing
    editor.chain().focus().setTextSelection(aiSelectionRange).run();
    const attrs = editor.getAttributes("textStyle");
    const fontSize = attrs?.fontSize;

    // Clear the highlight decoration
    const clearTr = editor.state.tr.setMeta(aiHighlightKey, { clear: true });
    editor.view.dispatch(clearTr);

    // Build HTML with preserved styles
    const styleAttr = fontSize ? ` style="font-size: ${fontSize}"` : "";
    const htmlResult = aiResult
      .split(/\n\s*\n/)
      .map(p => `<p>${fontSize ? `<span${styleAttr}>${p.replace(/\n/g, '<br>')}</span>` : p.replace(/\n/g, '<br>')}</p>`)
      .join('');

    editor.chain()
      .focus()
      .setTextSelection(aiSelectionRange)
      .deleteSelection()
      .insertContent(htmlResult)
      .run();

    setAiEditOpen(false);
    setAiResult("");
    setAiInstruction("");
    setAiSelectedText("");
    setAiSelectionRange(null);
  }, [editor, aiResult, aiSelectionRange]);

  // AI Edit: cancel
  const handleAiCancel = useCallback(() => {
    aiAbortRef.current?.abort();
    // Clear the highlight decoration
    if (editor) {
      const clearTr = editor.state.tr.setMeta(aiHighlightKey, { clear: true });
      editor.view.dispatch(clearTr);
    }
    setAiEditOpen(false);
    setAiResult("");
    setAiInstruction("");
    setAiSelectedText("");
    setAiSelectionRange(null);
    setAiStreaming(false);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col" style={{ borderTop: "1px solid var(--color-border-secondary)" }}>
      {/* Formatting Toolbar */}
      <div
        className="flex items-center gap-0.5 px-2 py-1 flex-wrap"
        style={{
          borderBottom: "1px solid var(--color-border-secondary)",
          backgroundColor: "var(--color-bg-secondary)",
        }}
      >
        <ToolbarButton
          icon={<Undo size={15} />}
          label={t("editor.undo")}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolbarButton
          icon={<Redo size={15} />}
          label={t("editor.redo")}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={<Bold size={15} />}
          label={t("editor.bold")}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={<Italic size={15} />}
          label={t("editor.italic")}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={<UnderlineIcon size={15} />}
          label={t("editor.underline")}
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={<Strikethrough size={15} />}
          label={t("editor.strikethrough")}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={<Heading1 size={15} />}
          label={t("editor.heading1")}
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          icon={<Heading2 size={15} />}
          label={t("editor.heading2")}
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={<List size={15} />}
          label={t("editor.bulletList")}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={<ListOrdered size={15} />}
          label={t("editor.numberedList")}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={<LinkIcon size={15} />}
          label={t("editor.insertLink")}
          active={editor.isActive("link")}
          onClick={openLinkDialog}
        />
        {editor.isActive("link") && (
          <ToolbarButton
            icon={<LinkOff size={15} />}
            label={t("editor.removeLink")}
            onClick={() => editor.chain().focus().unsetLink().run()}
          />
        )}
        <ToolbarButton
          icon={<ImageIcon size={15} />}
          label={t("editor.insertImage")}
          onClick={handleInsertImage}
        />
        <ToolbarButton
          icon={<Code size={15} />}
          label={t("editor.code")}
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          icon={<Quote size={15} />}
          label={t("editor.blockquote")}
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={<AlignLeft size={15} />}
          label={t("editor.alignLeft")}
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarButton
          icon={<AlignCenter size={15} />}
          label={t("editor.alignCenter")}
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarButton
          icon={<AlignRight size={15} />}
          label={t("editor.alignRight")}
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        />

        <ToolbarDivider />

        {/* Font size */}
        <select
          value={editor.getAttributes("textStyle").fontSize || ""}
          onChange={(e) => {
            const val = e.target.value;
            setEditorFontSize(val);
            if (val) {
              editor.chain().focus().setMark("textStyle", { fontSize: val }).run();
            } else {
              editor.chain().focus().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-xs px-1 py-1 rounded outline-none cursor-pointer"
          style={{
            backgroundColor: "transparent",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border-secondary)",
            height: 28,
          }}
          title={t("editor.fontSize")}
        >
          <option value="">{t("editor.fontSizeDefault")}</option>
          <option value="10px">10</option>
          <option value="12px">12</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="20px">20</option>
          <option value="24px">24</option>
          <option value="28px">28</option>
          <option value="32px">32</option>
          <option value="36px">36</option>
        </select>

        {aiEnabled && (
          <>
            <ToolbarDivider />
            <ToolbarButton
              icon={<Sparkles size={15} />}
              label={t("editor.aiEdit")}
              onClick={handleAiEdit}
            />
          </>
        )}
      </div>

      {/* Link input popup */}
      {showLinkInput && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            borderBottom: "1px solid var(--color-border-secondary)",
          }}
        >
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLinkSubmit();
              }
              if (e.key === "Escape") {
                setShowLinkInput(false);
                setLinkUrl("");
              }
            }}
            placeholder="https://example.com"
            className="flex-1 text-sm px-2 py-1 rounded outline-none"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-primary)",
            }}
          />
          <button
            onClick={handleLinkSubmit}
            className="text-xs px-2 py-1 rounded font-medium"
            style={{
              backgroundColor: "var(--color-bg-accent)",
              color: "white",
            }}
          >
            {t("compose.apply")}
          </button>
          <button
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl("");
            }}
            className="text-xs px-2 py-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("compose.cancel")}
          </button>
        </div>
      )}

      {/* AI Edit popover */}
      {aiEditOpen && (
        <div
          className="flex flex-col gap-2 px-4 py-3"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            borderBottom: "1px solid var(--color-border-secondary)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={14} style={{ color: "var(--color-text-accent)", flexShrink: 0 }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                {aiSelectedText ? t("editor.aiEditTitle") : t("editor.aiComposeTitle")}
              </span>
              {aiSelectedText && (
                <span className="text-xs truncate" style={{ color: "var(--color-text-tertiary)" }}>
                  — {aiSelectedText.length > 80 ? aiSelectedText.slice(0, 80) + '...' : aiSelectedText}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleAiCancel}
              className="p-1 rounded hover:bg-[var(--color-bg-secondary)]"
              style={{ color: "var(--color-text-tertiary)" }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <X size={14} />
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              t("editor.aiPresetGrammar"),
              t("editor.aiPresetProfessional"),
              t("editor.aiPresetConcise"),
              t("editor.aiPresetFriendly"),
              t("editor.aiPresetSimplify"),
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleAiPreset(preset)}
                className="px-2 py-1 text-xs rounded-md transition-colors hover:bg-[var(--color-bg-secondary)]"
                style={{
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-secondary)",
                }}
                disabled={aiStreaming}
                onMouseDown={(e) => e.preventDefault()}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Instruction input */}
          <div className="flex items-center gap-2">
            <input
              ref={aiInputRef}
              type="text"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAiRewrite();
                }
                if (e.key === "Escape") {
                  handleAiCancel();
                }
              }}
              placeholder={aiSelectedText ? t("editor.aiEditPlaceholder") : t("editor.aiComposePlaceholder")}
              className="flex-1 text-sm px-3 py-2 rounded-md outline-none"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-primary)",
              }}
              disabled={aiStreaming}
            />
            <button
              type="button"
              onClick={handleAiRewrite}
              disabled={!aiInstruction.trim() || aiStreaming}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-40"
              style={{
                backgroundColor: "var(--color-bg-accent)",
                color: "white",
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {aiStreaming ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {aiStreaming ? t("editor.aiGenerating") : t("editor.aiRewrite")}
            </button>
          </div>

          {/* Result preview */}
          {aiResult && (
            <div className="rounded-md p-3" style={{ backgroundColor: "var(--color-bg-primary)", border: "1px solid var(--color-border-secondary)" }}>
              <pre className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-primary)", fontFamily: "inherit", margin: 0 }}>
                {aiResult}
              </pre>
              <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--color-border-secondary)" }}>
                <button
                  type="button"
                  onClick={handleAiAccept}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors"
                  style={{ backgroundColor: "var(--color-bg-accent)", color: "white" }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Check size={12} />
                  {t("editor.aiAccept")}
                </button>
                <button
                  type="button"
                  onClick={() => { setAiResult(""); setAiInstruction(""); setTimeout(() => aiInputRef.current?.focus(), 50); }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors hover:bg-[var(--color-bg-secondary)]"
                  style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-secondary)" }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <RefreshCw size={12} />
                  {t("editor.aiRefine")}
                </button>
                <button
                  type="button"
                  onClick={handleAiCancel}
                  className="px-2.5 py-1 text-xs rounded transition-colors hover:bg-[var(--color-bg-secondary)]"
                  style={{ color: "var(--color-text-tertiary)" }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {t("editor.aiCancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image resize toolbar */}
      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor }) => editor.isActive("image")}
        >
          <ImageResizeToolbar editor={editor} />
        </BubbleMenu>
      )}

      {/* Editor area */}
      <div className={aiEditOpen ? "ai-edit-active" : ""}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

function ImageResizeToolbar({ editor }: { editor: ReturnType<typeof useEditor> & {} }) {
  const { t } = useTranslation();
  const [showCustom, setShowCustom] = useState(false);
  const [customWidth, setCustomWidth] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const setImageWidth = useCallback(
    (width: string) => {
      editor.chain().focus().updateAttributes("image", { style: `width: ${width}` }).run();
    },
    [editor],
  );

  const sizes = [
    { label: "25%", value: "25%" },
    { label: "50%", value: "50%" },
    { label: "75%", value: "75%" },
    { label: "100%", value: "100%" },
  ];

  return (
    <div
      className="flex items-center gap-0.5 px-1.5 py-1 rounded-md shadow-lg text-xs"
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border-primary)",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {sizes.map((s) => (
        <button
          key={s.value}
          type="button"
          className="px-2 py-0.5 rounded transition-colors hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-secondary)" }}
          onClick={() => setImageWidth(s.value)}
        >
          {s.label}
        </button>
      ))}
      <div
        className="w-px h-4 mx-0.5"
        style={{ backgroundColor: "var(--color-border-primary)" }}
      />
      {showCustom ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const val = parseInt(customWidth, 10);
            if (val > 0) {
              setImageWidth(customWidth.includes("%") || customWidth.includes("px") ? customWidth : `${val}px`);
            }
            setShowCustom(false);
            setCustomWidth("");
          }}
        >
          <input
            ref={customInputRef}
            type="text"
            value={customWidth}
            onChange={(e) => setCustomWidth(e.target.value)}
            placeholder="e.g. 300px"
            className="w-20 px-1.5 py-0.5 text-xs rounded outline-none"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-secondary)",
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowCustom(false);
                setCustomWidth("");
              }
            }}
          />
          <button
            type="submit"
            className="px-1.5 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: "var(--color-bg-accent, #3b82f6)", color: "#fff" }}
          >
            OK
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="px-2 py-0.5 rounded transition-colors hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: "var(--color-text-secondary)" }}
          onClick={() => {
            setShowCustom(true);
          }}
        >
          {t("editor.customSize", "Custom")}
        </button>
      )}
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded transition-colors duration-100"
      style={{
        color: active
          ? "var(--color-text-accent)"
          : disabled
            ? "var(--color-text-tertiary)"
            : "var(--color-text-secondary)",
        backgroundColor: active ? "var(--color-bg-tertiary)" : "transparent",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
      onMouseDown={(e) => e.preventDefault()} // prevent editor blur
    >
      {icon}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <div
      className="w-px h-4 mx-0.5"
      style={{ backgroundColor: "var(--color-border-primary)" }}
    />
  );
}

/** Convert Tiptap HTML to email-safe HTML with inline styles */
export function toEmailSafeHTML(html: string): string {
  // Create a temporary DOM to transform styles
  const container = document.createElement("div");
  container.innerHTML = html;

  // Convert semantic tags to inline-styled spans for email clients
  const processNode = (node: Element) => {
    const tag = node.tagName.toLowerCase();

    // Add inline styles based on tags
    switch (tag) {
      case "strong":
      case "b":
        node.setAttribute("style", addStyle(node, "font-weight: bold"));
        break;
      case "em":
      case "i":
        node.setAttribute("style", addStyle(node, "font-style: italic"));
        break;
      case "u":
        node.setAttribute("style", addStyle(node, "text-decoration: underline"));
        break;
      case "s":
      case "del":
        node.setAttribute("style", addStyle(node, "text-decoration: line-through"));
        break;
      case "h1":
        node.setAttribute(
          "style",
          addStyle(node, "font-size: 24px; font-weight: bold; margin: 16px 0 8px 0"),
        );
        break;
      case "h2":
        node.setAttribute(
          "style",
          addStyle(node, "font-size: 20px; font-weight: bold; margin: 12px 0 6px 0"),
        );
        break;
      case "h3":
        node.setAttribute(
          "style",
          addStyle(node, "font-size: 16px; font-weight: bold; margin: 10px 0 4px 0"),
        );
        break;
      case "blockquote":
        node.setAttribute(
          "style",
          addStyle(
            node,
            "border-left: 3px solid #ccc; padding-left: 12px; margin: 8px 0; color: #555",
          ),
        );
        break;
      case "code":
        node.setAttribute(
          "style",
          addStyle(
            node,
            "background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em",
          ),
        );
        break;
      case "pre":
        node.setAttribute(
          "style",
          addStyle(
            node,
            "background-color: #f4f4f4; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 0.9em; overflow-x: auto",
          ),
        );
        break;
      case "a":
        node.setAttribute("style", addStyle(node, "color: #2563eb; text-decoration: underline"));
        break;
      case "table":
        node.setAttribute(
          "style",
          addStyle(node, "border-collapse: collapse; width: 100%; margin: 8px 0"),
        );
        break;
      case "td":
      case "th":
        node.setAttribute(
          "style",
          addStyle(node, "border: 1px solid #ddd; padding: 8px; text-align: left"),
        );
        if (tag === "th") {
          node.setAttribute(
            "style",
            addStyle(node, "font-weight: bold; background-color: #f8f8f8"),
          );
        }
        break;
      case "p":
        node.setAttribute("style", addStyle(node, "margin: 0 0 8px 0"));
        break;
    }

    // Handle text-align attribute
    const textAlign = node.getAttribute("data-text-align");
    if (textAlign) {
      node.setAttribute("style", addStyle(node, `text-align: ${textAlign}`));
    }

    // Recurse
    for (const child of Array.from(node.children)) {
      processNode(child);
    }
  };

  for (const child of Array.from(container.children)) {
    processNode(child);
  }

  return container.innerHTML;
}

function addStyle(node: Element, style: string): string {
  const existing = node.getAttribute("style") ?? "";
  return existing ? `${existing}; ${style}` : style;
}
