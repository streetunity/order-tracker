#!/bin/bash
# Script to fix three issues in the order tracker application

echo "Applying fixes for customerDocsLink and audit logs..."

# 1. Fix Edit Order page - Add customerDocsLink display and edit field
echo "Patching Edit Order page..."
FILE="/var/www/order-tracker/web/app/admin/orders/[id]/page.jsx"

# First check if customerDocsLink is already there
if grep -q "customerDocsLink" "$FILE"; then
    echo "customerDocsLink already exists in Edit Order page, skipping..."
else
    # Add customerDocsLink to the header display (after Created by)
    sed -i '/Created by:.* {order.createdBy.name}/a\
                {order.customerDocsLink && (\
                  <>\
                    {" · "}\
                    <strong>Documents:</strong>{" "}\
                    <a className="link" href={order.customerDocsLink} target="_blank" rel="noreferrer">View Files ↗</a>\
                  </>\
                )}' "$FILE"

    # Add the editable Customer Documents Link section
    # Find the line containing the closing tag for the Lock button section
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
                  const newValue = e.target.value;\
                  setOrder({...order, customerDocsLink: newValue});\
                  try {\
                    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {\
                      method: "PATCH",\
                      headers: {\
                        "content-type": "application/json",\
                        ...getAuthHeaders()\
                      },\
                      body: JSON.stringify({ customerDocsLink: newValue })\
                    });\
                    if (!res.ok) throw new Error("Failed to update");\
                  } catch (err) {\
                    alert("Failed to update documents link");\
                    await load();\
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
fi

# Fix audit log to properly display unlock reasons
echo "Fixing audit log display..."
# Replace the existing parsedReason display with a better implementation
sed -i '/log.parsedReason?.message && (/,+5d' "$FILE" 2>/dev/null
sed -i '/{log.action}/a\
                        {/* Show reason from metadata */}\
                        {log.metadata && (() => {\
                          try {\
                            const metadata = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;\
                            return metadata.message ? (\
                              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>\
                                Reason: {metadata.message}\
                              </div>\
                            ) : null;\
                          } catch {\
                            return null;\
                          }\
                        })()}\
                        {/* Also check parsedReason for backward compatibility */}\
                        {log.parsedReason?.message && (\
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>\
                            Reason: {log.parsedReason.message}\
                          </div>\
                        )}' "$FILE"

# 2. Fix New Order page - Update URL help text
echo "Patching New Order page..."
FILE="/var/www/order-tracker/web/app/admin/orders/new/page.jsx"

# Update the helper text
sed -i 's/Required: Dropbox or document link for customer files/Enter the full URL including http:\/\/ or https:\/\/ (e.g., https:\/\/www.dropbox.com\/your-folder)/' "$FILE" 2>/dev/null

# Update error message
sed -i 's/Please provide a valid URL for Customer Documents Link"/Please provide a valid URL for Customer Documents Link (must start with http:\/\/ or https:\/\/)"/' "$FILE" 2>/dev/null

echo "All fixes applied successfully!"
echo "Run 'pm2 restart order-tracker-frontend' to apply changes."