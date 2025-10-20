"use client";

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  isSuperAdmin, 
  isAccountantOrHigher, 
  isAdminOrHigher,
  canEditRole,
  canDeactivateUser 
} from '../lib/roleUtils';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const router = useRouter();

  // Load token from localStorage on mount
  useEffect(() => {
    // Use 'token' as the key to match what other pages expect
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        // Clear invalid data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await res.json();
      
      // Store token and user data with consistent keys
      // Use 'token' not 'authToken' to match what the users page expects
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Also store with old key for backward compatibility (optional, can remove later)
      localStorage.setItem('authToken', data.token);
      
      setToken(data.token);
      setUser(data.user);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.message || 'Login failed' 
      };
    }
  };

  // Logout function
  const logout = () => {
    // Clear all auth-related items from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('authToken'); // Remove old key too
    localStorage.removeItem('user');
    
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  // Get auth headers for API calls
  const getAuthHeaders = () => {
    if (!token) return {};
    return {
      'Authorization': `Bearer ${token}`
    };
  };

  // Role checking functions using the new hierarchy
  const isSuperAdminUser = user ? isSuperAdmin(user.role) : false;
  const isAccountantOrHigherUser = user ? isAccountantOrHigher(user.role) : false;
  const isAdminOrHigherUser = user ? isAdminOrHigher(user.role) : false;
  
  // Legacy role checks for backward compatibility
  const isAdmin = isAdminOrHigherUser; // Now includes ADMIN, ACCOUNTANT, and SUPER_ADMIN
  const isAgent = user?.role === 'AGENT';

  // Permission checking functions
  const canEditUser = (targetUserRole) => {
    if (!user) return false;
    return canEditRole(user.role, targetUserRole);
  };

  const canDeactivateUserCheck = (targetUserRole) => {
    if (!user) return false;
    return canDeactivateUser(user.role, targetUserRole);
  };

  // Migration: Update old authToken to new token key
  useEffect(() => {
    const oldToken = localStorage.getItem('authToken');
    const newToken = localStorage.getItem('token');
    
    // If we have old token but not new token, migrate it
    if (oldToken && !newToken) {
      console.log('Migrating authToken to token');
      localStorage.setItem('token', oldToken);
      localStorage.removeItem('authToken');
    }
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    getAuthHeaders,
    // Legacy role checks (backward compatibility)
    isAdmin,
    isAgent,
    // New role hierarchy checks
    isSuperAdmin: isSuperAdminUser,
    isAccountantOrHigher: isAccountantOrHigherUser,
    isAdminOrHigher: isAdminOrHigherUser,
    // Permission checking functions
    canEditUser,
    canDeactivateUser: canDeactivateUserCheck,
    token
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
