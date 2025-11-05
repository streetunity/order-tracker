/**
 * Role Hierarchy Helper Functions
 *
 * Hierarchy:
 * SUPER_ADMIN (Level 5) - Full system access
 * ACCOUNTANT (Level 4) - Financial management
 * ADMIN (Level 3) - Standard admin
 * AGENT (Level 2) - Basic user
 * BROKER (Level 1) - Read-only access to all orders, can see broker links
 * MANUFACTURER (Level 1) - External manufacturer access
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',
  BROKER: 'BROKER',
  MANUFACTURER: 'MANUFACTURER'
};

export const ROLE_LEVELS = {
  SUPER_ADMIN: 5,
  ACCOUNTANT: 4,
  ADMIN: 3,
  AGENT: 2,
  BROKER: 1,
  MANUFACTURER: 1
};

export const ROLE_DISPLAY_NAMES = {
  SUPER_ADMIN: 'Super Admin',
  ACCOUNTANT: 'Accountant',
  ADMIN: 'Admin',
  AGENT: 'Agent',
  BROKER: 'Broker',
  MANUFACTURER: 'Manufacturer'
};

/**
 * Get the hierarchy level for a role
 * @param {string} role - Role name
 * @returns {number} - Level (1-5)
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

/**
 * Check if user is Manufacturer role
 * @param {string} role - User role
 * @returns {boolean}
 */
export function isManufacturer(role) {
  return role === ROLES.MANUFACTURER;
}

/**
 * Check if user is Broker role
 * @param {string} role - User role
 * @returns {boolean}
 */
export function isBroker(role) {
  return role === ROLES.BROKER;
}

/**
 * Check if user has read-only access (Manufacturer or Broker)
 * @param {string} role - User role
 * @returns {boolean}
 */
export function isReadOnly(role) {
  return isManufacturer(role) || isBroker(role);
}
