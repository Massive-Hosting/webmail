import { describe, it, expect } from "vitest";
import { generateSieveScript, parseSieveScript } from "../sieve.ts";
import type { FilterRule } from "@/types/filter-rules.ts";

function makeRule(overrides: Partial<FilterRule> & Pick<FilterRule, "name">): FilterRule {
  return {
    id: overrides.id ?? "rule-1",
    name: overrides.name,
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 0,
    conditions: overrides.conditions ?? [
      { field: "from", operator: "contains", value: "test@example.com" },
    ],
    conditionMatch: overrides.conditionMatch ?? "all",
    actions: overrides.actions ?? [{ type: "moveTo", value: "INBOX.Archive" }],
  };
}

describe("generateSieveScript", () => {
  it("generates a minimal script for empty rules", () => {
    const script = generateSieveScript([]);
    expect(script).toContain("# No rules defined");
    expect(script).toContain('require ["fileinto"]');
  });

  it("generates fileinto for a moveTo action", () => {
    const rules = [makeRule({ name: "Move test" })];
    const script = generateSieveScript(rules);
    expect(script).toContain('fileinto "INBOX.Archive"');
    expect(script).toContain('require ["fileinto"]');
  });

  it("uses allof for multiple conditions with conditionMatch=all", () => {
    const rules = [
      makeRule({
        name: "Multi condition all",
        conditionMatch: "all",
        conditions: [
          { field: "from", operator: "contains", value: "alice" },
          { field: "subject", operator: "contains", value: "report" },
        ],
      }),
    ];
    const script = generateSieveScript(rules);
    expect(script).toContain("allof");
  });

  it("uses anyof for multiple conditions with conditionMatch=any", () => {
    const rules = [
      makeRule({
        name: "Multi condition any",
        conditionMatch: "any",
        conditions: [
          { field: "from", operator: "contains", value: "alice" },
          { field: "subject", operator: "contains", value: "report" },
        ],
      }),
    ];
    const script = generateSieveScript(rules);
    expect(script).toContain("anyof");
  });

  it("comments out disabled rules", () => {
    const rules = [makeRule({ name: "Disabled rule", enabled: false })];
    const script = generateSieveScript(rules);
    expect(script).toContain("enabled: false");
    // The rule block lines should be commented
    const lines = script.split("\n");
    const metaLineIdx = lines.findIndex((l) => l.includes("META:"));
    // Lines after META that are the rule block should start with #
    const ruleBlockLines = lines.slice(metaLineIdx + 1).filter((l) => l.trim() !== "");
    for (const line of ruleBlockLines) {
      expect(line.startsWith("#")).toBe(true);
    }
  });

  it("generates addflag for star action", () => {
    const rules = [
      makeRule({ name: "Star rule", actions: [{ type: "star" }] }),
    ];
    const script = generateSieveScript(rules);
    expect(script).toContain("addflag");
    expect(script).toContain("Flagged");
    expect(script).toContain("imap4flags");
  });

  it("generates redirect for forward action", () => {
    const rules = [
      makeRule({
        name: "Forward rule",
        actions: [{ type: "forward", value: "other@example.com" }],
      }),
    ];
    const script = generateSieveScript(rules);
    expect(script).toContain('redirect "other@example.com"');
  });

  it("includes correct require declarations based on actions", () => {
    const rules = [
      makeRule({
        name: "Multi action",
        actions: [
          { type: "moveTo", value: "Archive" },
          { type: "star" },
          { type: "forward", value: "x@y.com" },
        ],
      }),
    ];
    const script = generateSieveScript(rules);
    expect(script).toContain('"fileinto"');
    expect(script).toContain('"imap4flags"');
    expect(script).toContain('"redirect"');
  });

  it("generates markRead action with addflag Seen", () => {
    const rules = [
      makeRule({ name: "Mark read rule", actions: [{ type: "markRead" }] }),
    ];
    const script = generateSieveScript(rules);
    expect(script).toContain("addflag");
    expect(script).toContain("Seen");
  });
});

describe("parseSieveScript", () => {
  it("parses an empty/minimal script to empty rules", () => {
    const script = '# Webmail filter rules\n# No rules defined\nrequire ["fileinto"];\n';
    const rules = parseSieveScript(script);
    expect(rules).toEqual([]);
  });

  it("round-trips a single enabled rule", () => {
    const original = [
      makeRule({
        id: "r1",
        name: "Test rule",
        order: 0,
        conditions: [{ field: "from", operator: "contains", value: "alice@example.com" }],
        conditionMatch: "all",
        actions: [{ type: "moveTo", value: "Archive" }],
      }),
    ];
    const script = generateSieveScript(original);
    const parsed = parseSieveScript(script);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("r1");
    expect(parsed[0].name).toBe("Test rule");
    expect(parsed[0].enabled).toBe(true);
    expect(parsed[0].conditions[0].field).toBe("from");
    expect(parsed[0].conditions[0].value).toBe("alice@example.com");
    expect(parsed[0].actions[0].type).toBe("moveTo");
    expect(parsed[0].actions[0].value).toBe("Archive");
  });

  it("round-trips a disabled rule", () => {
    const original = [
      makeRule({ id: "r2", name: "Disabled", enabled: false }),
    ];
    const script = generateSieveScript(original);
    const parsed = parseSieveScript(script);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].enabled).toBe(false);
    expect(parsed[0].name).toBe("Disabled");
  });

  it("round-trips a rule with forward action", () => {
    const original = [
      makeRule({
        id: "r3",
        name: "Forward",
        actions: [{ type: "forward", value: "other@example.com" }],
      }),
    ];
    const script = generateSieveScript(original);
    const parsed = parseSieveScript(script);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].actions[0].type).toBe("forward");
    expect(parsed[0].actions[0].value).toBe("other@example.com");
  });

  it("round-trips multiple rules preserving order", () => {
    const original = [
      makeRule({ id: "a", name: "First", order: 0 }),
      makeRule({ id: "b", name: "Second", order: 1 }),
    ];
    const script = generateSieveScript(original);
    const parsed = parseSieveScript(script);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("First");
    expect(parsed[1].name).toBe("Second");
  });
});
