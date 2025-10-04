// api/src/routes/settings.js
import { Router } from 'express';
import { adminGuard } from '../middleware/auth.js';
import { STAGES } from '../state.js';
import { STAGE_THRESHOLDS } from '../config/stageThresholds.js';

export function createSettingsRouter(prisma) {
  const router = Router();

  /**
   * GET /settings/thresholds
   * Get all stage threshold settings
   */
  router.get('/thresholds', adminGuard, async (req, res) => {
    try {
      const thresholds = await prisma.stageThreshold.findMany({
        orderBy: { stage: 'asc' }
      });

      // If no thresholds in database, return defaults from config
      if (thresholds.length === 0) {
        const defaults = STAGES.map(stage => ({
          stage,
          warningDays: STAGE_THRESHOLDS[stage]?.warningDays || 30,
          criticalDays: STAGE_THRESHOLDS[stage]?.criticalDays || 60,
          description: STAGE_THRESHOLDS[stage]?.description || `${stage} stage`,
          updatedAt: new Date(),
          updatedBy: null
        }));
        return res.json(defaults);
      }

      res.json(thresholds);
    } catch (error) {
      console.error('Get thresholds error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /settings/thresholds/initialize
   * Initialize database with default threshold values
   */
  router.post('/thresholds/initialize', adminGuard, async (req, res) => {
    try {
      const results = await prisma.$transaction(async (tx) => {
        const created = [];
        
        for (const stage of STAGES) {
          const existing = await tx.stageThreshold.findUnique({
            where: { stage }
          });

          if (!existing) {
            const threshold = await tx.stageThreshold.create({
              data: {
                stage,
                warningDays: STAGE_THRESHOLDS[stage]?.warningDays || 30,
                criticalDays: STAGE_THRESHOLDS[stage]?.criticalDays || 60,
                description: STAGE_THRESHOLDS[stage]?.description || `${stage} stage`,
                updatedBy: req.user.name
              }
            });
            created.push(threshold);
          }
        }

        return created;
      });

      res.json({ 
        message: `Initialized ${results.length} stage thresholds`,
        created: results
      });
    } catch (error) {
      console.error('Initialize thresholds error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PATCH /settings/thresholds/:stage
   * Update threshold settings for a specific stage
   */
  router.patch('/thresholds/:stage', adminGuard, async (req, res) => {
    try {
      const { stage } = req.params;
      const { warningDays, criticalDays, description } = req.body;

      // Validate stage exists
      if (!STAGES.includes(stage)) {
        return res.status(400).json({ error: 'Invalid stage' });
      }

      // Validate threshold values
      if (warningDays !== undefined && (warningDays < 0 || warningDays > 365)) {
        return res.status(400).json({ error: 'Warning days must be between 0 and 365' });
      }

      if (criticalDays !== undefined && (criticalDays < 0 || criticalDays > 365)) {
        return res.status(400).json({ error: 'Critical days must be between 0 and 365' });
      }

      if (warningDays !== undefined && criticalDays !== undefined && warningDays >= criticalDays) {
        return res.status(400).json({ error: 'Warning days must be less than critical days' });
      }

      const data = {
        updatedBy: req.user.name
      };

      if (warningDays !== undefined) data.warningDays = parseInt(warningDays, 10);
      if (criticalDays !== undefined) data.criticalDays = parseInt(criticalDays, 10);
      if (description !== undefined) data.description = description;

      const threshold = await prisma.stageThreshold.upsert({
        where: { stage },
        update: data,
        create: {
          stage,
          warningDays: data.warningDays || STAGE_THRESHOLDS[stage]?.warningDays || 30,
          criticalDays: data.criticalDays || STAGE_THRESHOLDS[stage]?.criticalDays || 60,
          description: data.description || STAGE_THRESHOLDS[stage]?.description || `${stage} stage`,
          updatedBy: req.user.name
        }
      });

      res.json(threshold);
    } catch (error) {
      console.error('Update threshold error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /settings/system
   * Get all system settings
   */
  router.get('/system', adminGuard, async (req, res) => {
    try {
      const settings = await prisma.systemSetting.findMany({
        orderBy: { key: 'asc' }
      });

      // Return as key-value object for easier frontend usage
      const settingsObj = settings.reduce((acc, setting) => {
        acc[setting.key] = {
          value: setting.value,
          description: setting.description,
          updatedAt: setting.updatedAt,
          updatedBy: setting.updatedBy
        };
        return acc;
      }, {});

      // Add defaults if not set
      if (!settingsObj.HOLIDAY_SEASON_START) {
        settingsObj.HOLIDAY_SEASON_START = {
          value: '10-01',
          description: 'Start date for holiday season (MM-DD format)',
          updatedAt: new Date(),
          updatedBy: null
        };
      }

      if (!settingsObj.HOLIDAY_SEASON_END) {
        settingsObj.HOLIDAY_SEASON_END = {
          value: '12-31',
          description: 'End date for holiday season (MM-DD format)',
          updatedAt: new Date(),
          updatedBy: null
        };
      }

      if (!settingsObj.HOLIDAY_BUFFER_DAYS) {
        settingsObj.HOLIDAY_BUFFER_DAYS = {
          value: '25',
          description: 'Additional days to add to MANUFACTURING stage during holiday season',
          updatedAt: new Date(),
          updatedBy: null
        };
      }

      res.json(settingsObj);
    } catch (error) {
      console.error('Get system settings error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PATCH /settings/system/:key
   * Update a system setting
   */
  router.patch('/system/:key', adminGuard, async (req, res) => {
    try {
      const { key } = req.params;
      const { value, description } = req.body;

      if (!value) {
        return res.status(400).json({ error: 'Value is required' });
      }

      // Validate specific keys
      if (key === 'HOLIDAY_SEASON_START' || key === 'HOLIDAY_SEASON_END') {
        // Validate MM-DD format
        const dateRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
        if (!dateRegex.test(value)) {
          return res.status(400).json({ error: 'Date must be in MM-DD format' });
        }
      }

      if (key === 'HOLIDAY_BUFFER_DAYS') {
        const days = parseInt(value, 10);
        if (isNaN(days) || days < 0 || days > 100) {
          return res.status(400).json({ error: 'Buffer days must be between 0 and 100' });
        }
      }

      const setting = await prisma.systemSetting.upsert({
        where: { key },
        update: {
          value,
          description: description || undefined,
          updatedBy: req.user.name
        },
        create: {
          key,
          value,
          description: description || `System setting: ${key}`,
          updatedBy: req.user.name
        }
      });

      res.json(setting);
    } catch (error) {
      console.error('Update system setting error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /settings/thresholds/effective/:stage
   * Get effective threshold for a stage on a specific date (with holiday adjustment)
   * 
   * IMPORTANT: Holiday buffer ONLY applies to MANUFACTURING stage.
   * Other stages will be automatically pushed back by the extended manufacturing time.
   */
  router.get('/thresholds/effective/:stage', adminGuard, async (req, res) => {
    try {
      const { stage } = req.params;
      const { date } = req.query; // ISO date string, defaults to today

      const targetDate = date ? new Date(date) : new Date();

      // Get base threshold
      let threshold = await prisma.stageThreshold.findUnique({
        where: { stage }
      });

      if (!threshold) {
        // Use default from config
        threshold = {
          stage,
          warningDays: STAGE_THRESHOLDS[stage]?.warningDays || 30,
          criticalDays: STAGE_THRESHOLDS[stage]?.criticalDays || 60,
          description: STAGE_THRESHOLDS[stage]?.description || `${stage} stage`
        };
      }

      // Check if date falls in holiday season
      const holidayStart = await prisma.systemSetting.findUnique({
        where: { key: 'HOLIDAY_SEASON_START' }
      });

      const holidayEnd = await prisma.systemSetting.findUnique({
        where: { key: 'HOLIDAY_SEASON_END' }
      });

      const bufferDays = await prisma.systemSetting.findUnique({
        where: { key: 'HOLIDAY_BUFFER_DAYS' }
      });

      const isHolidaySeason = isDateInHolidaySeason(
        targetDate,
        holidayStart?.value || '10-01',
        holidayEnd?.value || '12-31'
      );

      let effectiveWarningDays = threshold.warningDays;
      let effectiveCriticalDays = threshold.criticalDays;

      // CRITICAL: Holiday buffer ONLY applies to MANUFACTURING
      // Other stages are automatically pushed back by the extended manufacturing time
      if (isHolidaySeason && stage === 'MANUFACTURING') {
        const buffer = parseInt(bufferDays?.value || '25', 10);
        effectiveWarningDays += buffer;
        effectiveCriticalDays += buffer;
      }

      res.json({
        stage,
        baseWarningDays: threshold.warningDays,
        baseCriticalDays: threshold.criticalDays,
        effectiveWarningDays,
        effectiveCriticalDays,
        isHolidaySeason,
        holidayBufferApplied: (isHolidaySeason && stage === 'MANUFACTURING') ? parseInt(bufferDays?.value || '25', 10) : 0,
        targetDate,
        note: stage === 'MANUFACTURING' ? 'Holiday buffer applied to manufacturing only' : 'Other stages are pushed back by extended manufacturing time'
      });
    } catch (error) {
      console.error('Get effective threshold error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /settings/recalculate-etas
   * Recalculate ETA dates for all orders based on current threshold settings
   * Admin-only endpoint that updates all customer tracking pages
   */
  router.post('/recalculate-etas', adminGuard, async (req, res) => {
    try {
      console.log('Starting ETA recalculation for all orders...');
      
      // Calculate ETA date based on average stage durations from current thresholds
      const calculateETADate = (orderDate) => {
        const stageDurations = {
          MANUFACTURING: (STAGE_THRESHOLDS.MANUFACTURING.warningDays + STAGE_THRESHOLDS.MANUFACTURING.criticalDays) / 2,
          TESTING: (STAGE_THRESHOLDS.TESTING.warningDays + STAGE_THRESHOLDS.TESTING.criticalDays) / 2,
          SHIPPING: (STAGE_THRESHOLDS.SHIPPING.warningDays + STAGE_THRESHOLDS.SHIPPING.criticalDays) / 2,
          SMT: (STAGE_THRESHOLDS.SMT.warningDays + STAGE_THRESHOLDS.SMT.criticalDays) / 2,
          QC: (STAGE_THRESHOLDS.QC.warningDays + STAGE_THRESHOLDS.QC.criticalDays) / 2,
          DELIVERED: (STAGE_THRESHOLDS.DELIVERED.warningDays + STAGE_THRESHOLDS.DELIVERED.criticalDays) / 2,
          ONSITE: (STAGE_THRESHOLDS.ONSITE.warningDays + STAGE_THRESHOLDS.ONSITE.criticalDays) / 2
        };
        
        const totalDays = Object.values(stageDurations).reduce((sum, days) => sum + days, 0);
        const eta = new Date(orderDate);
        eta.setDate(eta.getDate() + Math.round(totalDays));
        
        return eta;
      };
      
      // Get all orders
      const orders = await prisma.order.findMany({
        select: {
          id: true,
          createdAt: true,
          etaDate: true
        }
      });
      
      // Recalculate ETAs for all orders
      let updated = 0;
      for (const order of orders) {
        const newETA = calculateETADate(order.createdAt);
        
        await prisma.order.update({
          where: { id: order.id },
          data: { etaDate: newETA }
        });
        
        updated++;
      }
      
      console.log(`✅ Successfully recalculated ${updated} order ETAs`);
      
      res.json({
        success: true,
        message: `Successfully recalculated ${updated} order ETAs`,
        ordersUpdated: updated
      });
      
    } catch (error) {
      console.error('❌ Error recalculating ETAs:', error);
      res.status(500).json({ error: 'Failed to recalculate ETAs' });
    }
  });

  return router;
}

/**
 * Helper function to check if a date falls within holiday season
 */
function isDateInHolidaySeason(date, startMMDD, endMMDD) {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate(); // 1-31

  const [startMonth, startDay] = startMMDD.split('-').map(Number);
  const [endMonth, endDay] = endMMDD.split('-').map(Number);

  // Same year season (e.g., 03-01 to 09-30)
  if (startMonth < endMonth) {
    if (month < startMonth || month > endMonth) return false;
    if (month === startMonth && day < startDay) return false;
    if (month === endMonth && day > endDay) return false;
    return true;
  }

  // Cross-year season (e.g., 10-01 to 12-31 wraps to next year)
  if (startMonth > endMonth) {
    // In range if >= start OR <= end
    if (month > startMonth || month < endMonth) return true;
    if (month === startMonth && day >= startDay) return true;
    if (month === endMonth && day <= endDay) return true;
    return false;
  }

  // Same month (e.g., 10-01 to 10-31)
  if (month !== startMonth) return false;
  return day >= startDay && day <= endDay;
}

export default createSettingsRouter;
