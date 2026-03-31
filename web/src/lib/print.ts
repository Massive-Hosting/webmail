/** Print email utility — opens a clean print window */

import type { Email, EmailAddress } from "@/types/mail.ts";
import { formatFullDate, formatFileSize } from "@/lib/format.ts";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAddressLine(addrs: EmailAddress[] | null): string {
  if (!addrs || addrs.length === 0) return "";
  return addrs
    .map((a) => {
      const name = a.name ? escapeHtml(a.name) : "";
      const email = escapeHtml(a.email);
      return name ? `${name} &lt;${email}&gt;` : email;
    })
    .join(", ");
}

/**
 * Open a print-friendly window for the given email and trigger the browser print dialog.
 */
export function printEmail(email: Email): void {
  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) return;

  const subject = email.subject || "(no subject)";

  // Extract body content
  let bodyContent = "";
  if (email.htmlBody && email.bodyValues) {
    for (const part of email.htmlBody) {
      if (part.partId && email.bodyValues[part.partId]) {
        bodyContent = email.bodyValues[part.partId].value;
        break;
      }
    }
  }
  if (!bodyContent && email.textBody && email.bodyValues) {
    for (const part of email.textBody) {
      if (part.partId && email.bodyValues[part.partId]) {
        bodyContent = `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit">${escapeHtml(email.bodyValues[part.partId].value)}</pre>`;
        break;
      }
    }
  }

  // Attachments (non-inline)
  const attachments = email.attachments?.filter((a) => a.disposition !== "inline") ?? [];
  let attachmentSection = "";
  if (attachments.length > 0) {
    const items = attachments
      .map((a) => {
        const name = escapeHtml(a.name ?? "attachment");
        const size = formatFileSize(a.size);
        return `<li>${name} <span style="color:#666">(${size})</span></li>`;
      })
      .join("");
    attachmentSection = `
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #ddd">
        <strong>Attachments (${attachments.length})</strong>
        <ul style="margin:8px 0 0;padding-left:20px">${items}</ul>
      </div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
      color: #222;
      font-size: 14px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .subject {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 16px;
    }
    .field { margin: 4px 0; }
    .field-label {
      display: inline-block;
      width: 60px;
      font-weight: 600;
      color: #555;
    }
    .body { margin-top: 24px; }
    .body img { max-width: 100%; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="subject">${escapeHtml(subject)}</h1>
    <div class="field"><span class="field-label">From:</span> ${formatAddressLine(email.from)}</div>
    <div class="field"><span class="field-label">To:</span> ${formatAddressLine(email.to)}</div>
    ${email.cc && email.cc.length > 0 ? `<div class="field"><span class="field-label">Cc:</span> ${formatAddressLine(email.cc)}</div>` : ""}
    <div class="field"><span class="field-label">Date:</span> ${escapeHtml(formatFullDate(email.receivedAt))}</div>
  </div>
  <div class="body">${bodyContent}</div>
  ${attachmentSection}
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content (especially images) to load before printing
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };
}
