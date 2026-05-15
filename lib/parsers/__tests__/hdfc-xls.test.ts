import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseHdfcXls } from "../hdfc-xls";

function buildHdfcFixtureWorkbook(opts: { employerName: string }) {
  const rows: unknown[][] = [];
  rows[0] = ["HDFC BANK LTD — Account Statement"];
  rows[1] = ["Customer Name : Test User"];
  rows[2] = ["Statement from 01/05/2026 to 31/05/2026"];

  for (let i = 3; i < 20; i++) rows[i] = [];

  rows[20] = ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"];
  rows[21] = [];

  rows[22] = ["2026-05-02", "UPI-RAVI KUMAR-ravi@okaxis-REF-NOTE", "", "", "", 8000, 8129];
  rows[23] = ["2026-05-03", "ACH D-HDFC0000123-PARAG PARIKH FLEX CAP-DIRECT", "", "", 7700, "", 429];
  rows[24] = ["2026-05-04", "POS 1234 0504 1200 MUMBAI NETFLIX ENTERTAINMENT", "", "", 295.78, "", 133.22];
  rows[25] = ["2026-05-04", "UPI-SENDER-sender@paytm-REF", "", "", "", 2400, 2533.22];
  rows[26] = ["2026-05-04", "POS 1234 0504 1400 MUMBAI NETFLIX INDIA", "", "", 2326.78, "", 206.44];
  rows[27] = ["2026-05-11", "IMPS-5098123456789-RANDOM SENDER-BANK-REF", "", "", "", 3800, 4006.44];
  rows[28] = [
    "2026-05-11",
    `NEFT CR-HDFC0000123-${opts.employerName}-SALARY MAY-NEFTREF`,
    "",
    "",
    "",
    63000,
    67006.44,
  ];
  rows[29] = [
    "2026-05-12",
    `NEFT CR-HDFC0000123-${opts.employerName}-SALARY ARREARS-NEFTREF`,
    "",
    "",
    "",
    15993,
    82999.44,
  ];

  rows[30] = ["*** END OF STATEMENT ***"];
  rows[31] = [];
  rows[32] = ["Opening Balance", "", "", "", "", "", 129, ""];
  rows[33] = ["Closing Balance", "", "", "", "", "", 82999.44, ""];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseHdfcXls", () => {
  const employerName = "ACME CORP";

  const expectedTransactions = [
    { date: "2026-05-02", direction: "credit", amount: 8000, suggestedType: "additional_credit", suggestedCategory: "UPI Transfer Received" },
    { date: "2026-05-03", direction: "debit", amount: 7700, suggestedType: "investment_debit", suggestedCategory: "SIP / Auto-Debit / EMI" },
    { date: "2026-05-04", direction: "debit", amount: 295.78, suggestedType: "expense", suggestedCategory: "Subscriptions" },
    { date: "2026-05-04", direction: "credit", amount: 2400, suggestedType: "additional_credit", suggestedCategory: "UPI Transfer Received" },
    { date: "2026-05-04", direction: "debit", amount: 2326.78, suggestedType: "expense", suggestedCategory: "Subscriptions" },
    { date: "2026-05-11", direction: "credit", amount: 3800, suggestedType: "additional_credit", suggestedCategory: "IMPS Received" },
    { date: "2026-05-11", direction: "credit", amount: 63000, suggestedType: "salary_credit", suggestedCategory: "Salary" },
    { date: "2026-05-12", direction: "credit", amount: 15993, suggestedType: "salary_credit", suggestedCategory: "Salary" },
  ];

  it("parses fixture and classifies transactions", () => {
    const buf = buildHdfcFixtureWorkbook({ employerName });
    const parsed = parseHdfcXls(buf, { employerName });

    expect(parsed.bankName.toUpperCase()).toContain("HDFC");
    expect(parsed.accountHolder).toContain("Test User");
    expect(parsed.transactions).toHaveLength(expectedTransactions.length);

    for (let i = 0; i < expectedTransactions.length; i++) {
      const a = parsed.transactions[i]!;
      const e = expectedTransactions[i]!;
      expect(a.date).toBe(e.date);
      expect(a.direction).toBe(e.direction);
      expect(a.amount).toBeCloseTo(e.amount, 2);
      expect(a.suggestedType).toBe(e.suggestedType);
      expect(a.suggestedCategory).toBe(e.suggestedCategory);
    }

    const totalDebits = parsed.transactions.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
    const totalCredits = parsed.transactions.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
    expect(totalDebits).toBeCloseTo(10322.56, 2);
    expect(totalCredits).toBeCloseTo(93193, 2);

    expect(parsed.openingBalance).toBeCloseTo(129, 2);
    expect(parsed.closingBalance).toBeCloseTo(82999.44, 2);
  });

  it("parses HDFC export with DD/MM/YY dates and asterisk separator row after header", () => {
    const rows: unknown[][] = [];
    rows[0] = ["HDFC BANK Ltd.                                      Page No .:   1"];
    for (let i = 1; i < 19; i++) rows[i] = [];
    rows[19] = ["********************************************************************************************************************************************************************************************"];
    rows[20] = ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"];
    rows[21] = ["********", "**********************************", "************", "********", "******************", "******************", "******************"];
    rows[22] = ["02/05/26", "UPI-PAVAN VINAYAK PATIL-THEPAVANPATIL@AXL-REF", "", "02/05/26", "", 8000, 8129];
    rows[23] = ["03/05/26", "ACH D- T05153100925012726-MANDATE", "", "03/05/26", 7700, "", 429];
    rows[24] = [""];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseHdfcXls(buf);
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]?.date).toBe("2026-05-02");
    expect(parsed.transactions[1]?.date).toBe("2026-05-03");
  });

  it("marks ACH without known fund as requiresFundName", () => {
    const rows: unknown[][] = [];
    rows[0] = ["HDFC BANK"];
    for (let i = 1; i < 20; i++) rows[i] = [];
    rows[20] = ["Date", "Narration", "", "", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"];
    rows[21] = [];
    rows[22] = ["2026-05-03", "ACH D-HDFC0000123-UNKNOWN MANDATE", "", "", 100, "", 900];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseHdfcXls(buf);
    expect(parsed.transactions[0]?.requiresFundName).toBe(true);
  });
});
