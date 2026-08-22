type D1ExecutionResult = {
  meta?: {
    rows_written?: unknown;
  };
};

export function parseD1RowsWritten(output: string): number {
  const lines = output.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines.slice(index).join("\n").trim();
    if (!candidate.startsWith("[") && !candidate.startsWith("{")) continue;

    try {
      const parsed: unknown = JSON.parse(candidate);
      const results: D1ExecutionResult[] = Array.isArray(parsed) ? parsed : [parsed];

      return results.reduce((total, result) => {
        const rowsWritten = Number(result?.meta?.rows_written ?? 0);
        return total + (Number.isFinite(rowsWritten) ? rowsWritten : 0);
      }, 0);
    } catch {
      // Wrangler may print progress lines before its JSON response.
    }
  }

  throw new Error("Wrangler did not return valid D1 JSON.");
}
