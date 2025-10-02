# Board Page - Required Changes

## Location: web/app/admin/board/page.jsx

## 1. Add state for yearly total (around line 20)

After the line:
```javascript
const [loading, setLoading] = useState(true);
```

Add:
```javascript
const [yearlyTotal, setYearlyTotal] = useState(null);
```

## 2. Add function to load yearly total

Before the `async function load()` function, add:

```javascript
async function loadYearlyTotal() {
  if (!user || !isAdmin) return;
  
  try {
    const res = await fetch("/api/orders/yearly-total", {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      setYearlyTotal(data);
    }
  } catch (e) {
    console.error("Failed to load yearly total:", e);
  }
}
```

## 3. Update useEffect to load yearly total

Find the useEffect that contains `load();` and add after it:

```javascript
if (isAdmin) {
  loadYearlyTotal();
}
```

So it looks like:
```javascript
useEffect(() => {
  if (user) {
    load();
    if (isAdmin) {
      loadYearlyTotal();
    }
  }
}, [user, isAdmin]);
```

## 4. Add yearly total display in the header

Find:
```javascript
<h1 className={styles.h1}>Orders Board</h1>
```

And add immediately after it:
```javascript
{isAdmin && yearlyTotal && (
  <div style={{
    marginLeft: "20px",
    padding: "8px 16px",
    backgroundColor: "#059669",
    color: "white",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "500"
  }}>
    {new Date().getFullYear()} Total: {yearlyTotal.formatted}
  </div>
)}
```

Make sure the h1 and the new div are both inside a flex container. If not already present, wrap them in:
```javascript
<div style={{ display: "flex", alignItems: "center" }}>
  <h1 className={styles.h1}>Orders Board</h1>
  {isAdmin && yearlyTotal && (
    <div style={{
      marginLeft: "20px",
      padding: "8px 16px",
      backgroundColor: "#059669",
      color: "white",
      borderRadius: "6px",
      fontSize: "14px",
      fontWeight: "500"
    }}>
      {new Date().getFullYear()} Total: {yearlyTotal.formatted}
    </div>
  )}
</div>
```