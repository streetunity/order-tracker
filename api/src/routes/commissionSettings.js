import express from 'express';
import { adminGuard } from '../middleware/auth.js';

export function createCommissionSettingsRouter(prisma) {
  const router = express.Router();
  
  // Helper to validate user permissions
  const canManageSettings = (role) => {
    return role === 'SUPER_ADMIN';
  };
  
  // ==========================================
  // COMMISSION RATES
  // ==========================================
  
  // Get all commission rates
  router.get('/rates', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can manage commission rates' });
      }
      
      const rates = await prisma.commissionRate.findMany({
        orderBy: { salesPersonName: 'asc' }
      });
      
      res.json(rates);
    } catch (error) {
      console.error('Error fetching commission rates:', error);
      res.status(500).json({ error: 'Failed to fetch commission rates' });
    }
  });
  
  // Get specific rate for sales person
  router.get('/rates/:name', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can view commission rates' });
      }
      
      const rate = await prisma.commissionRate.findUnique({
        where: { salesPersonName: req.params.name }
      });
      
      if (!rate) {
        return res.status(404).json({ error: 'Rate not found for this sales person' });
      }
      
      res.json(rate);
    } catch (error) {
      console.error('Error fetching commission rate:', error);
      res.status(500).json({ error: 'Failed to fetch commission rate' });
    }
  });
  
  // Set or update commission rate
  router.put('/rates/:name', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can set commission rates' });
      }
      
      const { rate, notes } = req.body;
      const salesPersonName = req.params.name;
      
      // Validate rate
      if (typeof rate !== 'number' || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'Rate must be a number between 0 and 100' });
      }
      
      const rateRecord = await prisma.commissionRate.upsert({
        where: { salesPersonName },
        create: {
          salesPersonName,
          rate,
          notes,
          setByUserId: req.user.id,
          setByName: req.user.name
        },
        update: {
          rate,
          notes,
          setByUserId: req.user.id,
          setByName: req.user.name
        }
      });
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionRate',
          entityId: rateRecord.id,
          action: 'RATE_UPDATED',
          metadata: JSON.stringify({
            salesPersonName,
            rate,
            notes
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json(rateRecord);
    } catch (error) {
      console.error('Error setting commission rate:', error);
      res.status(500).json({ error: 'Failed to set commission rate' });
    }
  });
  
  // Delete commission rate (reset to default)
  router.delete('/rates/:name', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can delete commission rates' });
      }
      
      const salesPersonName = req.params.name;
      
      const rate = await prisma.commissionRate.findUnique({
        where: { salesPersonName }
      });
      
      if (!rate) {
        return res.status(404).json({ error: 'Rate not found for this sales person' });
      }
      
      await prisma.commissionRate.delete({
        where: { salesPersonName }
      });
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionRate',
          entityId: rate.id,
          action: 'RATE_DELETED',
          metadata: JSON.stringify({
            salesPersonName,
            oldRate: rate.rate
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json({ message: 'Commission rate deleted, will use default rate' });
    } catch (error) {
      console.error('Error deleting commission rate:', error);
      res.status(500).json({ error: 'Failed to delete commission rate' });
    }
  });
  
  // ==========================================
  // STAGE SETTINGS
  // ==========================================
  
  // Get stage payout configuration
  router.get('/stages', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can view stage settings' });
      }
      
      const stages = await prisma.commissionStageSetting.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      });
      
      // If no stages exist, create defaults
      if (stages.length === 0) {
        const defaultStages = [
          { stage: 'SHIPPING', percentage: 50, sortOrder: 1, isActive: true },
          { stage: 'DELIVERED', percentage: 50, sortOrder: 2, isActive: true }
        ];
        
        for (const stageData of defaultStages) {
          await prisma.commissionStageSetting.create({
            data: {
              ...stageData,
              updatedByUserId: req.user.id,
              updatedByName: req.user.name
            }
          });
        }
        
        const createdStages = await prisma.commissionStageSetting.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' }
        });
        
        return res.json(createdStages);
      }
      
      res.json(stages);
    } catch (error) {
      console.error('Error fetching stage settings:', error);
      res.status(500).json({ error: 'Failed to fetch stage settings' });
    }
  });
  
  // Update stage percentages
  router.put('/stages', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can update stage settings' });
      }
      
      const stages = req.body;
      
      if (!Array.isArray(stages)) {
        return res.status(400).json({ error: 'Stages must be an array' });
      }
      
      // Validate total equals 100%
      const total = stages.reduce((sum, stage) => sum + (stage.percentage || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        return res.status(400).json({ 
          error: `Stage percentages must total 100%, got ${total}%` 
        });
      }
      
      // Validate no duplicates
      const stageNames = stages.map(s => s.stage);
      const uniqueStages = new Set(stageNames);
      if (stageNames.length !== uniqueStages.size) {
        return res.status(400).json({ error: 'Duplicate stages not allowed' });
      }
      
      // Update all stages in a transaction
      await prisma.$transaction(async (tx) => {
        // First, deactivate all existing stages
        await tx.commissionStageSetting.updateMany({
          data: { isActive: false }
        });
        
        // Then create/update the new stages
        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];
          
          await tx.commissionStageSetting.upsert({
            where: { stage: stage.stage },
            create: {
              stage: stage.stage,
              percentage: stage.percentage,
              sortOrder: i + 1,
              isActive: true,
              updatedByUserId: req.user.id,
              updatedByName: req.user.name
            },
            update: {
              percentage: stage.percentage,
              sortOrder: i + 1,
              isActive: true,
              updatedByUserId: req.user.id,
              updatedByName: req.user.name
            }
          });
        }
      });
      
      // Fetch updated settings
      const updatedStages = await prisma.commissionStageSetting.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      });
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionStageSetting',
          entityId: 'all',
          action: 'STAGES_UPDATED',
          metadata: JSON.stringify({
            stages: updatedStages.map(s => ({
              stage: s.stage,
              percentage: s.percentage
            }))
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json(updatedStages);
    } catch (error) {
      console.error('Error updating stage settings:', error);
      res.status(500).json({ error: 'Failed to update stage settings' });
    }
  });
  
  // Validate stage percentages
  router.post('/stages/validate', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can validate stage settings' });
      }
      
      const stages = req.body;
      
      if (!Array.isArray(stages)) {
        return res.status(400).json({ error: 'Stages must be an array' });
      }
      
      const total = stages.reduce((sum, stage) => sum + (stage.percentage || 0), 0);
      const difference = Math.abs(total - 100);
      
      res.json({
        isValid: difference < 0.01,
        total,
        difference: total - 100
      });
    } catch (error) {
      console.error('Error validating stage settings:', error);
      res.status(500).json({ error: 'Failed to validate stage settings' });
    }
  });
  
  // ==========================================
  // GLOBAL SETTINGS
  // ==========================================
  
  // Get global commission settings
  router.get('/global', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can view global settings' });
      }
      
      let settings = await prisma.commissionSettings.findFirst();
      
      // If no settings exist, create defaults
      if (!settings) {
        settings = await prisma.commissionSettings.create({
          data: {
            enabled: true,
            defaultRate: 5.0,
            calculationBasis: 'ORDER_TOTAL',
            minimumOrderValue: 0,
            lastUpdatedBy: req.user.id,
            lastUpdatedByName: req.user.name
          }
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching global settings:', error);
      res.status(500).json({ error: 'Failed to fetch global settings' });
    }
  });
  
  // Update global commission settings
  router.put('/global', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can update global settings' });
      }
      
      const {
        enabled,
        defaultRate,
        calculationBasis,
        minimumOrderValue
      } = req.body;
      
      // Validate default rate
      if (typeof defaultRate === 'number' && (defaultRate < 0 || defaultRate > 100)) {
        return res.status(400).json({ error: 'Default rate must be between 0 and 100' });
      }
      
      // Validate calculation basis
      const validBases = ['ORDER_TOTAL', 'SUBTOTAL', 'PROFIT_MARGIN'];
      if (calculationBasis && !validBases.includes(calculationBasis)) {
        return res.status(400).json({ error: 'Invalid calculation basis' });
      }
      
      // Validate minimum order value
      if (typeof minimumOrderValue === 'number' && minimumOrderValue < 0) {
        return res.status(400).json({ error: 'Minimum order value cannot be negative' });
      }
      
      let settings = await prisma.commissionSettings.findFirst();
      
      if (settings) {
        settings = await prisma.commissionSettings.update({
          where: { id: settings.id },
          data: {
            enabled: enabled !== undefined ? enabled : settings.enabled,
            defaultRate: defaultRate !== undefined ? defaultRate : settings.defaultRate,
            calculationBasis: calculationBasis || settings.calculationBasis,
            minimumOrderValue: minimumOrderValue !== undefined ? minimumOrderValue : settings.minimumOrderValue,
            lastUpdatedBy: req.user.id,
            lastUpdatedByName: req.user.name
          }
        });
      } else {
        settings = await prisma.commissionSettings.create({
          data: {
            enabled: enabled !== undefined ? enabled : true,
            defaultRate: defaultRate !== undefined ? defaultRate : 5.0,
            calculationBasis: calculationBasis || 'ORDER_TOTAL',
            minimumOrderValue: minimumOrderValue !== undefined ? minimumOrderValue : 0,
            lastUpdatedBy: req.user.id,
            lastUpdatedByName: req.user.name
          }
        });
      }
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionSettings',
          entityId: settings.id,
          action: 'GLOBAL_SETTINGS_UPDATED',
          metadata: JSON.stringify({
            enabled: settings.enabled,
            defaultRate: settings.defaultRate,
            calculationBasis: settings.calculationBasis,
            minimumOrderValue: settings.minimumOrderValue
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json(settings);
    } catch (error) {
      console.error('Error updating global settings:', error);
      res.status(500).json({ error: 'Failed to update global settings' });
    }
  });
  
  // ==========================================
  // SALES REP LIST
  // ==========================================
  
  // Get list of all sales reps (users who can have commissions)
  router.get('/sales-reps', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can view sales rep list' });
      }
      
      // Get all users who show in sales rep dropdown or have commissions
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { showInSalesRepDropdown: true },
            { role: 'AGENT' },
            { role: 'ADMIN' }
          ],
          role: {
            not: 'ACCOUNTANT'
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          showInSalesRepDropdown: true,
          isActive: true
        },
        orderBy: { name: 'asc' }
      });
      
      // Get commission rates for these users
      const rates = await prisma.commissionRate.findMany();
      const rateMap = {};
      rates.forEach(r => {
        rateMap[r.salesPersonName] = r.rate;
      });
      
      // Get default rate
      const settings = await prisma.commissionSettings.findFirst();
      const defaultRate = settings?.defaultRate || 5.0;
      
      // Combine data
      const salesReps = users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        showInDropdown: user.showInSalesRepDropdown,
        commissionRate: rateMap[user.name] || defaultRate,
        hasCustomRate: rateMap.hasOwnProperty(user.name)
      }));
      
      res.json(salesReps);
    } catch (error) {
      console.error('Error fetching sales reps:', error);
      res.status(500).json({ error: 'Failed to fetch sales reps' });
    }
  });
  
  // ==========================================
  // BULK OPERATIONS
  // ==========================================
  
  // Set rates for multiple sales reps at once
  router.post('/rates/bulk', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can bulk set rates' });
      }
      
      const { rates } = req.body;
      
      if (!Array.isArray(rates)) {
        return res.status(400).json({ error: 'Rates must be an array' });
      }
      
      const results = [];
      
      for (const rateData of rates) {
        const { salesPersonName, rate, notes } = rateData;
        
        if (!salesPersonName) continue;
        if (typeof rate !== 'number' || rate < 0 || rate > 100) continue;
        
        try {
          const rateRecord = await prisma.commissionRate.upsert({
            where: { salesPersonName },
            create: {
              salesPersonName,
              rate,
              notes,
              setByUserId: req.user.id,
              setByName: req.user.name
            },
            update: {
              rate,
              notes,
              setByUserId: req.user.id,
              setByName: req.user.name
            }
          });
          
          results.push({
            salesPersonName,
            rate,
            success: true
          });
        } catch (error) {
          results.push({
            salesPersonName,
            rate,
            success: false,
            error: error.message
          });
        }
      }
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionRate',
          entityId: 'bulk',
          action: 'BULK_RATES_UPDATED',
          metadata: JSON.stringify({
            count: results.length,
            successful: results.filter(r => r.success).length
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json(results);
    } catch (error) {
      console.error('Error bulk setting rates:', error);
      res.status(500).json({ error: 'Failed to bulk set rates' });
    }
  });
  
  // Reset all rates to default
  router.post('/rates/reset', adminGuard, async (req, res) => {
    try {
      if (!canManageSettings(req.user.role)) {
        return res.status(403).json({ error: 'Only Super Admins can reset rates' });
      }
      
      const deleted = await prisma.commissionRate.deleteMany();
      
      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionRate',
          entityId: 'all',
          action: 'ALL_RATES_RESET',
          metadata: JSON.stringify({
            deletedCount: deleted.count
          }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json({ 
        message: 'All custom rates deleted, all sales reps will use default rate',
        deletedCount: deleted.count
      });
    } catch (error) {
      console.error('Error resetting rates:', error);
      res.status(500).json({ error: 'Failed to reset rates' });
    }
  });
  
  return router;
}

export default createCommissionSettingsRouter;
