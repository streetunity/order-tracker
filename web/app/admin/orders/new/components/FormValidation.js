// Form Validation Helper
// Validates the order form data before submission

export function validateOrderForm(formData, items) {
  // Check required order fields
  if (!formData.accountId) {
    return { isValid: false, error: "Please select a customer" };
  }

  if (!formData.salesPerson) {
    return { isValid: false, error: "Please select a sales person" };
  }

  if (!formData.orderDate) {
    return { isValid: false, error: "Please enter an order date" };
  }

  // Validate that at least one item has a name
  const validItems = items.filter(item => item.name.trim());
  if (validItems.length === 0) {
    return { isValid: false, error: "Please add at least one item with a name" };
  }

  // Validate required fields for each item
  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const itemNum = items.indexOf(item) + 1;
    
    if (!item.qty || !item.qty.trim()) {
      return { isValid: false, error: `Item ${itemNum}: Quantity is required` };
    }
    if (!item.modelNumber || !item.modelNumber.trim()) {
      return { isValid: false, error: `Item ${itemNum}: Model # is required` };
    }
    if (!item.voltage || !item.voltage.trim()) {
      return { isValid: false, error: `Item ${itemNum}: Voltage is required` };
    }
    if (!item.power || !item.power.trim()) {
      return { isValid: false, error: `Item ${itemNum}: Power is required` };
    }
    if (!item.itemPrice || !item.itemPrice.trim()) {
      return { isValid: false, error: `Item ${itemNum}: Price is required` };
    }
  }

  // Validate discount if provided
  if (formData.discount && formData.discount.trim()) {
    const discountValue = parseFloat(formData.discount.trim());
    if (isNaN(discountValue) || discountValue < 0) {
      return { isValid: false, error: "Discount must be a valid number (0 or greater)" };
    }
  }

  return { isValid: true, validItems };
}
