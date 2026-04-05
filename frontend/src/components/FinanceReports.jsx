import React, { useEffect, useMemo, useState } from 'react';
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

const defaultReports = Object.freeze({
  revenueByAffiliate: [],
  usersStatus: { paid: 0, pending: 0 },
  overdueCount: 0,
  monthlyRevenue: [],
});

const formatMonth = (monthValue) => {
  if (!monthValue) return '';
  const parsed = new Date(monthValue);
  if (Number.isNaN(parsed.getTime())) return String(monthValue);
  return parsed.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

export default function FinanceReports({ formatCurrency, apiBase, getAccessToken }) {
  const [reports, setReports] = useState(defaultReports);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadReports = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const accessToken = await getAccessToken?.();
        const response = await fetch(`${apiBase}/admin/finance/reports`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || 'Erro ao carregar relatórios financeiros.');
        }
        if (isMounted) {
          setReports({
            revenueByAffiliate: Array.isArray(body?.revenueByAffiliate) ? body.revenueByAffiliate : [],
            usersStatus: {
              paid: Number(body?.usersStatus?.paid || 0),
              pending: Number(body?.usersStatus?.pending || 0),
            },
            overdueCount: Number(body?.overdueCount || 0),
            monthlyRevenue: Array.isArray(body?.monthlyRevenue) ? body.monthlyRevenue : [],
          });
        }
      } catch (err) {
        if (isMounted) {
          setLoadError(err?.message || 'Erro ao carregar relatórios financeiros.');
          setReports(defaultReports);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    if (apiBase) loadReports();

    return () => {
      isMounted = false;
    };
  }, [apiBase, getAccessToken]);

  const affiliateGrowthData = useMemo(() => ({
    labels: reports.revenueByAffiliate.map((a) => a.affiliate_id || 'Sem afiliado'),
    datasets: [{
      label: 'Receita por afiliado',
      data: reports.revenueByAffiliate.map((a) => Number(a.total_revenue || 0)),
      backgroundColor: 'rgba(37, 99, 235, 0.55)',
      borderColor: 'rgba(96, 165, 250, 1)',
      borderWidth: 1,
      borderRadius: 8,
    }],
  }), [reports.revenueByAffiliate]);

  const usersData = {
    labels: ['Pagos', 'Pendentes'],
    datasets: [
      {
        data: [reports.usersStatus.paid, reports.usersStatus.pending],
        backgroundColor: ['rgba(34, 197, 94, 0.8)', 'rgba(234, 179, 8, 0.8)'],
        borderColor: ['rgba(34, 197, 94, 1)', 'rgba(234, 179, 8, 1)'],
        borderWidth: 1,
      },
    ],
  };

  const monthlyData = useMemo(() => ({
    labels: reports.monthlyRevenue.map((m) => formatMonth(m.month)),
    datasets: [{
      label: 'Faturamento mensal',
      data: reports.monthlyRevenue.map((m) => Number(m.revenue || 0)),
      borderColor: 'rgba(16, 185, 129, 1)',
      backgroundColor: 'rgba(16, 185, 129, 0.2)',
      tension: 0.3,
      fill: true,
      pointRadius: 4,
    }],
  }), [reports.monthlyRevenue]);

  const ranking = useMemo(
    () => [...reports.revenueByAffiliate].sort((a, b) => Number(b.total_revenue || 0) - Number(a.total_revenue || 0)),
    [reports.revenueByAffiliate],
  );

  const META = 5000;
  const faturamentoAtual = reports.monthlyRevenue.reduce((acc, month) => acc + Number(month.revenue || 0), 0);
  const progresso = Math.min((faturamentoAtual / META) * 100, 100);

  if (isLoading) {
    return <div className="report-loading">Carregando relatórios...</div>;
  }

  return (
    <div className="reports-container reports-finance-theme">
      {loadError && <div className="financial-summary-card card-finance financial-summary-red">{loadError}</div>}
      <div className="financial-summary">
        <div className="financial-summary-card card-finance">Usuários pagos: {reports.usersStatus.paid}</div>
        <div className="financial-summary-card card-finance">Usuários pendentes: {reports.usersStatus.pending}</div>
        <div className="financial-summary-card card-finance">Afiliados mapeados: {reports.revenueByAffiliate.length}</div>
      </div>

      {reports.overdueCount > 0 && (
        <div className="financial-summary-card card-finance financial-summary-red finance-alert-card">
          ⚠️ Você tem {reports.overdueCount} usuários em atraso
        </div>
      )}

      <section className="card card-finance report-chart-card finance-meta-card">
        <h3 className="title">🎯 Meta mensal</h3>
        <div className="meta-bar">
          <div className="meta-progress" style={{ width: `${progresso}%` }} />
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          {formatCurrency(faturamentoAtual)} / {formatCurrency(META)}
        </p>
      </div>

      <div className="reports-grid">
        <section className="card card-finance report-chart-card">
          <h3 className="title">📈 Crescimento por afiliado</h3>
          <Bar data={affiliateGrowthData} />
        </section>

        <section className="card card-finance report-chart-card">
          <h3 className="title">🥧 Usuários pagos vs não pagos</h3>
          <Pie data={usersData} />
        </section>

        <section className="card card-finance report-chart-card report-chart-wide">
          <h3 className="title">📊 Faturamento mensal</h3>
          <Line data={monthlyData} />
        </section>

        <section className="card card-finance report-chart-card report-chart-wide">
          <h3 className="title">🏆 Ranking de afiliados</h3>
          <div className="finance-ranking-list">
            {ranking.length === 0 && <p className="muted">Nenhum afiliado com receita registrada.</p>}
            {ranking.map((affiliate, index) => (
              <p key={`${affiliate.affiliate_id || 'none'}-${index}`} className="finance-ranking-item">
                {index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐'} #{index + 1}{' '}
                {affiliate.affiliate_id || 'Sem afiliado'} - {formatCurrency(affiliate.total_revenue || 0)}
              </p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
