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
  const router = useRouter();

  // Load user from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
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
      
      // Store token and user data
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    setUser(null);
    router.push('/login');
  };

  // Get auth headers for API calls
  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      return {};
    }
    
    return {
      'Authorization': `Bearer ${token}`
    };
  };

  // Role checking functions
  const isSuperAdminUser = user ? isSuperAdmin(user.role) : false;
  const isAccountantOrHigherUser = user ? isAccountantOrHigher(user.role) : false;
  const isAdminOrHigherUser = user ? isAdminOrHigher(user.role) : false;
  
  // Legacy role checks for backward compatibility
  const isAdmin = isAdminOrHigherUser;
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

  const value = {
    user,
    loading,
    login,
    logout,
    getAuthHeaders,
    // Legacy role checks
    isAdmin,
    isAgent,
    // New role hierarchy checks
    isSuperAdmin: isSuperAdminUser,
    isAccountantOrHigher: isAccountantOrHigherUser,
    isAdminOrHigher: isAdminOrHigherUser,
    // Permission checking functions
    canEditUser,
    canDeactivateUser: canDeactivateUserCheck,
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
