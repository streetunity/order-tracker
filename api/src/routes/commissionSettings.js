import { Router } from 'express';
import { canManageCommissionSettings } from '../middleware/commissionAuth.js';

export function createCommissionSettingsRouter(prisma) {
  const router = Router();

  // ==========================================
  // VALIDATION FUNCTIONS
  // ==========================================

  function validateStageDistribution(distribution) {
    const total = distribution.reduce((sum, item) => sum + item.percentage, 0);
    
    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Stage distribution must total 100%, got ${total}%`);
    }
    
    const stages = distribution.map(item => item.stage);
    const uniqueStages = new Set(stages);
    
    if (stages.length !== uniqueStages.size) {
      throw new Error('Duplicate stages in distribution');
    }
    
    return true;
  }

  // ==========================================
  // RATES MANAGEMENT
  // ==========================================

  // Get all commission rates
  router.get('/rates', canManageCommissionSettings, async (req, res) => {
    try {
      const rates = await prisma.commissionRate.findMany({
        orderBy: { salesPersonName: 'asc' }
      });
      
      // Get list of sales reps from users
      const salesReps = await prisma.user.findMany({
        where: {
          showInSalesRepDropdown: true
        },
        select: {
          name: true
        },
        orderBy: { name: 'asc' }
      });

      // Combine rates with sales reps list
      const combinedList = salesReps.map(rep => {
        const existingRate = rates.find(r => r.salesPersonName === rep.name);
        return {
          salesPersonName: rep.name,
          rate: existingRate?.rate || 5.0, // Default 5%
          isCustom: !!existingRate,
          notes: existingRate?.notes || null,
          updatedAt: existingRate?.updatedAt || null
        };
      });

      res.json(combinedList);
    } catch (error) {
      console.error('Error fetching commission rates:', error);
      res.status(500).json({ error: 'Failed to fetch commission rates' });
    }
  });

  // Get specific rate for sales person
  router.get('/rates/:name', canManageCommissionSettings, async (req, res) => {
    try {
      const rate = await prisma.commissionRate.findUnique({
        where: { salesPersonName: decodeURIComponent(req.params.name) }
      });
      
      if (!rate) {
        // Return default if no custom rate
        return res.json({
          salesPersonName: req.params.name,
          rate: 5.0,
          isCustom: false
        });
      }
      
      res.json({
        ...rate,
        isCustom: true
      });
    } catch (error) {
      console.error('Error fetching commission rate:', error);
      res.status(500).json({ error: 'Failed to fetch commission rate' });
    }
  });

  // Set or update commission rate
  router.put('/rates/:name', canManageCommissionSettings, async (req, res) => {
    try {
      const { rate, notes } = req.body;
      const salesPersonName = decodeURIComponent(req.params.name);
      
      // Validate rate
      if (rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'Rate must be between 0 and 100' });
      }
      
      const rateRecord = await prisma.commissionRate.upsert({
        where: { salesPersonName },
        create: {
          salesPersonName,
          rate,
          setByUserId: req.user.id,
          setByName: req.user.name,
          notes
        },
        update: {
          rate,
          setByUserId: req.user.id,
          setByName: req.user.name,
          notes
        }
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionRate',
          entityId: rateRecord.id,
          action: 'RATE_UPDATED',
          changes: JSON.stringify({ 
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

  // Delete custom rate (revert to default)
  router.delete('/rates/:name', canManageCommissionSettings, async (req, res) => {
    try {
      const salesPersonName = decodeURIComponent(req.params.name);
      
      await prisma.commissionRate.delete({
        where: { salesPersonName }
      });
      
      res.json({ message: 'Custom rate removed, using default' });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Custom rate not found' });
      }
      console.error('Error deleting commission rate:', error);
      res.status(500).json({ error: 'Failed to delete commission rate' });
    }
  });

  // ==========================================
  // STAGE SETTINGS
  // ==========================================

  // Get stage payout configuration
  router.get('/stages', canManageCommissionSettings, async (req, res) => {
    try {
      const stages = await prisma.commissionStageSetting.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      });
      
      // If no stages configured, return defaults
      if (stages.length === 0) {
        return res.json([
          { stage: 'SHIPPING', percentage: 50, sortOrder: 1, isActive: true },
          { stage: 'DELIVERED', percentage: 50, sortOrder: 2, isActive: true }
        ]);
      }
      
      res.json(stages);
    } catch (error) {
      console.error('Error fetching stage settings:', error);
      res.status(500).json({ error: 'Failed to fetch stage settings' });
    }
  });

  // Update stage percentages
  router.put('/stages', canManageCommissionSettings, async (req, res) => {
    try {
      const stageSettings = req.body;
      
      // Validate distribution
      try {
        validateStageDistribution(stageSettings);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }

      // Deactivate all existing stages
      await prisma.commissionStageSetting.updateMany({
        data: { isActive: false }
      });

      // Create or update stages
      const updatedStages = [];
      for (let i = 0; i < stageSettings.length; i++) {
        const setting = stageSettings[i];
        const stage = await prisma.commissionStageSetting.upsert({
          where: { stage: setting.stage },
          create: {
            stage: setting.stage,
            percentage: setting.percentage,
            sortOrder: i + 1,
            isActive: true,
            updatedByUserId: req.user.id,
            updatedByName: req.user.name
          },
          update: {
            percentage: setting.percentage,
            sortOrder: i + 1,
            isActive: true,
            updatedByUserId: req.user.id,
            updatedByName: req.user.name
          }
        });
        updatedStages.push(stage);
      }

      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionStageSetting',
          entityId: 'all',
          action: 'STAGES_UPDATED',
          changes: JSON.stringify(stageSettings),
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
  router.post('/stages/validate', canManageCommissionSettings, async (req, res) => {
    try {
      const stages = req.body;
      const total = stages.reduce((sum, item) => sum + item.percentage, 0);
      
      res.json({
        isValid: Math.abs(total - 100) < 0.01,
        total,
        difference: 100 - total
      });
    } catch (error) {
      console.error('Error validating stage settings:', error);
      res.status(500).json({ error: 'Failed to validate stage settings' });
    }
  });

  // ==========================================
  // AVAILABLE STAGES
  // ==========================================

  // Get list of available stages from the system
  router.get('/available-stages', canManageCommissionSettings, async (req, res) => {
    try {
      // These are the standard stages in the order tracker
      const availableStages = [
        { value: 'MANUFACTURING', label: 'Manufacturing' },
        { value: 'TESTING', label: 'Testing' },
        { value: 'SHIPPING', label: 'Shipping' },
        { value: 'SMT', label: 'At SMT' },
        { value: 'QC', label: 'Quality Control' },
        { value: 'DELIVERED', label: 'Delivered To Customer' },
        { value: 'ONSITE', label: 'Onsite Installation' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'FOLLOW_UP', label: 'Follow-up' }
      ];
      
      res.json(availableStages);
    } catch (error) {
      console.error('Error fetching available stages:', error);
      res.status(500).json({ error: 'Failed to fetch available stages' });
    }
  });

  // ==========================================
  // GLOBAL SETTINGS
  // ==========================================

  // Get global commission settings
  router.get('/global', canManageCommissionSettings, async (req, res) => {
    try {
      // For now, return hardcoded settings
      // In the future, these could be stored in SystemSetting table
      const settings = {
        enabled: true,
        defaultRate: 5.0,
        calculationBasis: 'ORDER_TOTAL',
        paymentTrigger: 'STAGE_REACHED',
        minimumOrderValue: 0
      };
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching global settings:', error);
      res.status(500).json({ error: 'Failed to fetch global settings' });
    }
  });

  // Update global commission settings
  router.put('/global', canManageCommissionSettings, async (req, res) => {
    try {
      const { enabled, defaultRate, calculationBasis, paymentTrigger, minimumOrderValue } = req.body;
      
      // For now, just validate and return
      // In the future, save to SystemSetting table
      if (defaultRate < 0 || defaultRate > 100) {
        return res.status(400).json({ error: 'Default rate must be between 0 and 100' });
      }
      
      if (minimumOrderValue < 0) {
        return res.status(400).json({ error: 'Minimum order value must be positive' });
      }
      
      const settings = {
        enabled,
        defaultRate,
        calculationBasis,
        paymentTrigger,
        minimumOrderValue
      };

      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionSettings',
          entityId: 'global',
          action: 'SETTINGS_UPDATED',
          changes: JSON.stringify(settings),
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
  // BULK OPERATIONS
  // ==========================================

  // Reset all rates to default
  router.post('/rates/reset-all', canManageCommissionSettings, async (req, res) => {
    try {
      const { defaultRate = 5.0 } = req.body;
      
      // Delete all custom rates
      await prisma.commissionRate.deleteMany();

      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionRate',
          entityId: 'all',
          action: 'RATES_RESET',
          metadata: JSON.stringify({ defaultRate }),
          performedByUserId: req.user.id,
          performedByName: req.user.name
        }
      });
      
      res.json({ message: 'All rates reset to default' });
    } catch (error) {
      console.error('Error resetting rates:', error);
      res.status(500).json({ error: 'Failed to reset rates' });
    }
  });

  // Bulk set rates
  router.post('/rates/bulk-set', canManageCommissionSettings, async (req, res) => {
    try {
      const { rates } = req.body; // Array of { salesPersonName, rate }
      
      const results = [];
      for (const rateData of rates) {
        const rateRecord = await prisma.commissionRate.upsert({
          where: { salesPersonName: rateData.salesPersonName },
          create: {
            salesPersonName: rateData.salesPersonName,
            rate: rateData.rate,
            setByUserId: req.user.id,
            setByName: req.user.name,
            notes: rateData.notes
          },
          update: {
            rate: rateData.rate,
            setByUserId: req.user.id,
            setByName: req.user.name,
            notes: rateData.notes
          }
        });
        results.push(rateRecord);
      }

      // Log audit
      await prisma.auditLog.create({
        data: {
          entityType: 'CommissionRate',
          entityId: 'bulk',
          action: 'RATES_BULK_SET',
          changes: JSON.stringify(rates),
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

  return router;
}
