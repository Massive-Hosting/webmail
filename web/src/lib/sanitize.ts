/** HTML email sanitizer using DOMPurify */

import DOMPurify from "dompurify";

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    // Text formatting
    "p", "br", "hr", "span", "div", "pre", "code",
    "b", "i", "u", "s", "em", "strong", "mark", "small", "sub", "sup",
    "h1", "h2", "h3", "h4", "h5", "h6",
    // Lists
    "ul", "ol", "li", "dl", "dt", "dd",
    // Tables
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    // Links and images
    "a", "img",
    // Semantic
    "blockquote", "cite", "abbr", "address", "details", "summary",
    // Media (limited)
    "figure", "figcaption",
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "width", "height",
    "style", "class", "dir", "lang",
    "colspan", "rowspan", "scope", "headers",
    "target", "rel",
    "border", "cellpadding", "cellspacing", "align", "valign",
    "bgcolor", "color",
  ],
  FORBID_TAGS: [
    "script", "iframe", "object", "embed", "applet",
    "form", "input", "textarea", "select", "button",
    "meta", "link", "base", "svg", "math",
    "video", "audio", "source", "track",
    "style",
  ],
  FORBID_ATTR: [
    "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur",
    "onsubmit", "onkeydown", "onkeyup", "onkeypress",
    "onmouseenter", "onmouseleave", "onmousedown", "onmouseup",
    "ontouchstart", "ontouchend", "onanimationstart", "ontransitionend",
    "formaction", "xlink:href", "data-bind",
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["target"],
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

/** Safe CSS properties allowed in inline styles */
const SAFE_CSS_PROPERTIES = new Set([
  "color", "background-color", "background", "font-size", "font-weight",
  "font-family", "font-style", "text-align", "text-decoration", "text-transform",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-width", "border-style", "border-collapse", "border-spacing",
  "width", "max-width", "min-width", "height", "max-height", "min-height",
  "display", "vertical-align", "line-height", "white-space", "word-wrap",
  "overflow-wrap", "list-style", "list-style-type", "table-layout",
]);

/** Dangerous CSS patterns */
const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/i,
  /url\s*\(/i,
  /-moz-binding/i,
  /behavior\s*:/i,
  /javascript\s*:/i,
];

function sanitizeCssValue(style: string): string {
  const declarations = style.split(";");
  const safe: string[] = [];

  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const property = trimmed.substring(0, colonIdx).trim().toLowerCase();
    const value = trimmed.substring(colonIdx + 1).trim();

    if (!SAFE_CSS_PROPERTIES.has(property)) continue;
    if (DANGEROUS_CSS_PATTERNS.some((p) => p.test(value))) continue;

    safe.push(`${property}: ${value}`);
  }

  return safe.join("; ");
}

export interface SanitizeResult {
  html: string;
  hasExternalImages: boolean;
}

/**
 * Sanitize HTML email content.
 * @param cidMap - Map of Content-ID to blob URL for resolving inline images.
 *                 Keys should be bare CIDs (without angle brackets), e.g. "image001.png@01DA..."
 *                 Values should be blob URLs like "/api/blob/{blobId}/inline"
 */
export function sanitizeEmailHtml(
  html: string,
  cidMap?: Map<string, string>,
): SanitizeResult {
  let hasExternalImages = false;

  // Configure DOMPurify hooks for this sanitization
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // Force links to open in new tab
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }

    // Handle images
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") || "";

      // Resolve cid: references to blob URLs
      if (src.startsWith("cid:") && cidMap) {
        const cid = src.slice(4); // strip "cid:"
        const blobUrl = cidMap.get(cid);
        if (blobUrl) {
          node.setAttribute("src", blobUrl);
        } else {
          // Unknown CID — hide the broken image
          node.removeAttribute("src");
          node.setAttribute("alt", node.getAttribute("alt") || "[Image]");
        }
      } else if (src && !src.startsWith("data:") && !src.startsWith("/api/blob/")) {
        // External image — block and offer to load
        hasExternalImages = true;
        node.setAttribute("data-external-src", src);
        node.removeAttribute("src");
        // Check if this looks like a small icon (width/height attrs or tiny dimensions)
        const w = parseInt(node.getAttribute("width") ?? "0", 10);
        const h = parseInt(node.getAttribute("height") ?? "0", 10);
        const isIcon = (w > 0 && w <= 32) || (h > 0 && h <= 32);
        if (isIcon) {
          // Hide small icons entirely (social media badges, tracking pixels)
          node.setAttribute("style", "display:none;");
        } else {
          // Show a clean placeholder for content images
          node.setAttribute(
            "style",
            "display:inline-block;min-width:60px;min-height:40px;background:var(--color-bg-tertiary);border-radius:4px;border:1px dashed var(--color-border-secondary);",
          );
        }
        node.setAttribute("alt", "");
      }
    }

    // Sanitize inline styles
    const style = node.getAttribute("style");
    if (style) {
      const sanitized = sanitizeCssValue(style);
      if (sanitized) {
        node.setAttribute("style", sanitized);
      } else {
        node.removeAttribute("style");
      }
    }
  });

  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG) as unknown as string;

  // Remove hooks to prevent interference with future calls
  DOMPurify.removeAllHooks();

  return { html: clean, hasExternalImages };
}

/** Load external images in already-sanitized HTML by restoring data-external-src */
export function loadExternalImages(container: HTMLElement): void {
  const images = container.querySelectorAll("img[data-external-src]");
  for (const img of images) {
    const src = img.getAttribute("data-external-src");
    if (src) {
      img.setAttribute("src", src);
      img.removeAttribute("data-external-src");
      img.removeAttribute("style");
    }
  }
}

/** Convert plain text to linkified HTML */
export function linkifyText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<>]+)/gi;
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

  let result = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  result = result.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  result = result.replace(emailRegex, '<a href="mailto:$1">$1</a>');

  return result;
}

/** Detect and split quoted text in plain text emails */
export function splitQuotedText(text: string): {
  body: string;
  quoted: string | null;
} {
  const lines = text.split("\n");
  let quoteStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Detect common quote patterns
    if (
      line.startsWith(">") ||
      line.match(/^On .+ wrote:$/) ||
      line.match(/^-{3,}\s*Original Message\s*-{3,}$/i) ||
      line.match(/^_{3,}$/i)
    ) {
      quoteStart = i;
      break;
    }
  }

  if (quoteStart === -1) {
    return { body: text, quoted: null };
  }

  return {
    body: lines.slice(0, quoteStart).join("\n"),
    quoted: lines.slice(quoteStart).join("\n"),
  };
}
