/**
 * Role Hierarchy Helper Functions
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
 * @param {string} role - Role name
 * @returns {number} - Level (1-4)
 */
export function getRoleLevel(role) {
  return ROLE_LEVELS[role] || 0;
}

/**
 * Get display name for a role
 * @param {string} role - Role name
 * @returns {string} - Formatted display name
 */
export function getRoleDisplayName(role) {
  return ROLE_DISPLAY_NAMES[role] || role;
}

/**
 * Check if user can edit target user based on role hierarchy
 * Super Admins can edit other Super Admins
 * @param {string} userRole - Current user's role
 * @param {string} targetRole - Target user's role
 * @returns {boolean}
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
 * @param {string} userRole - Current user's role
 * @param {string} targetRole - Role to be assigned
 * @returns {boolean}
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
 * @param {string} userRole - Current user's role
 * @param {string} targetRole - Target user's role
 * @returns {boolean}
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
 * @param {string} userRole - Current user's role
 * @returns {string[]} - Array of role names
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
 * Validate if a role name is valid
 * @param {string} role - Role to validate
 * @returns {boolean}
 */
export function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

/**
 * Check if user is Super Admin
 * @param {string} role - User role
 * @returns {boolean}
 */
export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN;
}

/**
 * Check if user is Accountant or higher
 * @param {string} role - User role
 * @returns {boolean}
 */
export function isAccountantOrHigher(role) {
  return getRoleLevel(role) >= ROLE_LEVELS.ACCOUNTANT;
}

/**
 * Check if user is Admin or higher
 * @param {string} role - User role
 * @returns {boolean}
 */
export function isAdminOrHigher(role) {
  return getRoleLevel(role) >= ROLE_LEVELS.ADMIN;
}
