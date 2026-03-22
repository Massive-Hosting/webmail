/** Color label definitions */

export const LABEL_COLORS: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#8b5cf6",
};

export const LABEL_NAMES = Object.keys(LABEL_COLORS);

/** Extract active label colors from email keywords */
export function getEmailLabels(keywords: Record<string, boolean>): { name: string; color: string }[] {
  const labels: { name: string; color: string }[] = [];
  for (const [name, color] of Object.entries(LABEL_COLORS)) {
    if (keywords[`$label_${name}`]) {
      labels.push({ name, color });
    }
  }
  return labels;
}
