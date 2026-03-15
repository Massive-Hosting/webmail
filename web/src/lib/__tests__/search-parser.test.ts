import { describe, it, expect } from "vitest";
import { parseSearchQuery } from "../search-parser.ts";

describe("parseSearchQuery", () => {
  it("parses a basic text query", () => {
    expect(parseSearchQuery("query")).toEqual({ text: "query" });
  });

  it("parses from: operator", () => {
    expect(parseSearchQuery("from:alice")).toEqual({ from: "alice" });
  });

  it("parses to: operator with email address", () => {
    expect(parseSearchQuery("to:bob@example.com")).toEqual({ to: "bob@example.com" });
  });

  it("parses subject: operator with unquoted value", () => {
    // unquoted subject stops at the next space, so only first word
    const result = parseSearchQuery("subject:quarterly report");
    expect(result).toEqual({
      operator: "AND",
      conditions: [
        { subject: "quarterly" },
        { text: "report" },
      ],
    });
  });

  it("parses has:attachment", () => {
    expect(parseSearchQuery("has:attachment")).toEqual({ hasAttachment: true });
  });

  it("parses has:star", () => {
    expect(parseSearchQuery("has:star")).toEqual({ hasKeyword: "$flagged" });
  });

  it("parses is:unread", () => {
    expect(parseSearchQuery("is:unread")).toEqual({ notKeyword: "$seen" });
  });

  it("parses is:read", () => {
    expect(parseSearchQuery("is:read")).toEqual({ hasKeyword: "$seen" });
  });

  it("parses before: date", () => {
    expect(parseSearchQuery("before:2026-01-01")).toEqual({
      before: "2026-01-01T00:00:00Z",
    });
  });

  it("parses after: date", () => {
    expect(parseSearchQuery("after:2026-03-01")).toEqual({
      after: "2026-03-01T00:00:00Z",
    });
  });

  it("parses larger: size in megabytes", () => {
    expect(parseSearchQuery("larger:5mb")).toEqual({ minSize: 5242880 });
  });

  it("parses smaller: size in kilobytes", () => {
    expect(parseSearchQuery("smaller:100kb")).toEqual({ maxSize: 102400 });
  });

  it("parses a combined query with multiple operators and text", () => {
    const result = parseSearchQuery("from:alice has:attachment budget");
    expect(result).toEqual({
      operator: "AND",
      conditions: [
        { from: "alice" },
        { hasAttachment: true },
        { text: "budget" },
      ],
    });
  });

  it("parses quoted strings in subject", () => {
    expect(parseSearchQuery('subject:"quarterly report"')).toEqual({
      subject: "quarterly report",
    });
  });

  it("returns empty object for empty query", () => {
    expect(parseSearchQuery("")).toEqual({});
  });

  it("returns empty object for whitespace-only query", () => {
    expect(parseSearchQuery("   ")).toEqual({});
  });

  it("treats unknown operators as text", () => {
    const result = parseSearchQuery("foo:bar");
    expect(result).toEqual({ text: "foo:bar" });
  });

  it("combines multiple text words into single text filter", () => {
    const result = parseSearchQuery("hello world");
    expect(result).toEqual({ text: "hello world" });
  });

  it("handles case-insensitive operators", () => {
    expect(parseSearchQuery("FROM:alice")).toEqual({ from: "alice" });
    expect(parseSearchQuery("HAS:attachment")).toEqual({ hasAttachment: true });
  });
});
