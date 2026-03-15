import { describe, it, expect } from "vitest";
import { detectPGPContent, detectPGPMIME } from "../pgp-detect.ts";

describe("detectPGPContent", () => {
  it("detects PGP encrypted message", () => {
    const text = "Some text\n-----BEGIN PGP MESSAGE-----\nencrypted data\n-----END PGP MESSAGE-----";
    const result = detectPGPContent(text);
    expect(result.hasEncrypted).toBe(true);
    expect(result.hasSigned).toBe(false);
    expect(result.hasCleartextSigned).toBe(false);
  });

  it("detects PGP signature", () => {
    const text = "Message body\n-----BEGIN PGP SIGNATURE-----\nsignature data\n-----END PGP SIGNATURE-----";
    const result = detectPGPContent(text);
    expect(result.hasEncrypted).toBe(false);
    expect(result.hasSigned).toBe(true);
  });

  it("detects cleartext signed message", () => {
    const text = "-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nSigned content\n-----BEGIN PGP SIGNATURE-----\nsig\n-----END PGP SIGNATURE-----";
    const result = detectPGPContent(text);
    expect(result.hasCleartextSigned).toBe(true);
    expect(result.hasSigned).toBe(true);
  });

  it("returns false for regular email text", () => {
    const text = "Hello, this is a normal email with no PGP content.";
    const result = detectPGPContent(text);
    expect(result.hasEncrypted).toBe(false);
    expect(result.hasSigned).toBe(false);
    expect(result.hasCleartextSigned).toBe(false);
  });

  it("returns false for empty string", () => {
    const result = detectPGPContent("");
    expect(result.hasEncrypted).toBe(false);
    expect(result.hasSigned).toBe(false);
    expect(result.hasCleartextSigned).toBe(false);
  });
});

describe("detectPGPMIME", () => {
  it("detects PGP/MIME encrypted content type", () => {
    const contentType = 'multipart/encrypted; protocol="application/pgp-encrypted"; boundary="abc"';
    const result = detectPGPMIME(contentType);
    expect(result.isEncrypted).toBe(true);
    expect(result.isSigned).toBe(false);
  });

  it("detects PGP/MIME signed content type", () => {
    const contentType = 'multipart/signed; protocol="application/pgp-signature"; micalg=pgp-sha256; boundary="xyz"';
    const result = detectPGPMIME(contentType);
    expect(result.isEncrypted).toBe(false);
    expect(result.isSigned).toBe(true);
  });

  it("returns false for regular content type", () => {
    const result = detectPGPMIME("text/html; charset=utf-8");
    expect(result.isEncrypted).toBe(false);
    expect(result.isSigned).toBe(false);
  });

  it("returns false for partial match (multipart/encrypted without pgp-encrypted)", () => {
    const result = detectPGPMIME("multipart/encrypted; boundary=abc");
    expect(result.isEncrypted).toBe(false);
  });
});
