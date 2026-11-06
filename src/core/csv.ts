/** Minimal RFC 4180 CSV parser: quoted fields, "" escapes, CRLF/LF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  if (text.charCodeAt(0) === 0xfeff) i = 1
  for (; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Parse CSV with a header row into records keyed by header name. Blank lines are skipped. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rest] = parseCsv(text)
  if (!header) return []
  return rest
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => {
      const rec: Record<string, string> = {}
      header.forEach((h, idx) => (rec[h] = r[idx] ?? ''))
      return rec
    })
}
