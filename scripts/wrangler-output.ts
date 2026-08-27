type D1ExecutionResult = {
  meta?: {
    rows_written?: unknown;
  };
  results?: unknown;
};

function parseD1ExecutionResults(output: string): D1ExecutionResult[] {
  const lines = output.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines.slice(index).join("\n").trim();
    if (!candidate.startsWith("[") && !candidate.startsWith("{")) continue;

    try {
      const parsed: unknown = JSON.parse(candidate);
      return (Array.isArray(parsed) ? parsed : [parsed]) as D1ExecutionResult[];
    } catch {
      // Wrangler may print progress lines before its JSON response.
    }
  }

  throw new Error("Wrangler did not return valid D1 JSON.");
}

export function parseD1QueryRows<T>(output: string): T[] {
  const rows = parseD1ExecutionResults(output)[0]?.results;
  return Array.isArray(rows) ? rows as T[] : [];
}

export function parseD1RowsWritten(output: string): number {
  return parseD1ExecutionResults(output).reduce((total, result) => {
    const rowsWritten = Number(result?.meta?.rows_written ?? 0);
    return total + (Number.isFinite(rowsWritten) ? rowsWritten : 0);
  }, 0);
}
