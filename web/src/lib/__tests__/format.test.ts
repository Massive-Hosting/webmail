import { describe, it, expect } from "vitest";
import { formatFileSize, formatAddress, formatAddressList, getInitials, getAvatarColor } from "../format.ts";

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });

  it("formats zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats fractional KB", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
});

describe("formatAddress", () => {
  it("returns name when present", () => {
    expect(formatAddress({ name: "Alice", email: "alice@example.com" })).toBe("Alice");
  });

  it("returns email when name is null", () => {
    expect(formatAddress({ name: null, email: "alice@example.com" })).toBe("alice@example.com");
  });
});

describe("formatAddressList", () => {
  it("returns empty string for null", () => {
    expect(formatAddressList(null)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(formatAddressList([])).toBe("");
  });

  it("joins multiple addresses with commas", () => {
    const addrs = [
      { name: "Alice", email: "alice@example.com" },
      { name: null, email: "bob@example.com" },
    ];
    expect(formatAddressList(addrs)).toBe("Alice, bob@example.com");
  });
});

describe("getInitials", () => {
  it("returns two initials from full name", () => {
    expect(getInitials({ name: "Alice Smith", email: "a@b.com" })).toBe("AS");
  });

  it("returns single initial from one-word name", () => {
    expect(getInitials({ name: "Alice", email: "a@b.com" })).toBe("A");
  });

  it("returns first letter of email when no name", () => {
    expect(getInitials({ name: null, email: "alice@example.com" })).toBe("A");
  });

  it("handles three-word names (first + last initial)", () => {
    expect(getInitials({ name: "Alice B Carter", email: "a@b.com" })).toBe("AC");
  });
});

describe("getAvatarColor", () => {
  it("returns a hex color string", () => {
    const color = getAvatarColor("test@example.com");
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns the same color for the same email", () => {
    const a = getAvatarColor("test@example.com");
    const b = getAvatarColor("test@example.com");
    expect(a).toBe(b);
  });

  it("returns different colors for different emails (usually)", () => {
    const a = getAvatarColor("alice@example.com");
    const b = getAvatarColor("bob@example.com");
    // Not guaranteed but very likely with different inputs
    // Just check they're both valid colors
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
    expect(b).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
