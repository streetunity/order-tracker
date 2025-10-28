// Centralized API service for order-related operations
// This keeps all API calls in one place for easier maintenance

export const orderApi = {
  // Fetch order details
  async getOrder(id, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { 
      cache: "no-store",
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // Update order fields
  async updateOrder(id, updates, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(updates)
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    
    return await res.json();
  },

  // Update internal notes
  async updateInternalNotes(id, internalNotes, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}/internal-notes`, {
      method: "PATCH",
      headers: { 
        "content-type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({ internalNotes }),
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  },

  // Lock order
  async lockOrder(id, reason, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}/lock`, {
      method: "POST",
      headers: { 
        "content-type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  },

  // Unlock order
  async unlockOrder(id, reason, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}/unlock`, {
      method: "POST",
      headers: { 
        "content-type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({ reason })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  },

  // Get sales agents
  async getSalesAgents(getAuthHeaders) {
    const res = await fetch('/api/users/sales-reps', {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  // Get active manufacturers
  async getManufacturers(getAuthHeaders) {
    const res = await fetch('/api/manufacturers/active', {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
};

export const itemApi = {
  // Add item to order
  async addItem(orderId, item, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/items`, {
      method: "POST",
      headers: { 
        "content-type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(item),
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    
    return await res.json();
  },

  // Update item
  async updateItem(orderId, itemId, updates, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { 
        "content-type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(updates),
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    
    return await res.json();
  },

  // Delete item
  async deleteItem(orderId, itemId, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    
    if (!res.ok && res.status !== 204) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  },

  // Mark item as ordered
  async markItemOrdered(orderId, itemId, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/ordered`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders()
      }
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  },

  // Unmark item as ordered
  async unmarkItemOrdered(orderId, itemId, reason, getAuthHeaders) {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/unordered`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({ reason: reason.trim() })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  }
};
