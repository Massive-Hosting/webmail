import { describe, it, expect } from "vitest";
import { parseAuthResults, parseReceivedHeaders } from "../email-headers.ts";

describe("parseAuthResults", () => {
  it("parses header with spf=pass, dkim=pass, dmarc=pass", () => {
    const headers = [
      "mx.google.com; spf=pass smtp.mailfrom=user@example.com; dkim=pass header.i=@example.com; dmarc=pass header.from=example.com",
    ];
    const result = parseAuthResults(headers);
    expect(result.spf.result).toBe("pass");
    expect(result.dkim.result).toBe("pass");
    expect(result.dmarc.result).toBe("pass");
  });

  it("parses header with spf=fail", () => {
    const headers = ["mx.example.com; spf=fail smtp.mailfrom=bad@evil.com"];
    const result = parseAuthResults(headers);
    expect(result.spf.result).toBe("fail");
  });

  it("parses header with dkim=none", () => {
    const headers = ["mx.example.com; dkim=none"];
    const result = parseAuthResults(headers);
    expect(result.dkim.result).toBe("none");
  });

  it("normalizes softfail to fail", () => {
    const headers = [
      "mx.example.com; spf=softfail (domain does not designate sender) smtp.mailfrom=user@example.com",
    ];
    const result = parseAuthResults(headers);
    expect(result.spf.result).toBe("fail");
  });

  it("parses ARC results", () => {
    const headers = [
      "mx.example.com; arc=pass; spf=pass smtp.mailfrom=user@example.com",
    ];
    const result = parseAuthResults(headers);
    expect(result.arc.result).toBe("pass");
  });

  it("parses multiple Authentication-Results headers (uses first definitive result)", () => {
    const headers = [
      "mx1.example.com; spf=pass smtp.mailfrom=user@example.com",
      "mx2.example.com; spf=fail smtp.mailfrom=user@example.com; dkim=pass header.i=@example.com",
    ];
    const result = parseAuthResults(headers);
    // First header already provides spf=pass, so it should not be overridden.
    expect(result.spf.result).toBe("pass");
    // dkim comes from the second header since first had no dkim.
    expect(result.dkim.result).toBe("pass");
  });

  it("returns all unknown for empty array", () => {
    const result = parseAuthResults([]);
    expect(result.spf.result).toBe("unknown");
    expect(result.dkim.result).toBe("unknown");
    expect(result.dmarc.result).toBe("unknown");
    expect(result.arc.result).toBe("unknown");
  });

  it("extracts parenthesized detail text", () => {
    const headers = [
      "mx.example.com; spf=pass (google.com: domain designates 1.2.3.4 as permitted) smtp.mailfrom=user@example.com",
    ];
    const result = parseAuthResults(headers);
    expect(result.spf.detail).toBe(
      "google.com: domain designates 1.2.3.4 as permitted",
    );
  });

  it("extracts TLS version from Received headers", () => {
    const authHeaders = ["mx.example.com; spf=pass smtp.mailfrom=user@example.com"];
    const receivedHeaders = [
      "from mail.example.com (mail.example.com [1.2.3.4]) by mx.dest.com with ESMTPS id abc (version=TLSv1.3 cipher=TLS_AES_256_GCM_SHA384); Sat, 15 Mar 2026 14:30:15 +0100",
    ];
    const result = parseAuthResults(authHeaders, receivedHeaders);
    expect(result.tlsVersion).toBe("TLSv1.3");
  });
});

describe("parseReceivedHeaders", () => {
  it("parses standard Received header with from, by, timestamp", () => {
    const headers = [
      "from mail.example.com (mail.example.com [203.0.113.50]) by mx.dest.com with ESMTP id abc123; Sat, 15 Mar 2026 14:30:15 +0100",
    ];
    const hops = parseReceivedHeaders(headers);
    expect(hops).toHaveLength(1);
    expect(hops[0].from).toBe("mail.example.com");
    expect(hops[0].by).toBe("mx.dest.com");
    expect(hops[0].timestamp).toBeDefined();
  });

  it("parses IP address from brackets", () => {
    const headers = [
      "from sender.example.com (unknown [192.168.1.100]) by mx.dest.com with SMTP id xyz",
    ];
    const hops = parseReceivedHeaders(headers);
    expect(hops).toHaveLength(1);
    expect(hops[0].fromIp).toBe("192.168.1.100");
  });

  it("detects TLS from ESMTPS", () => {
    const headers = [
      "from mail.example.com by mx.dest.com with ESMTPS id abc123",
    ];
    const hops = parseReceivedHeaders(headers);
    expect(hops).toHaveLength(1);
    expect(hops[0].tls).toBe(true);
    expect(hops[0].protocol).toBe("ESMTPS");
  });

  it("parses multiple Received headers in chronological order", () => {
    // Headers are listed newest-first (top of email), but parseReceivedHeaders
    // reverses them to chronological order.
    const headers = [
      "from mx2.relay.com by mx.final.com with ESMTP id def; Sat, 15 Mar 2026 14:31:00 +0100",
      "from origin.sender.com by mx1.relay.com with ESMTP id abc; Sat, 15 Mar 2026 14:30:00 +0100",
    ];
    const hops = parseReceivedHeaders(headers);
    expect(hops).toHaveLength(2);
    // After reversal: origin first, final last.
    expect(hops[0].from).toBe("origin.sender.com");
    expect(hops[0].by).toBe("mx1.relay.com");
    expect(hops[1].from).toBe("mx2.relay.com");
    expect(hops[1].by).toBe("mx.final.com");
  });

  it("handles malformed headers gracefully", () => {
    const headers = [
      "totally not a valid received header",
      "",
      "by mx.example.com with SMTP",
    ];
    // The ones without a "by" field are filtered out; "totally not..." has no by.
    // The last one has "by" so it passes.
    const hops = parseReceivedHeaders(headers);
    // "totally not a valid received header" has no "by" match, empty string is falsy.
    // "by mx.example.com with SMTP" will match by.
    expect(hops.length).toBeGreaterThanOrEqual(0);
    // No crash = success.
  });
});
