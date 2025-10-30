'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import './reports.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function CommissionReportsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'table'
  
  // Report data states
  const [ytdData, setYtdData] = useState({
    totalCalculated: 0,
    totalPaid: 0,
    totalPending: 0,
    totalProjected: 0
  });
  const [monthlyData, setMonthlyData] = useState([]);
  const [agentData, setAgentData] = useState([]);
  const [agents, setAgents] = useState([]);

  // Check authorization
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!['SUPER_ADMIN', 'ACCOUNTANT'].includes(user.role)) {
      router.push('/admin');
      return;
    }
  }, [user, router]);

  // Fetch report data
  useEffect(() => {
    fetchReportData();
  }, [selectedYear, selectedAgent]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const headers = { 'x-auth-token': localStorage.getItem('token') };
      
      // Fetch YTD summary
      const ytdRes = await fetch(
        `/api/commissions/reports/ytd?year=${selectedYear}${selectedAgent !== 'all' ? `&salesPersonName=${selectedAgent}` : ''}`,
        { headers }
      );
      if (ytdRes.ok) {
        setYtdData(await ytdRes.json());
      }

      // Fetch monthly breakdown
      const monthlyRes = await fetch(
        `/api/commissions/reports/monthly?year=${selectedYear}${selectedAgent !== 'all' ? `&salesPersonName=${selectedAgent}` : ''}`,
        { headers }
      );
      if (monthlyRes.ok) {
        setMonthlyData(await monthlyRes.json());
      }

      // Fetch by-agent data (only if viewing all agents)
      if (selectedAgent === 'all') {
        const agentRes = await fetch(
          `/api/commissions/reports/by-rep?year=${selectedYear}`,
          { headers }
        );
        if (agentRes.ok) {
          setAgentData(await agentRes.json());
        }
      }

      // Fetch agent list for filter
      const agentsRes = await fetch('/api/commission-settings/rates', { headers });
      if (agentsRes.ok) {
        const ratesData = await agentsRes.json();
        setAgents(ratesData.map(r => ({ name: r.salesPersonName, rate: r.rate })));
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = async () => {
    try {
      const headers = { 'x-auth-token': localStorage.getItem('token') };
      const res = await fetch(
        `/api/commissions/reports/export-csv?year=${selectedYear}${selectedAgent !== 'all' ? `&salesPersonName=${selectedAgent}` : ''}`,
        { headers }
      );
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `commission-report-${selectedYear}${selectedAgent !== 'all' ? `-${selectedAgent}` : ''}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error exporting CSV:', err);
      alert('Failed to export CSV');
    }
  };

  const exportPDF = async () => {
    try {
      const headers = { 'x-auth-token': localStorage.getItem('token') };
      const res = await fetch(
        `/api/commissions/reports/export-pdf?year=${selectedYear}${selectedAgent !== 'all' ? `&salesPersonName=${selectedAgent}` : ''}`,
        { headers }
      );
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `commission-report-${selectedYear}${selectedAgent !== 'all' ? `-${selectedAgent}` : ''}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert('Failed to export PDF');
    }
  };

  // Chart configurations
  const monthlyChartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: 'Paid',
        data: monthlyData.map(m => m.paid || 0),
        backgroundColor: '#10b981',
        borderColor: '#10b981',
        borderWidth: 2,
        borderRadius: 4,
      },
      {
        label: 'Pending',
        data: monthlyData.map(m => m.pending || 0),
        backgroundColor: '#f59e0b',
        borderColor: '#f59e0b',
        borderWidth: 2,
        borderRadius: 4,
      }
    ]
  };

  const monthlyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { color: '#ffffff' }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `${context.dataset.label}: $${context.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: '#333333' },
        ticks: { color: '#999999' }
      },
      y: {
        grid: { color: '#333333' },
        ticks: {
          color: '#999999',
          callback: (value) => `$${value.toLocaleString()}`
        }
      }
    }
  };

  const agentChartData = {
    labels: agentData.slice(0, 10).map(a => a.salesPersonName),
    datasets: [{
      data: agentData.slice(0, 10).map(a => a.total),
      backgroundColor: [
        '#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
        '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
      ],
      borderWidth: 0
    }]
  };

  const agentChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `$${context.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="reports-container">
        <div className="loading-spinner">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h1>Commission Reports</h1>
        <div className="header-actions">
          <button onClick={() => router.push('/admin/commissions')} className="btn btn-secondary">
            Back to Commissions
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="reports-filters">
        <div className="filter-group">
          <label>Year:</label>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Sales Rep:</label>
          <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
            <option value="all">All Sales Reps</option>
            {agents.map(agent => (
              <option key={agent.name} value={agent.name}>{agent.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-actions">
          <button onClick={exportCSV} className="btn btn-primary">
            Export CSV
          </button>
          <button onClick={exportPDF} className="btn btn-secondary">
            Export PDF
          </button>
        </div>
      </div>

      {/* YTD Overview Cards */}
      <div className="reports-overview">
        <div className="overview-card">
          <div className="card-label">Total Calculated</div>
          <div className="card-value">${ytdData.totalCalculated.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="overview-card">
          <div className="card-label">Total Paid</div>
          <div className="card-value success">${ytdData.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="overview-card">
          <div className="card-label">Pending</div>
          <div className="card-value warning">${ytdData.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="overview-card">
          <div className="card-label">Projected</div>
          <div className="card-value">${ytdData.totalProjected.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="reports-section">
        <div className="section-header">
          <h2>Monthly Breakdown</h2>
          <div className="view-toggle">
            <button 
              className={`toggle-btn ${viewMode === 'chart' ? 'active' : ''}`}
              onClick={() => setViewMode('chart')}
            >
              Chart View
            </button>
            <button 
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table View
            </button>
          </div>
        </div>
        
        {viewMode === 'chart' ? (
          <div className="chart-container" style={{ height: '400px' }}>
            <Bar data={monthlyChartData} options={monthlyChartOptions} />
          </div>
        ) : (
          <table className="reports-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Calculated</th>
                <th>Paid</th>
                <th>Pending</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((month, index) => (
                <tr key={index}>
                  <td>{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index]}</td>
                  <td>${(month.calculated || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="success">${(month.paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="warning">${(month.pending || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="total">${((month.calculated || 0) + (month.paid || 0) + (month.pending || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* By Sales Rep (only show when viewing all) */}
      {selectedAgent === 'all' && agentData.length > 0 && (
        <div className="reports-section">
          <h2>By Sales Rep</h2>
          
          <div className="agent-reports-grid">
            <div className="agent-chart" style={{ height: '400px' }}>
              <Doughnut data={agentChartData} options={agentChartOptions} />
            </div>
            
            <table className="reports-table agent-table">
              <thead>
                <tr>
                  <th>Sales Person</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {agentData.map(agent => {
                  const totalSum = agentData.reduce((sum, a) => sum + a.total, 0);
                  const percentage = totalSum > 0 ? (agent.total / totalSum * 100).toFixed(1) : 0;
                  return (
                    <tr key={agent.salesPersonName}>
                      <td>
                        <button 
                          className="agent-link"
                          onClick={() => setSelectedAgent(agent.salesPersonName)}
                        >
                          {agent.salesPersonName}
                        </button>
                      </td>
                      <td className="total">${agent.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="success">${agent.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="warning">${agent.pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td>{percentage}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="total">${agentData.reduce((sum, a) => sum + a.total, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="success">${agentData.reduce((sum, a) => sum + a.paid, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="warning">${agentData.reduce((sum, a) => sum + a.pending, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
