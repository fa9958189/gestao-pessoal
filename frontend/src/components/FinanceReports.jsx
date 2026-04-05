import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
);

const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr'];

const getMonthKey = (date) => {
  const parsed = date ? new Date(date) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const getRecentMonthKeys = (total = 4) => {
  const now = new Date();
  return Array.from({ length: total }, (_, index) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (total - 1 - index), 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  });
};

export default function FinanceReports({ summary, users, formatCurrency }) {
  const safeUsers = Array.isArray(users) ? users : [];

  const paidUsers = Number(summary?.paidUsers || 0);
  const pendingUsers = Math.max(safeUsers.length - paidUsers, 0);

  const revenueByMonth = useMemo(() => {
    const keys = getRecentMonthKeys(4);
    const totals = keys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

    safeUsers.forEach((user) => {
      const monthKey = getMonthKey(user.last_paid_at);
      if (!monthKey || !(monthKey in totals)) return;
      const planValue = Number(user.plan_monthly_value || 0);
      if (planValue > 0) {
        totals[monthKey] += planValue;
      }
    });

    const values = keys.map((key) => totals[key]);
    const hasValues = values.some((value) => value > 0);
    if (hasValues) return values;

    const fallbackValue = Number(summary?.totalReceivedMonth || 0);
    return [0, 0, 0, fallbackValue];
  }, [safeUsers, summary?.totalReceivedMonth]);

  const revenueData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Faturamento',
        data: revenueByMonth,
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        borderRadius: 8,
      },
    ],
  };

  const usersData = {
    labels: ['Pagos', 'Pendentes'],
    datasets: [
      {
        data: [paidUsers, pendingUsers],
        backgroundColor: ['rgba(34, 197, 94, 0.8)', 'rgba(234, 179, 8, 0.8)'],
        borderColor: ['rgba(34, 197, 94, 1)', 'rgba(234, 179, 8, 1)'],
        borderWidth: 1,
      },
    ],
  };

  const growthData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Crescimento',
        data: revenueByMonth,
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
      },
    ],
  };

  return (
    <div className="reports-container">
      <div className="financial-summary">
        <div className="financial-summary-card card-finance card-success financial-summary-green">
          Total recebido: {formatCurrency(summary?.totalReceivedMonth || 0)}
        </div>
        <div className="financial-summary-card card-finance card-warning financial-summary-yellow">
          Total pendente: {formatCurrency(summary?.totalPending || 0)}
        </div>
        <div className="financial-summary-card card-finance card-danger financial-summary-red">
          Total atrasado: {formatCurrency(summary?.totalOverdue || 0)}
        </div>
        <div className="financial-summary-card card-finance">Usuários pagos: {paidUsers}</div>
        <div className="financial-summary-card card-finance">Usuários pendentes: {pendingUsers}</div>
        <div className="financial-summary-card card-finance">
          Receita estimada: {formatCurrency(summary?.estimatedMonthlyRevenue || 0)}
        </div>
      </div>

      <div className="reports-grid">
        <section className="card card-finance report-chart-card">
          <h3 className="title">📊 Faturamento mensal</h3>
          <Bar data={revenueData} />
        </section>

        <section className="card card-finance report-chart-card">
          <h3 className="title">🥧 Usuários pagos vs não pagos</h3>
          <Pie data={usersData} />
        </section>

        <section className="card card-finance report-chart-card report-chart-wide">
          <h3 className="title">📈 Crescimento</h3>
          <Line data={growthData} />
        </section>
      </div>
    </div>
  );
}
