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
      <div className="flex items-center gap-2 p-4 rounded-lg bg-tertiary">
        <Loader2 size={16} className="animate-spin text-tertiary" />
        <span className="text-sm text-secondary">Parsing DMARC report...</span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-tertiary">
        <AlertTriangle size={16} style={{ color: "var(--color-text-warning)" }} />
        <span className="text-sm text-secondary">{error || "Could not parse report"}</span>
      </div>
    );
  }

  const complianceColor = report.complianceRate >= 90 ? "#22c55e" : report.complianceRate >= 70 ? "#f59e0b" : "#ef4444";
  const ComplianceIcon = report.complianceRate >= 90 ? ShieldCheck : report.complianceRate >= 70 ? ShieldAlert : ShieldX;


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
    <div className="card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="card-header px-5 py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg" style={{ backgroundColor: complianceColor + "15" }}>
            <ComplianceIcon size={20} style={{ color: complianceColor }} />
          </div>
          <div>
            <div className="text-sm font-semibold text-primary">
              DMARC Report — {report.domain}
            </div>
            <div className="text-xs text-tertiary">
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
            <div className="text-xs text-tertiary">
              compliance
            </div>
          </div>

          <div style={{ width: 1, height: 32, backgroundColor: "var(--color-border-secondary)" }} />

          {/* Total / Pass / Fail */}
          <div className="flex gap-4 text-xs">
            <div>
              <div className="font-semibold text-primary">{report.totalMessages.toLocaleString()}</div>
              <div className="text-tertiary">messages</div>
            </div>
            <div>
              <div className="font-semibold text-success">{report.passCount.toLocaleString()}</div>
              <div className="text-tertiary">passed</div>
            </div>
            <div>
              <div className="font-semibold text-danger">{report.failCount.toLocaleString()}</div>
              <div className="text-tertiary">failed</div>
            </div>
          </div>

          <div style={{ width: 1, height: 32, backgroundColor: "var(--color-border-secondary)" }} />

          {/* Policy badge */}
          <div className="flex items-center gap-1.5">
            <span className={`pill ${report.policy === "reject" ? "pill--success" : report.policy === "quarantine" ? "pill--warning" : "pill--info"}`}>
              p={report.policy}
            </span>
            {report.subdomainPolicy && (
              <div className="px-2 py-0.5 rounded text-xs font-medium bg-tertiary text-secondary">
                sp={report.subdomainPolicy}
              </div>
            )}
            <div className="px-2 py-0.5 rounded text-xs bg-tertiary text-tertiary">
              DKIM: {report.adkim === "s" ? "strict" : "relaxed"} &middot; SPF: {report.aspf === "s" ? "strict" : "relaxed"}
            </div>
          </div>
        </div>
      </div>

      {/* Records table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-secondary">
              <th className="text-left px-4 py-2 font-medium text-tertiary"></th>
              <th className="text-left px-4 py-2 font-medium text-tertiary">Source IP</th>
              <th className="text-right px-4 py-2 font-medium text-tertiary">Count</th>
              <th className="text-center px-4 py-2 font-medium text-tertiary">DMARC</th>
              <th className="text-center px-4 py-2 font-medium text-tertiary">DKIM</th>
              <th className="text-center px-4 py-2 font-medium text-tertiary">SPF</th>
              <th className="text-center px-4 py-2 font-medium text-tertiary">Action</th>
              <th className="text-left px-4 py-2 font-medium text-tertiary">From</th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((rec, idx) => {
              const isExpanded = expandedRows.has(idx);
              const dkimOk = rec.dmarcDkim === "pass";
              const spfOk = rec.dmarcSpf === "pass";
              const dmarcOk = dkimOk || spfOk;
              return (
                <React.Fragment key={idx}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-tertiary)] border-b-secondary"
                    onClick={() => toggleRow(idx)}
                  >
                    <td className="px-4 py-2 text-tertiary">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </td>
                    <td className="px-4 py-2 font-mono text-primary">{rec.sourceIP}</td>
                    <td className="px-4 py-2 text-right font-medium text-primary">{rec.count.toLocaleString()}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`pill ${dmarcOk ? "pill--solid-success" : "pill--solid-danger"}`}>
                        {dmarcOk ? "pass" : "fail"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`pill ${dkimOk ? "pill--success" : "pill--danger"}`}>
                        {rec.dmarcDkim}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`pill ${spfOk ? "pill--success" : "pill--danger"}`}>
                        {rec.dmarcSpf}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`pill ${rec.disposition === "none" ? "pill--success" : rec.disposition === "quarantine" ? "pill--warning" : "pill--danger"}`}>
                        {rec.disposition}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-secondary">{rec.headerFrom}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="px-8 py-3 bg-tertiary">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          {/* DMARC Alignment */}
                          <div className="col-span-2 mb-1">
                            <div className="font-medium mb-1 text-secondary">DMARC Alignment</div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <span>DKIM:</span>
                                <span className={`pill ${dkimOk ? "pill--success" : "pill--danger"}`}>
                                  {rec.dmarcDkim}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span>SPF:</span>
                                <span className={`pill ${spfOk ? "pill--success" : "pill--danger"}`}>
                                  {rec.dmarcSpf}
                                </span>
                                {!spfOk && rec.envelopeFrom && rec.headerFrom && rec.envelopeFrom !== rec.headerFrom && (
                                  <span className="text-tertiary">
                                    (envelope from {rec.envelopeFrom} ≠ header from {rec.headerFrom})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* DKIM raw auth results */}
                          <div>
                            <div className="font-medium mb-1 text-secondary">DKIM Auth Results</div>
                            {rec.dkimResults.length === 0 ? (
                              <div className="text-tertiary">No DKIM results</div>
                            ) : (
                              rec.dkimResults.map((d, i) => (
                                <div key={i} className="flex items-center gap-2 mb-0.5">
                                  <span className={`pill ${d.result === "pass" ? "pill--success" : "pill--danger"}`}>
                                    {d.result}
                                  </span>
                                  <span className="text-primary">{d.domain}</span>
                                  {d.selector && <span className="text-tertiary">({d.selector})</span>}
                                </div>
                              ))
                            )}
                          </div>
                          {/* SPF raw auth results */}
                          <div>
                            <div className="font-medium mb-1 text-secondary">SPF Auth Results</div>
                            {rec.spfResults.length === 0 ? (
                              <div className="text-tertiary">No SPF results</div>
                            ) : (
                              rec.spfResults.map((s, i) => (
                                <div key={i} className="flex items-center gap-2 mb-0.5">
                                  <span className={`pill ${s.result === "pass" ? "pill--success" : "pill--danger"}`}>
                                    {s.result}
                                  </span>
                                  <span className="text-primary">{s.domain}</span>
                                  {s.scope && <span className="text-tertiary">({s.scope === "mfrom" ? "envelope from" : s.scope})</span>}
                                </div>
                              ))
                            )}
                          </div>
                          {/* Identifiers */}
                          {(rec.envelopeFrom || rec.envelopeTo) && (
                            <div className="col-span-2">
                              <div className="font-medium mb-1 text-secondary">Identifiers</div>
                              {rec.envelopeFrom && <div className="text-tertiary">Envelope From: {rec.envelopeFrom}</div>}
                              {rec.envelopeTo && <div className="text-tertiary">Envelope To: {rec.envelopeTo}</div>}
                            </div>
                          )}
                          {/* Override reasons */}
                          {rec.overrideReasons.length > 0 && (
                            <div className="col-span-2">
                              <div className="font-medium mb-1 text-secondary">Policy Overrides</div>
                              {rec.overrideReasons.map((r, i) => (
                                <div key={i} className="flex items-center gap-1 text-tertiary">
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
