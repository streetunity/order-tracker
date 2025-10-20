/**
 * Frontend Role Hierarchy Helper Functions
 * 
 * Hierarchy:
 * SUPER_ADMIN (Level 4) - Full system access
 * ACCOUNTANT (Level 3) - Financial management
 * ADMIN (Level 2) - Standard admin
 * AGENT (Level 1) - Basic user
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  ADMIN: 'ADMIN',
  AGENT: 'AGENT'
};

export const ROLE_LEVELS = {
  SUPER_ADMIN: 4,
  ACCOUNTANT: 3,
  ADMIN: 2,
  AGENT: 1
};

export const ROLE_DISPLAY_NAMES = {
  SUPER_ADMIN: 'Super Admin',
  ACCOUNTANT: 'Accountant',
  ADMIN: 'Admin',
  AGENT: 'Agent'
};

/**
 * Get the hierarchy level for a role
 */
export function getRoleLevel(role) {
  return ROLE_LEVELS[role] || 0;
}

/**
 * Get display name for a role
 */
export function getRoleDisplayName(role) {
  return ROLE_DISPLAY_NAMES[role] || role;
}

/**
 * Check if user can edit target user based on role hierarchy
 * Super Admins can edit other Super Admins
 */
export function canEditRole(userRole, targetRole) {
  const userLevel = getRoleLevel(userRole);
  const targetLevel = getRoleLevel(targetRole);
  // Super Admins can edit users at their level or below
  if (userRole === ROLES.SUPER_ADMIN) {
    return userLevel >= targetLevel;
  }
  // Other roles can only edit users below them
  return userLevel > targetLevel;
}

/**
 * Check if user can create a user with target role
 */
export function canCreateRole(userRole, targetRole) {
  const userLevel = getRoleLevel(userRole);
  const targetLevel = getRoleLevel(targetRole);
  // Can create roles at their level or below
  return userLevel >= targetLevel;
}

/**
 * Check if user can deactivate target user
 * Super Admins can deactivate other Super Admins
 */
export function canDeactivateUser(userRole, targetRole) {
  const userLevel = getRoleLevel(userRole);
  const targetLevel = getRoleLevel(targetRole);
  // Super Admins can deactivate users at their level or below
  if (userRole === ROLES.SUPER_ADMIN) {
    return userLevel >= targetLevel;
  }
  // Other roles can only deactivate users below them
  return userLevel > targetLevel;
}

/**
 * Get list of roles that a user can assign
 */
export function getAssignableRoles(userRole) {
  const userLevel = getRoleLevel(userRole);
  const assignableRoles = [];
  
  for (const [role, level] of Object.entries(ROLE_LEVELS)) {
    if (userLevel >= level) {
      assignableRoles.push(role);
    }
  }
  
  return assignableRoles.sort((a, b) => ROLE_LEVELS[b] - ROLE_LEVELS[a]);
}

/**
 * Check if user is Super Admin
 */
export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN;
}

/**
 * Check if user is Accountant or higher
 */
export function isAccountantOrHigher(role) {
  return getRoleLevel(role) >= ROLE_LEVELS.ACCOUNTANT;
}

/**
 * Check if user is Admin or higher
 */
export function isAdminOrHigher(role) {
  return getRoleLevel(role) >= ROLE_LEVELS.ADMIN;
}

/**
 * Get badge color based on role
 */
export function getRoleBadgeColor(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return { bg: '#7c2d12', text: '#fed7aa' }; // Dark orange/amber
    case ROLES.ACCOUNTANT:
      return { bg: '#1e3a8a', text: '#bfdbfe' }; // Dark blue
    case ROLES.ADMIN:
      return { bg: '#581c87', text: '#e9d5ff' }; // Purple
    case ROLES.AGENT:
      return { bg: '#404040', text: '#e4e4e4' }; // Gray
    default:
      return { bg: '#404040', text: '#e4e4e4' }; // Default gray
  }
}
