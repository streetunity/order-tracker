// API service layer for Add New Order page
// Handles all API calls related to creating orders

export const orderApi = {
  // Load customer accounts
  async loadAccounts(getAuthHeaders) {
    const res = await fetch('/api/accounts', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to load accounts');
    return res.json();
  },

  // Load sales representatives
  async loadSalesReps(getAuthHeaders) {
    const res = await fetch('/api/users/sales-reps', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      // Return empty array if endpoint fails
      return [];
    }
    return res.json();
  },

  // Load active manufacturers
  async loadManufacturers(getAuthHeaders) {
    try {
      const res = await fetch('/api/manufacturers/active', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        return res.json();
      }
      return [];
    } catch (e) {
      console.error('Failed to load manufacturers:', e);
      return [];
    }
  },

  // Create a new order
  async createOrder(orderData, getAuthHeaders) {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        accountId: orderData.accountId,
        poNumber: orderData.poNumber?.trim() || null,
        sku: orderData.salesPerson, // Sales person stored in sku field
        orderDate: orderData.orderDate,
        discount: orderData.discount && orderData.discount.trim() ? parseFloat(orderData.discount.trim()) : 0
      })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create order');
    }

    return res.json();
  },

  // Add an item to an order
  async addItemToOrder(orderId, item, getAuthHeaders) {
    const itemData = {
      productCode: item.name.trim(), // API expects productCode, not name
      qty: item.qty.trim() ? parseInt(item.qty.trim()) : 1,
      serialNumber: item.serialNumber?.trim() || null,
      modelNumber: item.modelNumber?.trim(),
      manufacturerId: item.manufacturerId || null,
      voltage: item.voltage?.trim(),
      laserWattage: item.power?.trim(), // API expects laserWattage, not power
      notes: item.notes?.trim() || null,
      itemPrice: parseFloat(item.itemPrice?.trim()),
      privateItemNote: item.privateItemNote?.trim() || null,
      hasExtendedShipping: item.hasExtendedShipping || false
    };

    const res = await fetch(`/api/orders/${orderId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(itemData)
    });

    if (!res.ok) {
      const data = await res.json();
      console.error('Failed to add item:', data.error);
      throw new Error(data.error || 'Failed to add item');
    }

    return res.json();
  },

  // Create order with items (orchestrates the full flow)
  async createOrderWithItems(formData, items, getAuthHeaders) {
    // Create the order first
    const order = await this.createOrder(formData, getAuthHeaders);
    
    // Add all valid items to the order
    const validItems = items.filter(item => item.name.trim());
    const addedItems = [];
    const failedItems = [];
    
    for (const item of validItems) {
      try {
        const addedItem = await this.addItemToOrder(order.id, item, getAuthHeaders);
        addedItems.push(addedItem);
      } catch (error) {
        failedItems.push({ item, error: error.message });
        // Continue adding other items even if one fails
      }
    }
    
    return {
      order,
      addedItems,
      failedItems
    };
  }
}
