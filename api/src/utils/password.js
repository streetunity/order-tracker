// api/src/utils/password.js
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} True if passwords match
 */
export async function comparePassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} Validation result with isValid and message
 */
export function validatePassword(password) {
  if (!password) {
    return { isValid: false, message: 'Password is required' };
  }
  
  if (password.length < 6) {
    return { isValid: false, message: 'Password must be at least 6 characters long' };
  }
  
  if (password.length > 100) {
    return { isValid: false, message: 'Password must be less than 100 characters' };
  }
  
  // Optional: Add more password strength requirements
  // if (!/[A-Z]/.test(password)) {
  //   return { isValid: false, message: 'Password must contain at least one uppercase letter' };
  // }
  
  // if (!/[0-9]/.test(password)) {
  //   return { isValid: false, message: 'Password must contain at least one number' };
  // }
  
  return { isValid: true, message: 'Password is valid' };
}