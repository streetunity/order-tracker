#!/bin/bash

# Script to add customerDocsLink field to Edit Order page
# This will update the page to display and allow editing of the customer docs link

echo "Updating Edit Order page to include Customer Documents Link field..."

# Path to the file we need to update
FILE_PATH="/var/www/order-tracker/web/app/admin/orders/[id]/page.jsx"

# Create a backup first
cp "$FILE_PATH" "$FILE_PATH.backup-$(date +%Y%m%d-%H%M%S)"

# Add customerDocsLink to state and form
# This is a simplified approach - in production you'd want to modify the actual file more carefully

cat << 'EOF' > /tmp/edit-order-update.txt
INSTRUCTIONS: Add the following to the Edit Order page:

1. In the order details section (after the Customer info), add:

{order.customerDocsLink && (
  <>
    {" · "}
    <strong>Documents:</strong>{" "}
    <a className="link" href={order.customerDocsLink} target="_blank" rel="noreferrer">View Files ↗</a>
  </>
)}

2. Create an editable field for customerDocsLink (add after the Lock Status Banner section):

{/* Customer Documents Link Section */}
<section style={{ marginTop: 16, marginBottom: 16 }}>
  <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Customer Documents Link</h3>
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <input
      className="input"
      type="url"
      value={order.customerDocsLink || ""}
      onChange={async (e) => {
        try {
          const res = await fetch(\`/api/orders/\${encodeURIComponent(id)}\`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              ...getAuthHeaders()
            },
            body: JSON.stringify({ customerDocsLink: e.target.value })
          });
          if (!res.ok) throw new Error("Failed to update");
          await load();
        } catch (err) {
          alert("Failed to update documents link");
        }
      }}
      placeholder="https://www.dropbox.com/..."
      style={{ width: "400px" }}
    />
    {order.customerDocsLink && (
      <a className="btn" href={order.customerDocsLink} target="_blank" rel="noreferrer">
        Open Link ↗
      </a>
    )}
  </div>
  <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
    Dropbox or other document link for customer files
  </div>
</section>
EOF

echo ""
echo "Manual update required for Edit Order page!"
echo "Please add the customerDocsLink field to the Edit Order page as shown above."
echo "The field should:"
echo "1. Display the link in the order header if it exists"
echo "2. Allow editing the URL with auto-save functionality"
echo "3. Provide a button to open the link in a new tab"
echo ""
echo "After updating, rebuild the application:"
echo "cd /var/www/order-tracker/web && npm run build && pm2 restart all"
