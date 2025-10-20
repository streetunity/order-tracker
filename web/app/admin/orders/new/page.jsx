  // New function to load users
  async function loadUsers() {
    if (!user) return;
    
    try {
      const res = await fetch("/api/users/sales-reps", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        // If not admin or error, just use current user if they can be a sales rep
        if (user.name !== "Admin User") {
          setUsers([{ id: user.id, name: user.name, email: user.email }]);
        } else {
          setUsers([]);
        }
        return;
      }
      const data = await res.json();
      // Data is already filtered to active users with canBeSalesRep: true
      const sortedUsers = (Array.isArray(data) ? data : [])
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
      setUsers(sortedUsers);
    } catch (e) {
      // If error loading users, just use current user (unless it's Admin User)
      console.error("Failed to load users:", e);
      if (user.name !== "Admin User") {
        setUsers([{ id: user.id, name: user.name, email: user.email }]);
      } else {
        setUsers([]); // If current user is Admin User, show empty list
      }
    }
  }