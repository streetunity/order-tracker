// Endpoint code to add to index.js after the "List orders" endpoint

// Get yearly total of all item prices (admin only)
app.get('/orders/yearly-total', adminGuard, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1); // January 1
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59); // December 31

    // Get all orders created this year with their items
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: yearStart,
          lte: yearEnd
        }
      },
      include: {
        items: {
          select: {
            itemPrice: true
          }
        }
      }
    });

    // Calculate total from all item prices
    let total = 0;
    for (const order of orders) {
      for (const item of order.items) {
        if (item.itemPrice && typeof item.itemPrice === 'number') {
          total += item.itemPrice;
        }
      }
    }

    // Format as currency
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(total);

    res.json({
      year: currentYear,
      total: total,
      formatted: formatted,
      orderCount: orders.length,
      itemCount: orders.reduce((sum, o) => sum + o.items.length, 0)
    });
  } catch (e) {
    console.error('Yearly total error:', e);
    res.status(500).json({ error: e.message });
  }
});
