import { createClient } from "@/lib/supabase/server";
import { loadMonthSummaryBundle } from "@/lib/queries/monthSummary";
import { monthKeyFromDate } from "@/lib/month";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { MonthlyBankImportButton } from "@/components/import/MonthlyBankImportButton";
import {
  submitCloseMonthForm,
  submitCreditForm,
  submitExpenseForm,
  submitInvestmentForm,
  submitSalaryForm,
} from "@/app/actions/ledger";

function formatInrFromPaise(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthKeyFromDate(new Date());

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const bundle = await loadMonthSummaryBundle(supabase, { userId: user.id, month });
  const s = bundle.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Monthly Entry</h1>
          <p className="text-xs text-zinc-600">Month {month}</p>
        </div>
        <form className="flex items-end gap-2" action="/monthly" method="get">
          <div className="space-y-1">
            <Label htmlFor="month">Month</Label>
            <Input id="month" name="month" type="month" defaultValue={month} className="w-44" />
          </div>
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
      </div>

      <div className="sticky top-0 z-10 border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <MonthlyBankImportButton defaultMonth={month} />
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <div className="text-[11px] font-medium text-zinc-600">Salary</div>
            <div className="text-sm font-semibold">{formatInrFromPaise(s.salaryPaise)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-zinc-600">Credits</div>
            <div className="text-sm font-semibold">{formatInrFromPaise(s.additionalCreditsPaise)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-zinc-600">Outflows</div>
            <div className="text-sm font-semibold">
              {formatInrFromPaise(s.investmentsPaise + s.expensesPaise)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-zinc-600">Remaining (computed)</div>
            <div className="text-sm font-semibold">{formatInrFromPaise(s.remainingBalancePaise)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link className="text-xs underline" href="/imports">
          Quick import from bank
        </Link>
        <Link className="text-xs underline" href={`/api/export?kind=month&month=${month}`}>
          Export month CSV
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary & credits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <form action={submitSalaryForm} className="space-y-2 rounded-md border border-zinc-200 p-3">
            <input type="hidden" name="month" value={month} />
            <div className="text-xs font-medium">Set salary (INR)</div>
            <Input name="rupees" type="number" step="0.01" placeholder="e.g. 85000" required />
            <Button type="submit" size="sm">
              Save salary
            </Button>
          </form>

          <form action={submitCreditForm} className="space-y-2 rounded-md border border-zinc-200 p-3">
            <input type="hidden" name="month" value={month} />
            <div className="text-xs font-medium">Add credit (INR)</div>
            <Input name="rupees" type="number" step="0.01" required />
            <Input name="description" placeholder="Bonus, reimbursement…" />
            <Button type="submit" size="sm" variant="outline">
              Add credit
            </Button>
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="investments">
        <TabsList>
          <TabsTrigger value="investments">Investments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="investments" className="space-y-3">
          <form action={submitInvestmentForm} className="space-y-2 rounded-md border border-zinc-200 p-3">
            <input type="hidden" name="month" value={month} />
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Amount (INR)</Label>
                <Input name="rupees" type="number" step="0.01" required />
              </div>
              <div className="space-y-1">
                <Label>Kind</Label>
                <select
                  name="kind"
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm"
                  defaultValue="mutual_fund"
                >
                  <option value="mutual_fund">Mutual fund</option>
                  <option value="gold">Gold</option>
                  <option value="fd">FD</option>
                  <option value="stock">Stock</option>
                  <option value="ppf">PPF</option>
                  <option value="nps">NPS</option>
                  <option value="cash_carry_forward">Cash carry-forward</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Account / source</Label>
                <Input name="account" placeholder="Zerodha, Groww, bank…" required />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Scheme code (optional)</Label>
                <Input name="scheme" placeholder="mfapi.in scheme code" />
              </div>
            </div>
            <Button type="submit" size="sm">
              Add investment
            </Button>
          </form>

          <div className="overflow-x-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {bundle.investments.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2">{row.kind}</td>
                    <td className="px-3 py-2">{formatInrFromPaise(row.amount_paise)}</td>
                    <td className="px-3 py-2">{row.source}</td>
                    <td className="px-3 py-2">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-3">
          <form action={submitExpenseForm} className="space-y-2 rounded-md border border-zinc-200 p-3">
            <input type="hidden" name="month" value={month} />
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Amount (INR)</Label>
                <Input name="rupees" type="number" step="0.01" required />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <select name="categoryId" className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm" required>
                  {bundle.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Merchant</Label>
                <Input name="merchant" placeholder="Optional" />
              </div>
            </div>
            <Button type="submit" size="sm">
              Add expense
            </Button>
          </form>

          <div className="overflow-x-auto rounded-md border border-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Merchant</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {bundle.expenses.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2">{formatInrFromPaise(row.amount_paise)}</td>
                    <td className="px-3 py-2">{row.merchant_name ?? "—"}</td>
                    <td className="px-3 py-2">{row.source}</td>
                    <td className="px-3 py-2">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Month close</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          <p>Closing generates carry-forward into the next month and locks this month.</p>
          <form action={submitCloseMonthForm}>
            <input type="hidden" name="month" value={month} />
            <Button type="submit" variant="outline" size="sm">
              Close month
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
