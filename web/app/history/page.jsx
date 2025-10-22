'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import EntityList from '@/components/history/EntityList';
import AuditLogViewer from '@/components/history/AuditLogViewer';
import './history.css';

export default function AuditHistoryViewer() {
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Enhanced features state
  const [activeTab, setActiveTab] = useState('customers');
  const [searchQuery, setSearchQuery] = useState('');
  
  const router = useRouter();
  const { user, getAuthHeaders, isAdmin } = useAuth();

  // Redirect to login if not authenticated or not admin
  useEffect(() => {
    if (!user) {
      router.push('/login');
    } else if (!isAdmin) {
      router.push('/admin/board');
    }
  }, [user, isAdmin, router]);

  async function loadData() {
    if (!user || !isAdmin) return;
    
    try {
      const ordersRes = await fetch('/api/orders', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      }

      const accountsRes = await fetch('/api/accounts', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLogs(entityId) {
    if (!user || !isAdmin) return;
    
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/audit/${entityId}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (user && isAdmin) {
      loadData();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (selectedEntity && user && isAdmin) {
      loadAuditLogs(selectedEntity.id);
    }
  }, [selectedEntity, user, isAdmin]);

  // Filter entities based on search
  const filteredAccounts = accounts.filter(acc => 
    acc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOrders = orders.filter(order => 
    order.poNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.account?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get current entities based on active tab
  const getCurrentEntities = () => {
    if (activeTab === 'customers') return filteredAccounts;
    if (activeTab === 'orders') return filteredOrders;
    return [];
  };

  // Don't render until authentication is checked
  if (!user || !isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="history-loading">
        <div>Loading audit history...</div>
      </div>
    );
  }

  return (
    <>
      <TopNav />
      <div className="history-container">
        <div className="history-content">
          {/* Header */}
          <div className="history-header">
            <h1>Audit History</h1>
          </div>

          <div className="history-grid">
            {/* Left Sidebar - Entity List */}
            <EntityList
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              accounts={accounts}
              orders={orders}
              getCurrentEntities={getCurrentEntities}
              selectedEntity={selectedEntity}
              setSelectedEntity={setSelectedEntity}
              setEntityType={setEntityType}
            />

            {/* Right Panel - Audit Logs */}
            <AuditLogViewer
              selectedEntity={selectedEntity}
              entityType={entityType}
              auditLogs={auditLogs}
              logsLoading={logsLoading}
              activeTab={activeTab}
            />
          </div>
        </div>
      </div>
    </>
  );
}
