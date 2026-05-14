import { parsePaise } from "@/lib/money";

export interface MonthLedgerInputs {
  salaryPaise: number;
  additionalCreditsPaise: number;
  carryForwardInPaise: number;
  investmentsPaise: number;
  expensesPaise: number;
}

export interface MonthSummary extends MonthLedgerInputs {
  totalAvailablePaise: number;
  totalOutflowPaise: number;
  remainingBalancePaise: number;
  /** PRD canonical: (totalAvailable - expenses) / totalAvailable, 0 if denominator <= 0 */
  savingsRate: number;
}

export function computeMonthSummary(input: MonthLedgerInputs): MonthSummary {
  const salaryPaise = Math.max(0, Math.trunc(input.salaryPaise));
  const additionalCreditsPaise = Math.max(0, Math.trunc(input.additionalCreditsPaise));
  const carryForwardInPaise = Math.max(0, Math.trunc(input.carryForwardInPaise));
  const investmentsPaise = Math.max(0, Math.trunc(input.investmentsPaise));
  const expensesPaise = Math.max(0, Math.trunc(input.expensesPaise));

  const totalAvailablePaise = salaryPaise + additionalCreditsPaise + carryForwardInPaise;
  const totalOutflowPaise = investmentsPaise + expensesPaise;
  const remainingBalancePaise = totalAvailablePaise - totalOutflowPaise;

  const savingsRate =
    totalAvailablePaise > 0
      ? (totalAvailablePaise - expensesPaise) / totalAvailablePaise
      : 0;

  return {
    salaryPaise,
    additionalCreditsPaise,
    carryForwardInPaise,
    investmentsPaise,
    expensesPaise,
    totalAvailablePaise,
    totalOutflowPaise,
    remainingBalancePaise,
    savingsRate,
  };
}

/** Normalize DB bigint/string fields before summary */
export function computeMonthSummaryFromRows(params: {
  salary: unknown;
  credits: unknown[];
  carryIn: unknown;
  investments: unknown[];
  expenses: unknown[];
}): MonthSummary {
  const salaryPaise = parsePaise(params.salary as string | number);
  const additionalCreditsPaise = params.credits.reduce(
    (acc: number, v) => acc + parsePaise(v as string | number),
    0,
  );
  const carryForwardInPaise = parsePaise(params.carryIn as string | number);
  const investmentsPaise = params.investments.reduce(
    (acc: number, v) => acc + parsePaise(v as string | number),
    0,
  );
  const expensesPaise = params.expenses.reduce(
    (acc: number, v) => acc + parsePaise(v as string | number),
    0,
  );

  return computeMonthSummary({
    salaryPaise,
    additionalCreditsPaise,
    carryForwardInPaise,
    investmentsPaise,
    expensesPaise,
  });
}
