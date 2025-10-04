// scripts/backfill-eta-dates.js
import { PrismaClient } from '@prisma/client';
import { STAGE_THRESHOLDS } from '../src/config/stageThresholds.js';

const prisma = new PrismaClient();

/**
 * Calculate estimated ETA date based on average stage durations
 * Uses current STAGE_THRESHOLDS from config
 */
function calculateETADate(orderDate) {
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
}

async function backfillETADates() {
  try {
    // Check for --force flag
    const forceUpdate = process.argv.includes('--force');
    
    console.log('\n==============================================');
    console.log('   ETA Date Backfill Script');
    console.log('==============================================\n');
    
    if (forceUpdate) {
      console.log('FORCE MODE: Will recalculate ALL orders regardless of existing ETA\n');
    }
    
    // Calculate total expected days for display
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
    
    console.log('Current threshold configuration:');
    console.log(`  Total expected days: ${Math.round(totalDays)} days\n`);
    
    // Find orders based on force flag
    const whereClause = forceUpdate ? {} : { etaDate: null };
    
    const orders = await prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        createdAt: true,
        etaDate: true,
        account: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    
    if (orders.length === 0) {
      console.log('All orders already have ETA dates set!');
      console.log('\nUse --force flag to recalculate all ETAs based on current thresholds:');
      console.log('  node scripts/backfill-eta-dates.js --force\n');
      return;
    }
    
    console.log(`Found ${orders.length} order(s) to process\n`);
    
    if (forceUpdate) {
      console.log('WARNING: This will overwrite existing ETA dates!');
      console.log('Press Ctrl+C within 3 seconds to cancel...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    let updated = 0;
    
    for (const order of orders) {
      const newETA = calculateETADate(order.createdAt);
      const oldETA = order.etaDate ? new Date(order.etaDate).toLocaleDateString() : 'None';
      
      await prisma.order.update({
        where: { id: order.id },
        data: { etaDate: newETA }
      });
      
      updated++;
      
      const shortId = order.id.substring(0, 8);
      const customerName = order.account.name.substring(0, 30).padEnd(30);
      const created = order.createdAt.toLocaleDateString().padEnd(12);
      const newETAStr = newETA.toLocaleDateString().padEnd(12);
      
      if (forceUpdate && order.etaDate) {
        console.log(`${updated.toString().padStart(3)}. ${shortId} | ${customerName} | Old: ${oldETA.padEnd(12)} -> New: ${newETAStr}`);
      } else {
        console.log(`${updated.toString().padStart(3)}. ${shortId} | ${customerName} | Created: ${created} | ETA: ${newETAStr}`);
      }
    }
    
    console.log('\n==============================================');
    console.log(`Successfully updated ${updated} order(s)!`);
    console.log('==============================================\n');
    
  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
backfillETADates();
