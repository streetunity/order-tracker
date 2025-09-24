#!/bin/bash
# Test measurements endpoint directly

echo "Testing measurements endpoint directly..."

# Test with curl
curl -X PATCH http://50.19.66.100:4000/orders/cmfx6o86000028xbh3wijunwm/items/cmfx6o86000038xbhg2mg1fbd/measurements \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "height": 100,
    "width": 100,
    "length": 100,
    "weight": 200,
    "measurementUnit": "in",
    "weightUnit": "lbs"
  }' \
  -v

echo ""
echo "Response received. Check for errors above."
