/** DMARC aggregate report parser — handles gzip, zip, and plain XML */

import { gunzipSync, unzipSync } from "fflate";

export interface DMARCReport {
  // Report metadata
  orgName: string;
  email: string;
  reportId: string;
  dateRange: { begin: Date; end: Date };
  // Published policy
  domain: string;
  policy: string; // none | quarantine | reject
  subdomainPolicy?: string;
  pct: number;
  adkim: string; // r | s
  aspf: string; // r | s
  // Records
  records: DMARCRecord[];
  // Computed stats
  totalMessages: number;
  passCount: number;
  failCount: number;
  complianceRate: number; // 0-100
}

export interface DMARCRecord {
  sourceIP: string;
  count: number;
  disposition: string; // none | quarantine | reject
  dmarcDkim: string; // pass | fail
  dmarcSpf: string; // pass | fail
  overrideReasons: Array<{ type: string; comment?: string }>;
  headerFrom: string;
  envelopeFrom?: string;
  envelopeTo?: string;
  dkimResults: Array<{ domain: string; selector?: string; result: string }>;
  spfResults: Array<{ domain: string; scope: string; result: string }>;
}

/** Detect format by magic bytes and decompress+parse */
export async function parseDMARCReport(data: ArrayBuffer): Promise<DMARCReport> {
  const bytes = new Uint8Array(data);
  let xmlString: string;

  // Detect format by magic bytes
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    // GZIP
    const decompressed = gunzipSync(bytes);
    xmlString = new TextDecoder().decode(decompressed);
  } else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // ZIP
    const files = unzipSync(bytes);
    // Find first .xml file
    const xmlEntry = Object.entries(files).find(([name]) => name.endsWith(".xml"));
    if (!xmlEntry) throw new Error("No XML file found in ZIP archive");
    xmlString = new TextDecoder().decode(xmlEntry[1]);
  } else {
    // Assume plain XML
    xmlString = new TextDecoder().decode(bytes);
  }

  return parseXML(xmlString);
}

function parseXML(xml: string): DMARCReport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const getText = (parent: Element | Document, tag: string): string =>
    parent.querySelector(tag)?.textContent?.trim() ?? "";

  const getNum = (parent: Element | Document, tag: string): number =>
    parseInt(getText(parent, tag), 10) || 0;

  // Report metadata
  const meta = doc.querySelector("report_metadata")!;
  const orgName = getText(meta, "org_name");
  const email = getText(meta, "email");
  const reportId = getText(meta, "report_id");
  const dateRange = {
    begin: new Date(getNum(meta, "date_range > begin") * 1000),
    end: new Date(getNum(meta, "date_range > end") * 1000),
  };

  // Published policy
  const pol = doc.querySelector("policy_published")!;
  const domain = getText(pol, "domain");
  const policy = getText(pol, "p");
  const subdomainPolicy = getText(pol, "sp") || undefined;
  const pct = getNum(pol, "pct") || 100;
  const adkim = getText(pol, "adkim") || "r";
  const aspf = getText(pol, "aspf") || "r";

  // Records
  const records: DMARCRecord[] = [];
  for (const rec of Array.from(doc.querySelectorAll("record"))) {
    const row = rec.querySelector("row")!;
    const identifiers = rec.querySelector("identifiers");
    const authResults = rec.querySelector("auth_results");

    const overrideReasons: DMARCRecord["overrideReasons"] = [];
    for (const reason of Array.from(row.querySelectorAll("policy_evaluated > reason"))) {
      overrideReasons.push({
        type: getText(reason, "type"),
        comment: getText(reason, "comment") || undefined,
      });
    }

    const dkimResults: DMARCRecord["dkimResults"] = [];
    if (authResults) {
      for (const dkim of Array.from(authResults.querySelectorAll("dkim"))) {
        dkimResults.push({
          domain: getText(dkim, "domain"),
          selector: getText(dkim, "selector") || undefined,
          result: getText(dkim, "result"),
        });
      }
    }

    const spfResults: DMARCRecord["spfResults"] = [];
    if (authResults) {
      for (const spf of Array.from(authResults.querySelectorAll("spf"))) {
        spfResults.push({
          domain: getText(spf, "domain"),
          scope: getText(spf, "scope") || "mfrom",
          result: getText(spf, "result"),
        });
      }
    }

    records.push({
      sourceIP: getText(row, "source_ip"),
      count: getNum(row, "count"),
      disposition: getText(row, "policy_evaluated > disposition"),
      dmarcDkim: getText(row, "policy_evaluated > dkim"),
      dmarcSpf: getText(row, "policy_evaluated > spf"),
      overrideReasons,
      headerFrom: getText(identifiers!, "header_from"),
      envelopeFrom: getText(identifiers!, "envelope_from") || undefined,
      envelopeTo: getText(identifiers!, "envelope_to") || undefined,
      dkimResults,
      spfResults,
    });
  }

  // Compute stats
  const totalMessages = records.reduce((sum, r) => sum + r.count, 0);
  const passCount = records
    .filter((r) => r.dmarcDkim === "pass" || r.dmarcSpf === "pass")
    .reduce((sum, r) => sum + r.count, 0);
  const failCount = totalMessages - passCount;
  const complianceRate = totalMessages > 0 ? Math.round((passCount / totalMessages) * 100) : 0;

  return {
    orgName, email, reportId, dateRange,
    domain, policy, subdomainPolicy, pct, adkim, aspf,
    records, totalMessages, passCount, failCount, complianceRate,
  };
}
