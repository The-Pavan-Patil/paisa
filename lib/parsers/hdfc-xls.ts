import * as XLSX from "xlsx";

export type SuggestedType =
  | "salary_credit"
  | "additional_credit"
  | "investment_debit"
  | "expense"
  | "own_transfer"
  | "ignore";

export type ParsedTransaction = {
  date: string;
  narrationRaw: string;
  merchantClean: string;
  direction: "credit" | "debit";
  amount: number;
  closingBalanceSnapshot: number;
  suggestedType: SuggestedType;
  suggestedCategory: string | null;
  confidence: number;
  requiresFundName?: boolean;
  fundNameHint?: string | null;
};

export type ParsedStatement = {
  bankName: string;
  accountHolder: string;
  statementFrom: string;
  statementTo: string;
  openingBalance: number;
  closingBalance: number;
  transactions: ParsedTransaction[];
};

const KNOWN_SUBSCRIPTION = /NETFLIX|SPOTIFY|HOTSTAR|YOUTUBE|PRIME VIDEO|APPLE\.COM\/BILL|GOOGLE ONE|CURSOR|OPENAI/i;
const KNOWN_FUND = /PARAG PARIKH|PPFAS|HDFC (MIDCAP|INDEX)|AXIS (BLUECHIP|MIDCAP)|SBI SMALL CAP|ICICI PRUDENTIAL/i;

function titleCaseWords(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function cellNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseSheetDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + v * 86400000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = cellStr(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // HDFC exports often use DD/MM/YY (e.g. 02/05/26) or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const mm = dmy[2].padStart(2, "0");
    const dd = dmy[1].padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return null;
}

export function cleanMerchantName(narrationRaw: string): string {
  const raw = narrationRaw.trim();
  const up = raw.toUpperCase();

  const upi = raw.match(/^UPI-([^-]+)-/i);
  if (upi?.[1]) {
    return `UPI from ${titleCaseWords(upi[1].replace(/_/g, " "))}`;
  }

  const imps = raw.match(/^IMPS-\d+-([^-]+)-/i);
  if (imps?.[1]) {
    return `IMPS from ${titleCaseWords(imps[1].replace(/_/g, " "))}`;
  }

  if (/^NEFT\s+CR/i.test(raw)) {
    const rest = raw.replace(/^NEFT\s+CR-/i, "");
    const parts = rest.split("-");
    const sender = parts[1]?.trim();
    if (sender) {
      return `NEFT from ${titleCaseWords(sender.replace(/_/g, " "))}`;
    }
  }

  if (/^ACH\s+D/i.test(raw)) {
    return "ACH Auto-Debit (SIP/EMI)";
  }

  const pos = up.match(/\bPOS\b.*?\b(?:\d{4}\s+){0,3}(.+)$/i);
  if (pos?.[1]) {
    const tail = pos[1].trim().replace(/\s+/g, " ");
    return titleCaseWords(tail.split(/\d{2}:\d{2}/)[0]?.trim() ?? tail);
  }

  return titleCaseWords(raw.slice(0, 80)) || "Unknown";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ClassifiedPartial = {
  merchantClean: string;
  suggestedType: SuggestedType;
  suggestedCategory: string | null;
  confidence: number;
  requiresFundName?: boolean;
  fundNameHint?: string | null;
};

function classifyTransaction(
  narrationRaw: string,
  direction: "credit" | "debit",
  opts: { employerName: string | null; accountHolder: string },
): ClassifiedPartial {
  const upper = narrationRaw.toUpperCase();
  const employer = (opts.employerName ?? "").trim().toUpperCase();
  const holder = (opts.accountHolder ?? "").trim().toUpperCase();

  const merchantClean = cleanMerchantName(narrationRaw);

  if (holder.length >= 3) {
    const reSelf = new RegExp(`${escapeRe(holder)}.{0,80}${escapeRe(holder)}`, "i");
    if (reSelf.test(upper) || /\bSELF\s+TO\s+SELF\b/i.test(narrationRaw) || /\bOWN\s+ACCOUNT\b/i.test(upper)) {
      return {
        merchantClean,
        suggestedType: "own_transfer",
        suggestedCategory: null,
        confidence: 0.9,
        requiresFundName: false,
        fundNameHint: null,
      };
    }
  }

  if (direction === "debit" && upper.includes("ACH D")) {
    const fundMatch = narrationRaw.match(KNOWN_FUND);
    return {
      merchantClean,
      suggestedType: "investment_debit",
      suggestedCategory: "SIP / Auto-Debit / EMI",
      confidence: 0.85,
      requiresFundName: !fundMatch,
      fundNameHint: fundMatch ? fundMatch[0] : null,
    };
  }

  const isUpiImpsNeftCr =
    direction === "credit" &&
    (upper.includes("NEFT CR") || upper.includes("IMPS") || upper.includes("UPI"));

  if (isUpiImpsNeftCr) {
    if (employer && upper.includes(employer)) {
      return {
        merchantClean,
        suggestedType: "salary_credit",
        suggestedCategory: "Salary",
        confidence: 0.92,
        requiresFundName: false,
        fundNameHint: null,
      };
    }
    let cat: string | null = "Other Credit";
    if (upper.includes("UPI")) cat = "UPI Transfer Received";
    else if (upper.includes("IMPS")) cat = "IMPS Received";
    else if (upper.includes("NEFT CR")) cat = "NEFT Received";
    return {
      merchantClean,
      suggestedType: "additional_credit",
      suggestedCategory: cat,
      confidence: 0.88,
      requiresFundName: false,
      fundNameHint: null,
    };
  }

  if (direction === "debit" && (upper.includes("POS") || KNOWN_SUBSCRIPTION.test(narrationRaw))) {
    let cat = "Shopping";
    if (KNOWN_SUBSCRIPTION.test(narrationRaw)) cat = "Subscriptions";
    return {
      merchantClean,
      suggestedType: "expense",
      suggestedCategory: cat,
      confidence: 0.8,
      requiresFundName: false,
      fundNameHint: null,
    };
  }

  if (direction === "debit") {
    return {
      merchantClean,
      suggestedType: "expense",
      suggestedCategory: "Other Expense",
      confidence: 0.5,
      requiresFundName: false,
      fundNameHint: null,
    };
  }

  return {
    merchantClean,
    suggestedType: "additional_credit",
    suggestedCategory: "Other Credit",
    confidence: 0.5,
    requiresFundName: false,
    fundNameHint: null,
  };
}

function extractAccountHolder(rows: unknown[][]): string {
  const head = rows.slice(0, 25).map((r) => r.map(cellStr).join(" ")).join("\n");
  const m =
    head.match(/(?:customer\s*name|account\s*name)\s*:\s*([^\n\r|]+)/i) ||
    head.match(/name\s*:\s*([A-Za-z][A-Za-z\s.'-]{2,60})/i);
  return m?.[1]?.trim() ?? "";
}

function extractStatementRange(rows: unknown[][]): { from: string; to: string } {
  const blob = rows.slice(0, 25).map((r) => r.map(cellStr).join(" ")).join(" ");
  const m = blob.match(/from\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*to\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  if (m?.[1] && m[2]) {
    const a = normalizeAnyDate(m[1]);
    const b = normalizeAnyDate(m[2]);
    if (a && b) return { from: a, to: b };
  }
  return { from: "", to: "" };
}

function normalizeAnyDate(s: string): string | null {
  const t = s.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  if (iso) return iso;
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const mm = dmy[2].padStart(2, "0");
    const dd = dmy[1].padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return null;
}

function parseSummaryBalances(rows: unknown[][], headerIdx: number): { opening: number; closing: number } {
  let opening = 0;
  let closing = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const line = row.map(cellStr).join(" ").toUpperCase();
    if (!line.trim()) continue;
    const rowNums = row.map(cellNum);
    const bigNums = rowNums.filter((n) => Math.abs(n) > 1);
    if (line.includes("OPENING") && line.includes("BALANCE")) {
      opening = bigNums[0] ?? opening;
    }
    if (line.includes("CLOSING") && line.includes("BALANCE")) {
      closing = bigNums[bigNums.length - 1] ?? closing;
    }
    if (/OPENING.*BALANCE/i.test(line) && bigNums.length) opening = bigNums[0] ?? opening;
    if (/CLOSING.*BALANCE/i.test(line) && bigNums.length) closing = bigNums[bigNums.length - 1] ?? closing;
  }
  if (opening === 0 && closing === 0) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const cells = row.map(cellStr);
      const joined = cells.join("|").toUpperCase();
      if (joined.includes("OPENING") && joined.includes("CLOSING")) {
        const nums = row.map(cellNum);
        const vals = nums.filter((n) => n !== 0);
        if (vals.length >= 2) {
          opening = vals[0]!;
          closing = vals[vals.length - 1]!;
          break;
        }
      }
    }
  }
  return { opening, closing };
}

function isAsteriskSeparator(value: string): boolean {
  const t = value.trim();
  return t.length > 0 && /^[\s*]+$/.test(t);
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const c0 = cellStr(rows[i]?.[0]).toLowerCase();
    if (c0 === "date") return i;
  }
  return -1;
}

function headerColIndex(header: unknown[], ...names: string[]): number {
  const h = header.map((c) => cellStr(c).toLowerCase());
  for (const name of names) {
    const idx = h.findIndex((x) => x.includes(name.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseHdfcXls(
  buffer: Buffer,
  options?: { employerName?: string | null },
): ParsedStatement {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return emptyStatement("");
  }
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return emptyStatement("");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false }) as unknown[][];
  // AUDIT L3: keep the raw signature cell so the upload route can verify it
  // without re-running XLSX.read just to peek at cell A1.
  const bankName = cellStr(rows[0]?.[0]);
  const accountHolder = extractAccountHolder(rows);
  const range = extractStatementRange(rows);

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) {
    return {
      bankName,
      accountHolder,
      statementFrom: range.from,
      statementTo: range.to,
      openingBalance: 0,
      closingBalance: 0,
      transactions: [],
    };
  }

  const header = rows[headerIdx] ?? [];
  const ciDate = 0;
  const ciNarr = headerColIndex(header, "narration", "remarks");
  const ciWithdraw = headerColIndex(header, "withdrawal");
  const ciDeposit = headerColIndex(header, "deposit");
  const ciClose = headerColIndex(header, "closing balance", "balance");

  const narrIdx = ciNarr >= 0 ? ciNarr : 1;
  const withdrawIdx = ciWithdraw >= 0 ? ciWithdraw : 4;
  const depositIdx = ciDeposit >= 0 ? ciDeposit : 5;
  const closeIdx = ciClose >= 0 ? ciClose : 6;

  const transactions: ParsedTransaction[] = [];
  for (let r = headerIdx + 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const dateCell = cellStr(row[ciDate]);
    const narr = cellStr(row[narrIdx]);

    if (!dateCell && !narr) break;
    if (dateCell.startsWith("***") || isAsteriskSeparator(dateCell)) continue;
    if (!narr || isAsteriskSeparator(narr) || narr.startsWith("***")) {
      if (!dateCell) break;
      continue;
    }

    const dateStr = parseSheetDate(row[ciDate]);
    if (!dateStr) continue;

    const w = cellNum(row[withdrawIdx]);
    const d = cellNum(row[depositIdx]);
    const direction: "credit" | "debit" = d > 0 ? "credit" : "debit";
    const amount = direction === "credit" ? d : w;
    if (!amount || amount <= 0) continue;

    const closingSnapshot = cellNum(row[closeIdx]);

    const cls = classifyTransaction(narr, direction, {
      employerName: options?.employerName ?? null,
      accountHolder,
    });

    transactions.push({
      date: dateStr,
      narrationRaw: narr,
      merchantClean: cls.merchantClean,
      direction,
      amount,
      closingBalanceSnapshot: closingSnapshot,
      suggestedType: cls.suggestedType,
      suggestedCategory: cls.suggestedCategory,
      confidence: cls.confidence,
      requiresFundName: cls.requiresFundName,
      fundNameHint: cls.fundNameHint ?? null,
    });
  }

  let { opening, closing } = parseSummaryBalances(rows, headerIdx);
  if (opening === 0 && transactions.length) {
    const first = transactions[0]!;
    if (first.direction === "credit") {
      opening = first.closingBalanceSnapshot - first.amount;
    } else {
      opening = first.closingBalanceSnapshot + first.amount;
    }
  }
  if (closing === 0 && transactions.length) {
    closing = transactions[transactions.length - 1]!.closingBalanceSnapshot;
  }

  const statementFrom = range.from || transactions[0]?.date || "";
  const statementTo = range.to || transactions[transactions.length - 1]?.date || "";

  return {
    bankName,
    accountHolder,
    statementFrom,
    statementTo,
    openingBalance: opening,
    closingBalance: closing,
    transactions,
  };
}

function emptyStatement(bank: string): ParsedStatement {
  return {
    bankName: bank,
    accountHolder: "",
    statementFrom: "",
    statementTo: "",
    openingBalance: 0,
    closingBalance: 0,
    transactions: [],
  };
}
