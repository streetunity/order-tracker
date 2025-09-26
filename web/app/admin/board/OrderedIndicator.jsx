// This file adds the ordered indicator ($) to items on the board
// Applied from ordered-indicator.patch

export const ORDERED_INDICATOR_STYLES = `
/* Ordered item indicator */
.ordered-indicator {
  display: inline-block;
  background-color: #16a34a;
  color: white;
  font-weight: bold;
  font-size: 14px;
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  margin-right: 8px;
  cursor: help;
}
`;

// Component to render the ordered indicator
export function OrderedIndicator({ item }) {
  if (!item.isOrdered) return null;
  
  const tooltipText = item.orderedAt && item.orderedBy 
    ? `Ordered on ${new Date(item.orderedAt).toLocaleDateString()} by ${item.orderedBy}`
    : 'Item ordered';
  
  return (
    <span 
      className="ordered-indicator" 
      title={tooltipText}
      style={{
        display: 'inline-block',
        backgroundColor: '#16a34a',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '14px',
        width: '20px',
        height: '20px',
        lineHeight: '20px',
        textAlign: 'center',
        borderRadius: '50%',
        marginRight: '8px',
        cursor: 'help'
      }}
    >
      $
    </span>
  );
}

// Instructions for integration:
// 1. Import this component in board/page.jsx
// 2. Add <OrderedIndicator item={item} /> before the delete button
// 3. The indicator will show a green $ for ordered items
