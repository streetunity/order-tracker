export default function EntityList({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  accounts,
  orders,
  getCurrentEntities,
  selectedEntity,
  setSelectedEntity,
  setEntityType
}) {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="entity-list-sidebar">
      {/* Tabs */}
      <div className="entity-tabs">
        <button
          onClick={() => setActiveTab('customers')}
          className={activeTab === 'customers' ? 'active' : ''}
        >
          Customers ({accounts.length})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={activeTab === 'orders' ? 'active' : ''}
        >
          Orders ({orders.length})
        </button>
      </div>

      {/* Search */}
      <div className="entity-search">
        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Entity List */}
      <div className="entity-list">
        {getCurrentEntities().map((entity) => {
          const isCustomer = activeTab === 'customers';
          const isSelected = selectedEntity?.id === entity.id;
          
          return (
            <div
              key={entity.id}
              onClick={() => {
                setSelectedEntity(entity);
                setEntityType(isCustomer ? 'account' : 'order');
              }}
              className={`entity-card ${isSelected ? 'selected' : ''}`}
            >
              <div className="entity-name">
                {isCustomer ? entity.name : (entity.account?.name || 'Unknown Customer')}
              </div>
              <div className="entity-details">
                {isCustomer ? (entity.email || 'No email') : `PO: ${entity.poNumber || 'N/A'}`}
              </div>
              <div className="entity-meta">
                {isCustomer 
                  ? `Created ${formatDate(entity.createdAt)}`
                  : `${entity.items?.length || 0} items • ${entity.currentStage}`
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
