export function buildCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (value: string | number) => {
    const s = String(value ?? "");
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, "\"\"")}"`;
    }
    return s;
  };

  const head = headers.map(esc).join(",");
  const body = rows.map((row) => row.map(esc).join(",")).join("\n");
  return `${head}\n${body}\n`;
}
