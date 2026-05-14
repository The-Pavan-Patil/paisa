"use client";

import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#18181b", "#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8"];

export function DashboardCharts(props: {
  trend: Array<{
    month: string;
    salary: number;
    credits: number;
    expenses: number;
    investments: number;
    remaining: number;
  }>;
  categoryDonut: Array<{ name: string; amount_paise: number }>;
  portfolioDonut: Array<{ name: string; value: number }>;
}) {
  const trendData = props.trend.map((t) => ({
    ...t,
    salaryInr: t.salary / 100,
    creditsInr: t.credits / 100,
    expensesInr: t.expenses / 100,
    investmentsInr: t.investments / 100,
    remainingInr: t.remaining / 100,
  }));

  const catData = props.categoryDonut.map((c) => ({
    name: c.name,
    value: c.amount_paise / 100,
  }));

  const portData = props.portfolioDonut;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <div className="mb-2 text-xs font-medium text-zinc-700">12-month flows (INR)</div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#71717a" />
              <YAxis tick={{ fontSize: 10 }} stroke="#71717a" width={44} />
              <Tooltip formatter={(v: number) => v.toFixed(2)} />
              <Line type="monotone" dataKey="salaryInr" stroke="#18181b" dot={false} name="Salary" />
              <Line type="monotone" dataKey="creditsInr" stroke="#52525b" dot={false} name="Credits" />
              <Line type="monotone" dataKey="expensesInr" stroke="#a1a1aa" dot={false} name="Expenses" />
              <Line type="monotone" dataKey="investmentsInr" stroke="#3f3f46" dot={false} name="Investments" />
              <Line type="monotone" dataKey="remainingInr" stroke="#000" dot={false} name="Remaining" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <div className="mb-2 text-xs font-medium text-zinc-700">Expense categories (INR)</div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={catData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {catData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => v.toFixed(2)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 lg:col-span-2">
        <div className="mb-2 text-xs font-medium text-zinc-700">Portfolio allocation (principal, INR)</div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={portData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {portData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => v.toFixed(2)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
