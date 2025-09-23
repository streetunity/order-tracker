// BOARD PAGE UPDATES FOR MEASUREMENTS
// Add these changes to your existing web/app/admin/board/page.jsx file

// ====================================
// STEP 1: ADD IMPORT AT THE TOP
// ====================================
import MeasurementModal from '@/components/MeasurementModal';

// ====================================
// STEP 2: ADD STATE VARIABLES
// ====================================
// Add these inside your BoardPage component, near other useState declarations:
const [measurementModal, setMeasurementModal] = useState({
  isOpen: false,
  item: null,
  orderId: null
});

// ====================================
// STEP 3: ADD HANDLER FUNCTIONS
// ====================================
// Add these after your other handler functions:
const openMeasurementModal = (item, orderId) => {
  setMeasurementModal({
    isOpen: true,
    item: item,
    orderId: orderId
  });
};

const closeMeasurementModal = () => {
  setMeasurementModal({
    isOpen: false,
    item: null,
    orderId: null
  });
};

const handleMeasurementSave = (updatedItem) => {
  // Update the item in your orders state
  setOrders(prevOrders => 
    prevOrders.map(order => ({
      ...order,
      items: order.items.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      )
    }))
  );
  closeMeasurementModal();
};

// ====================================
// STEP 4: UPDATE ITEM RENDERING
// ====================================
// In your item cards (where you render each item in the stage columns),
// add this measurement display section after the serial number:

{/* NEW: Measurement display and edit button */}
<div className="measurement-section">
  <div className="measurement-display">
    {(item.height || item.width || item.length || item.weight) ? (
      <>
        {(item.height || item.width || item.length) && (
          <div className="dimension-badge">
            📏 {[
              item.height && `H:${item.height}`,
              item.width && `W:${item.width}`,
              item.length && `L:${item.length}`
            ].filter(Boolean).join(' × ')} {item.measurementUnit || 'in'}
          </div>
        )}
        {item.weight && (
          <div className="weight-badge">
            ⚖️ {item.weight} {item.weightUnit || 'lbs'}
          </div>
        )}
      </>
    ) : (
      <div className="no-measurements">No measurements</div>
    )}
  </div>
  
  <button 
    className="measurement-edit-btn"
    onClick={() => openMeasurementModal(item, order.id)}
    title="Edit Measurements"
  >
    📏
  </button>
</div>

{/* Show if recently measured */}
{item.measuredAt && (
  <div className="measured-info">
    {new Date(item.measuredAt).toLocaleDateString()}
  </div>
)}

// ====================================
// STEP 5: ADD MODAL AT END OF JSX
// ====================================
// Add this before the closing fragment/div of your component:
{measurementModal.isOpen && (
  <MeasurementModal
    item={measurementModal.item}
    orderId={measurementModal.orderId}
    isOpen={measurementModal.isOpen}
    onClose={closeMeasurementModal}
    onSave={handleMeasurementSave}
  />
)}

// ====================================
// STEP 6: ADD STYLES TO board.css
// ====================================
/* Add these styles to your web/app/admin/board/board.css file: */

/* Measurement Section Styles */
.measurement-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #404040;
}

.measurement-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dimension-badge,
.weight-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background-color: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 4px;
  font-size: 11px;
  color: #a0a0a0;
  white-space: nowrap;
}

.no-measurements {
  font-size: 11px;
  color: #666;
  font-style: italic;
}

.measurement-edit-btn {
  padding: 4px 8px;
  background-color: #383838;
  border: 1px solid #505050;
  border-radius: 4px;
  color: #e4e4e4;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.measurement-edit-btn:hover {
  background-color: #404040;
  border-color: #606060;
  transform: scale(1.05);
}

/* Visual indicator that measurements are always editable */
.order-locked .measurement-edit-btn {
  border-color: #ef4444;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.measured-info {
  font-size: 10px;
  color: #666;
  margin-top: 4px;
  text-align: right;
}

/* Lock indicator with measurement notice */
.order-locked-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background-color: #7f1d1d;
  border: 1px solid #991b1b;
  border-radius: 4px;
  color: #fecaca;
  font-size: 12px;
  margin-left: 10px;
}

.lock-info {
  position: relative;
}

.lock-info:hover::after {
  content: "Customer info and quantities are locked. Measurements can still be updated.";
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  padding: 8px;
  background-color: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 4px;
  font-size: 11px;
  color: #a0a0a0;
  white-space: nowrap;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}