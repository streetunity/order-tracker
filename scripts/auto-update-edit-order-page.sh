#!/bin/bash

# Automated script to add customerDocsLink to Edit Order page
# This script will automatically patch the Edit Order page file

echo "Updating Edit Order page with Customer Documents Link field..."

# The file to update
FILE="/var/www/order-tracker/web/app/admin/orders/[id]/page.jsx"

# Create a backup
cp "$FILE" "$FILE.backup-$(date +%Y%m%d-%H%M%S)"

# Use sed to add the customerDocsLink display in the order details section
# This adds it after the "Created by" section
sed -i '/Created by:.*{order.createdBy.name}/a\
                  )}\
                {order.customerDocsLink && (\
                  <>\
                    {" · "}\
                    <strong>Documents:</strong>{" "}\
                    <a className="link" href={order.customerDocsLink} target="_blank" rel="noreferrer">View Files ↗</a>\
                  </>\
                )}' "$FILE"

# Add the editable Customer Documents Link section after the lock status banner
# Find the closing of lock status section and add our new section
sed -i '/<\/section>/a\
\
          {/* Customer Documents Link Section */}\
          <section style={{ marginTop: 16, marginBottom: 16 }}>\
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Customer Documents Link</h3>\
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>\
              <input\
                className="input"\
                type="url"\
                value={order.customerDocsLink || ""}\
                onChange={async (e) => {\
                  try {\
                    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {\
                      method: "PATCH",\
                      headers: {\
                        "content-type": "application/json",\
                        ...getAuthHeaders()\
                      },\
                      body: JSON.stringify({ customerDocsLink: e.target.value })\
                    });\
                    if (!res.ok) throw new Error("Failed to update");\
                    await load();\
                  } catch (err) {\
                    alert("Failed to update documents link");\
                  }\
                }}\
                placeholder="https://www.dropbox.com/..."\
                style={{ width: "400px" }}\
              />\
              {order.customerDocsLink && (\
                <a className="btn" href={order.customerDocsLink} target="_blank" rel="noreferrer">\
                  Open Link ↗\
                </a>\
              )}\
            </div>\
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>\
              Dropbox or other document link for customer files\
            </div>\
          </section>' "$FILE"

echo "Edit Order page has been updated successfully!"
