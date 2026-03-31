import React, { useState, useEffect } from "react";
import { parseDMARCReport, type DMARCReport } from "@/lib/dmarc.ts";
import {
  ShieldCheck, ShieldAlert, ShieldX,
  ChevronDown, ChevronRight, Loader2, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

interface DMARCReportCardProps {
  blobId: string;
  filename?: string;
}

export const DMARCReportCard = React.memo(function DMARCReportCard({
  blobId,
  filename,
}: DMARCReportCardProps) {
  const [report, setReport] = useState<DMARCReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/api/blob/${blobId}`);
        if (!resp.ok) throw new Error("Failed to fetch report");
        const data = await resp.arrayBuffer();
        const parsed = await parseDMARCReport(data);
        setReport(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse report");
      } finally {
        setLoading(false);
      }
    })();
  }, [blobId]);

  // suppress unused var warning
  void filename;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Parsing DMARC report...</span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
        <AlertTriangle size={16} style={{ color: "var(--color-text-warning)" }} />
        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{error || "Could not parse report"}</span>
      </div>
    );
  }

  const complianceColor = report.complianceRate >= 90 ? "#22c55e" : report.complianceRate >= 70 ? "#f59e0b" : "#ef4444";
  const ComplianceIcon = report.complianceRate >= 90 ? ShieldCheck : report.complianceRate >= 70 ? ShieldAlert : ShieldX;

  const policyColor = report.policy === "reject" ? "#22c55e" : report.policy === "quarantine" ? "#f59e0b" : "#9ca3af";

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Sort records by count descending
  const sortedRecords = [...report.records].sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border-primary)", backgroundColor: "var(--color-bg-primary)" }}>
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border-secondary)", backgroundColor: "var(--color-bg-secondary)" }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg" style={{ backgroundColor: complianceColor + "15" }}>
            <ComplianceIcon size={20} style={{ color: complianceColor }} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              DMARC Report — {report.domain}
            </div>
            <div className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              From {report.orgName} &middot; {format(report.dateRange.begin, "MMM d")} – {format(report.dateRange.end, "MMM d, yyyy")}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3">
          {/* Compliance rate */}
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold" style={{ color: complianceColor }}>
              {report.complianceRate}%
            </div>
            <div className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              compliance
            </div>
          </div>

          <div style={{ width: 1, height: 32, backgroundColor: "var(--color-border-secondary)" }} />

          {/* Total / Pass / Fail */}
          <div className="flex gap-4 text-xs">
            <div>
              <div className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{report.totalMessages.toLocaleString()}</div>
              <div style={{ color: "var(--color-text-tertiary)" }}>messages</div>
            </div>
            <div>
              <div className="font-semibold" style={{ color: "#22c55e" }}>{report.passCount.toLocaleString()}</div>
              <div style={{ color: "var(--color-text-tertiary)" }}>passed</div>
            </div>
            <div>
              <div className="font-semibold" style={{ color: "#ef4444" }}>{report.failCount.toLocaleString()}</div>
              <div style={{ color: "var(--color-text-tertiary)" }}>failed</div>
            </div>
          </div>

          <div style={{ width: 1, height: 32, backgroundColor: "var(--color-border-secondary)" }} />

          {/* Policy badge */}
          <div className="flex items-center gap-1.5">
            <div className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: policyColor + "18", color: policyColor, border: `1px solid ${policyColor}30` }}>
              p={report.policy}
            </div>
            {report.subdomainPolicy && (
              <div className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" }}>
                sp={report.subdomainPolicy}
              </div>
            )}
            <div className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: "var(--color-bg-tertiary)", color: "var(--color-text-tertiary)" }}>
              DKIM: {report.adkim === "s" ? "strict" : "relaxed"} &middot; SPF: {report.aspf === "s" ? "strict" : "relaxed"}
            </div>
          </div>
        </div>
      </div>

      {/* Records table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border-secondary)" }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--color-text-tertiary)" }}></th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Source IP</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Count</th>
              <th className="text-center px-4 py-2 font-medium" style={{ color: "var(--color-text-tertiary)" }}>DKIM</th>
              <th className="text-center px-4 py-2 font-medium" style={{ color: "var(--color-text-tertiary)" }}>SPF</th>
              <th className="text-center px-4 py-2 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Action</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--color-text-tertiary)" }}>From</th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((rec, idx) => {
              const isExpanded = expandedRows.has(idx);
              const dkimOk = rec.dmarcDkim === "pass";
              const spfOk = rec.dmarcSpf === "pass";
              const dispColor = rec.disposition === "none" ? "#22c55e" : rec.disposition === "quarantine" ? "#f59e0b" : "#ef4444";

              return (
                <React.Fragment key={idx}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-tertiary)]"
                    style={{ borderBottom: "1px solid var(--color-border-secondary)" }}
                    onClick={() => toggleRow(idx)}
                  >
                    <td className="px-4 py-2" style={{ color: "var(--color-text-tertiary)" }}>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </td>
                    <td className="px-4 py-2 font-mono" style={{ color: "var(--color-text-primary)" }}>{rec.sourceIP}</td>
                    <td className="px-4 py-2 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{rec.count.toLocaleString()}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: (dkimOk ? "#22c55e" : "#ef4444") + "18", color: dkimOk ? "#22c55e" : "#ef4444" }}>
                        {rec.dmarcDkim}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: (spfOk ? "#22c55e" : "#ef4444") + "18", color: spfOk ? "#22c55e" : "#ef4444" }}>
                        {rec.dmarcSpf}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: dispColor + "18", color: dispColor }}>
                        {rec.disposition}
                      </span>
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--color-text-secondary)" }}>{rec.headerFrom}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="px-8 py-3" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          {/* DKIM details */}
                          <div>
                            <div className="font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>DKIM Authentication</div>
                            {rec.dkimResults.length === 0 ? (
                              <div style={{ color: "var(--color-text-tertiary)" }}>No DKIM results</div>
                            ) : (
                              rec.dkimResults.map((d, i) => (
                                <div key={i} className="flex items-center gap-2 mb-0.5">
                                  <span className="px-1 py-0.5 rounded" style={{ backgroundColor: (d.result === "pass" ? "#22c55e" : "#ef4444") + "18", color: d.result === "pass" ? "#22c55e" : "#ef4444" }}>
                                    {d.result}
                                  </span>
                                  <span style={{ color: "var(--color-text-primary)" }}>{d.domain}</span>
                                  {d.selector && <span style={{ color: "var(--color-text-tertiary)" }}>({d.selector})</span>}
                                </div>
                              ))
                            )}
                          </div>
                          {/* SPF details */}
                          <div>
                            <div className="font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>SPF Authentication</div>
                            {rec.spfResults.length === 0 ? (
                              <div style={{ color: "var(--color-text-tertiary)" }}>No SPF results</div>
                            ) : (
                              rec.spfResults.map((s, i) => (
                                <div key={i} className="flex items-center gap-2 mb-0.5">
                                  <span className="px-1 py-0.5 rounded" style={{ backgroundColor: (s.result === "pass" ? "#22c55e" : "#ef4444") + "18", color: s.result === "pass" ? "#22c55e" : "#ef4444" }}>
                                    {s.result}
                                  </span>
                                  <span style={{ color: "var(--color-text-primary)" }}>{s.domain}</span>
                                  <span style={{ color: "var(--color-text-tertiary)" }}>({s.scope})</span>
                                </div>
                              ))
                            )}
                          </div>
                          {/* Identifiers */}
                          {(rec.envelopeFrom || rec.envelopeTo) && (
                            <div className="col-span-2">
                              <div className="font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Identifiers</div>
                              {rec.envelopeFrom && <div style={{ color: "var(--color-text-tertiary)" }}>Envelope From: {rec.envelopeFrom}</div>}
                              {rec.envelopeTo && <div style={{ color: "var(--color-text-tertiary)" }}>Envelope To: {rec.envelopeTo}</div>}
                            </div>
                          )}
                          {/* Override reasons */}
                          {rec.overrideReasons.length > 0 && (
                            <div className="col-span-2">
                              <div className="font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Policy Overrides</div>
                              {rec.overrideReasons.map((r, i) => (
                                <div key={i} className="flex items-center gap-1" style={{ color: "var(--color-text-tertiary)" }}>
                                  <AlertTriangle size={10} />
                                  {r.type}{r.comment && `: ${r.comment}`}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
