/** Wrangler lacks parameter binding. Only use with fixed ranking SQL templates. */
export function bindRankingSql(statement: string, params: readonly (string | number | null)[]) {
  let index = 0;
  const result = statement.replace(/\?/g, () => {
    if (index >= params.length) throw new Error("Missing SQL parameter.");
    const value = params[index++];
    if (value === null) return "NULL";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Invalid SQL number.");
      return String(value);
    }
    return `'${value.replaceAll("'", "''")}'`;
  });
  if (index !== params.length) throw new Error("Unused SQL parameter.");
  return result;
}
