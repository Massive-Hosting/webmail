import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml, linkifyText, splitQuotedText } from "../sanitize.ts";

describe("sanitizeEmailHtml", () => {
  it("strips script tags", () => {
    const result = sanitizeEmailHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("alert");
    expect(result.html).toContain("<p>Hello</p>");
  });

  it("strips event handler attributes", () => {
    const result = sanitizeEmailHtml('<img src="data:image/png;base64,x" onerror="alert(1)">');
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("alert");
  });

  it("strips onclick attributes", () => {
    const result = sanitizeEmailHtml('<p onclick="alert(1)">Click</p>');
    expect(result.html).not.toContain("onclick");
  });

  it("strips iframes", () => {
    const result = sanitizeEmailHtml('<iframe src="https://evil.com"></iframe><p>Safe</p>');
    expect(result.html).not.toContain("<iframe");
    expect(result.html).toContain("<p>Safe</p>");
  });

  it("preserves safe HTML tags", () => {
    const html = '<p>Hello <b>bold</b> <i>italic</i> <a href="https://example.com">link</a></p>';
    const result = sanitizeEmailHtml(html);
    expect(result.html).toContain("<p>");
    expect(result.html).toContain("<b>bold</b>");
    expect(result.html).toContain("<i>italic</i>");
    expect(result.html).toContain("<a ");
  });

  it("adds target=_blank and rel=noopener noreferrer to links", () => {
    const result = sanitizeEmailHtml('<a href="https://example.com">link</a>');
    expect(result.html).toContain('target="_blank"');
    expect(result.html).toContain('rel="noopener noreferrer"');
  });

  it("hides tracking pixel images without flagging hasExternalImages", () => {
    const result = sanitizeEmailHtml('<img src="https://tracker.com/pixel.png" alt="pic">');
    // Tracking pixels are hidden entirely (display:none), no banner shown
    expect(result.hasExternalImages).toBe(false);
    expect(result.html).toMatch(/display:\s*none/);
    expect(result.html).toContain("data-external-src");
    expect(result.html).not.toMatch(/\ssrc="https:\/\/tracker\.com/);
  });

  it("flags hasExternalImages for actual content images", () => {
    const result = sanitizeEmailHtml('<img src="https://example.com/photo.jpg" alt="A photo" width="400" height="300">');
    expect(result.hasExternalImages).toBe(true);
    expect(result.html).toContain("data-external-src");
    expect(result.html).not.toMatch(/\ssrc="https:\/\/example\.com/);
  });

  it("preserves data: URI images", () => {
    const result = sanitizeEmailHtml('<img src="data:image/png;base64,abc" alt="pic">');
    expect(result.hasExternalImages).toBe(false);
    expect(result.html).toContain('src="data:image/png;base64,abc"');
  });

  it("strips dangerous CSS properties like position and z-index", () => {
    const result = sanitizeEmailHtml('<div style="position:fixed; z-index:9999; color:red;">text</div>');
    expect(result.html).not.toContain("position");
    expect(result.html).not.toContain("z-index");
    expect(result.html).toContain("color: red");
  });

  it("strips form elements", () => {
    const result = sanitizeEmailHtml('<form action="/steal"><input type="text"><button>Submit</button></form>');
    expect(result.html).not.toContain("<form");
    expect(result.html).not.toContain("<input");
    expect(result.html).not.toContain("<button");
  });

  it("strips CSS expression() in style attributes", () => {
    const result = sanitizeEmailHtml('<div style="width: expression(alert(1))">text</div>');
    expect(result.html).not.toContain("expression");
  });
});

describe("linkifyText", () => {
  it("converts URLs to clickable links", () => {
    const result = linkifyText("Visit https://example.com for info");
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('target="_blank"');
  });

  it("converts email addresses to mailto links", () => {
    const result = linkifyText("Email alice@example.com for help");
    expect(result).toContain('<a href="mailto:alice@example.com"');
  });

  it("escapes HTML entities", () => {
    const result = linkifyText("<script>alert('xss')</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });
});

describe("splitQuotedText", () => {
  it("returns full body when no quote markers found", () => {
    const result = splitQuotedText("Hello world\nHow are you?");
    expect(result.body).toBe("Hello world\nHow are you?");
    expect(result.quoted).toBeNull();
  });

  it("splits at '>' quote markers", () => {
    const text = "My reply\n\n> Original message\n> More original";
    const result = splitQuotedText(text);
    expect(result.body).toBe("My reply\n");
    expect(result.quoted).toContain("> Original message");
  });

  it("splits at 'On ... wrote:' pattern", () => {
    const text = "My reply\n\nOn Mon, Jan 1, 2026, alice wrote:\n> stuff";
    const result = splitQuotedText(text);
    expect(result.body).toBe("My reply\n");
    expect(result.quoted).toContain("wrote:");
  });
});
