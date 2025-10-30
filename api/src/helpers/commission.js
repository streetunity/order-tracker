// api/src/helpers/commission.js
// Commission calculation and management helper functions

export async function calculateCommissionForOrder(prisma, orderId) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true
      }
    });
    
    if (!order) {
      console.log(`[COMMISSION] Order ${orderId} not found`);
      return null;
    }
    
    // Skip if no sales person
    if (!order.sku) {
      console.log(`[COMMISSION] No sales person for order ${orderId}`);
      // Check if commission exists and flag it
      const commission = await prisma.commission.findFirst({
        where: { orderId }
      });
      if (commission) {
        await prisma.commission.update({
          where: { id: commission.id },
          data: {
            isFlagged: true,
            flagReason: 'NO_SALES_REP',
            flagDetails: JSON.stringify({
              message: 'No sales person assigned to order',
              timestamp: new Date()
            })
          }
        });
      }
      return null;
    }
    
    // Calculate order total
    let orderTotal = 0;
    let hasAllPrices = true;
    const itemPrices = [];
    
    for (const item of order.items) {
      if (item.itemPrice && item.itemPrice > 0) {
        orderTotal += item.itemPrice * (item.qty || 1);
        itemPrices.push({
          itemId: item.id,
          productCode: item.productCode,
          price: item.itemPrice,
          qty: item.qty
        });
      } else {
        hasAllPrices = false;
      }
    }
    
    // Get commission rate for sales person
    let rate = 5.0; // Default rate
    const customRate = await prisma.commissionRate.findUnique({
      where: { salesPersonName: order.sku }
    });
    if (customRate) {
      rate = customRate.rate;
    } else {
      // Check for global default rate
      const settings = await prisma.commissionSettings.findFirst();
      if (settings?.defaultRate) {
        rate = settings.defaultRate;
      }
    }
    
    // Check if commission already exists
    let commission = await prisma.commission.findFirst({
      where: { orderId }
    });
    
    if (commission) {
      // Update existing commission
      commission = await prisma.commission.update({
        where: { id: commission.id },
        data: {
          salesPersonName: order.sku,
          orderTotalAmount: orderTotal,
          commissionRate: rate,
          totalCommissionAmount: (orderTotal * rate) / 100,
          status: hasAllPrices ? 'CALCULATED' : 'AWAITING_PRICES',
          isFlagged: !hasAllPrices,
          flagReason: hasAllPrices ? null : 'AWAITING_PRICES',
          flagDetails: hasAllPrices ? null : JSON.stringify({
            message: 'Some items missing prices',
            timestamp: new Date()
          }),
          itemPricesSnapshot: JSON.stringify(itemPrices),
          calculatedAt: hasAllPrices ? new Date() : null
        }
      });
    } else {
      // Create new commission
      commission = await prisma.commission.create({
        data: {
          orderId,
          salesPersonName: order.sku,
          orderTotalAmount: orderTotal,
          commissionRate: rate,
          totalCommissionAmount: (orderTotal * rate) / 100,
          status: hasAllPrices ? 'CALCULATED' : 'AWAITING_PRICES',
          isFlagged: !hasAllPrices,
          flagReason: hasAllPrices ? null : 'AWAITING_PRICES',
          flagDetails: hasAllPrices ? null : JSON.stringify({
            message: 'Some items missing prices',
            timestamp: new Date()
          }),
          itemPricesSnapshot: JSON.stringify(itemPrices),
          calculatedAt: hasAllPrices ? new Date() : null
        }
      });
      
      // Create payouts if commission is calculated
      if (hasAllPrices) {
        // Get stage settings
        const stageSettings = await prisma.commissionStageSetting.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' }
        });
        
        if (stageSettings.length === 0) {
          // Create default stage settings if none exist
          await prisma.commissionStageSetting.createMany({
            data: [
              { stage: 'SHIPPING', percentage: 50, sortOrder: 1, isActive: true },
              { stage: 'DELIVERED', percentage: 50, sortOrder: 2, isActive: true }
            ]
          });
          
          // Refetch after creation
          const newSettings = await prisma.commissionStageSetting.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
          });
          
          for (const setting of newSettings) {
            await prisma.commissionPayout.create({
              data: {
                commissionId: commission.id,
                stage: setting.stage,
                percentage: setting.percentage,
                amount: (commission.totalCommissionAmount * setting.percentage) / 100,
                status: 'WAITING'
              }
            });
          }
        } else {
          // Create payouts based on stage settings
          for (const setting of stageSettings) {
            await prisma.commissionPayout.create({
              data: {
                commissionId: commission.id,
                stage: setting.stage,
                percentage: setting.percentage,
                amount: (commission.totalCommissionAmount * setting.percentage) / 100,
                status: 'WAITING'
              }
            });
          }
        }
      }
    }
    
    console.log(`[COMMISSION] ${commission ? 'Updated' : 'Created'} commission for order ${orderId}: $${commission.totalCommissionAmount}`);
    return commission;
  } catch (error) {
    console.error(`[COMMISSION] Error calculating commission for order ${orderId}:`, error);
    return null;
  }
}

export async function recalculateCommissionIfPriceChanged(prisma, orderId) {
  try {
    const commission = await prisma.commission.findFirst({
      where: { orderId }
    });
    
    if (!commission) {
      // No commission yet, calculate it
      return await calculateCommissionForOrder(prisma, orderId);
    }
    
    // Check if prices changed
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });
    
    const currentPrices = [];
    let hasAllPrices = true;
    let orderTotal = 0;
    
    for (const item of order.items) {
      if (item.itemPrice && item.itemPrice > 0) {
        orderTotal += item.itemPrice * (item.qty || 1);
        currentPrices.push({
          itemId: item.id,
          productCode: item.productCode,
          price: item.itemPrice,
          qty: item.qty
        });
      } else {
        hasAllPrices = false;
      }
    }
    
    const oldSnapshot = JSON.parse(commission.itemPricesSnapshot || '[]');
    const pricesChanged = JSON.stringify(currentPrices) !== JSON.stringify(oldSnapshot);
    
    if (pricesChanged || commission.status === 'AWAITING_PRICES') {
      // Recalculate commission
      const updatedCommission = await prisma.commission.update({
        where: { id: commission.id },
        data: {
          orderTotalAmount: orderTotal,
          totalCommissionAmount: (orderTotal * commission.commissionRate) / 100,
          status: hasAllPrices ? 'CALCULATED' : 'AWAITING_PRICES',
          isFlagged: !hasAllPrices || pricesChanged,
          flagReason: !hasAllPrices ? 'AWAITING_PRICES' : (pricesChanged ? 'PRICE_CHANGED' : null),
          flagDetails: JSON.stringify({
            message: !hasAllPrices ? 'Some items missing prices' : 'Prices changed after calculation',
            oldTotal: commission.orderTotalAmount,
            newTotal: orderTotal,
            timestamp: new Date()
          }),
          itemPricesSnapshot: JSON.stringify(currentPrices),
          calculatedAt: hasAllPrices ? new Date() : commission.calculatedAt
        }
      });
      
      // Update payout amounts
      const payouts = await prisma.commissionPayout.findMany({
        where: { commissionId: commission.id }
      });
      
      for (const payout of payouts) {
        await prisma.commissionPayout.update({
          where: { id: payout.id },
          data: {
            amount: (updatedCommission.totalCommissionAmount * payout.percentage) / 100
          }
        });
      }
      
      console.log(`[COMMISSION] Recalculated commission for order ${orderId} due to price change`);
      return updatedCommission;
    }
    
    return commission;
  } catch (error) {
    console.error(`[COMMISSION] Error recalculating commission for order ${orderId}:`, error);
    return null;
  }
}

export async function checkCommissionPayoutTrigger(prisma, orderId, oldStage, newStage) {
  try {
    if (oldStage === newStage) return;
    
    const commission = await prisma.commission.findFirst({
      where: { orderId },
      include: { payouts: true }
    });
    
    if (!commission || commission.status !== 'CALCULATED') {
      console.log(`[COMMISSION] No calculated commission for order ${orderId}`);
      return;
    }
    
    // Check if new stage triggers a payout
    const stagePayout = commission.payouts.find(p => 
      p.stage === newStage && p.status === 'WAITING'
    );
    
    if (stagePayout) {
      await prisma.commissionPayout.update({
        where: { id: stagePayout.id },
        data: { status: 'PENDING' }
      });
      
      console.log(`[COMMISSION] Triggered payout for stage ${newStage} on order ${orderId}`);
      
      // Create notification for admins
      const admins = await prisma.user.findMany({
        where: { 
          role: { in: ['SUPER_ADMIN', 'ACCOUNTANT'] },
          isActive: true
        }
      });
      
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'COMMISSION',
            category: 'COMMISSION',
            title: 'Commission Pending Approval',
            message: `Commission payout for ${commission.salesPersonName} requires approval`,
            metadata: JSON.stringify({
              commissionId: commission.id,
              payoutId: stagePayout.id,
              amount: stagePayout.amount,
              stage: newStage
            })
          }
        });
      }
    }
  } catch (error) {
    console.error(`[COMMISSION] Error checking payout trigger for order ${orderId}:`, error);
  }
}
