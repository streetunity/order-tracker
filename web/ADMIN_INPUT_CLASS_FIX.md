// Patch file to update input classes in EditableRow component
// Apply these changes to web/app/admin/orders/[id]/page.jsx

// Find around line 1098-1109 (the private notes input)
// Change FROM:
//   className="input"
// TO:
//   className="input-admin"

// Find around line 1114-1127 (the price input) 
// Change FROM:
//   className="input"
// TO:
//   className="input-admin"

// These are the only two inputs that need to change - they're in the admin-only second row
// The regular item inputs in the first row should keep className="input"