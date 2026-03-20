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
import { Plugin } from "@tiptap/pm/state";
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
} from "lucide-react";

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
  const placeholder = placeholderProp ?? t("compose.writeMessage");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

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
      <EditorContent editor={editor} />
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
