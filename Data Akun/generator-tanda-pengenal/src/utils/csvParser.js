import Papa from 'papaparse';
import {
  analyzeCsvPrivacy,
  cleanName,
  getUniqueClasses,
  isLikelyEmptyRow,
  normalizeIdentityRow,
  validateCardUser,
  validateCardUsers,
} from './identityCard.js';

/**
 * Parse CSV file and return structured identity-card data plus privacy warnings.
 * Required operational fields: nama, tempat_lahir, tanggal_lahir, nisn, alamat.
 * TTL aliases are supported and qr_value is optional because it can fall back to NISN.
 * Sensitive and unknown columns are reported by name only and never copied to users.
 * @param {File} file - CSV file to parse
 * @returns {Promise<{ users: Array, privacyReport: Object }>} - Parsed safe user data
 */
export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        try {
          const rows = getDataRows(results.data);
          const users = processCSVData(rows);
          const privacyReport = analyzeCsvPrivacy(results.meta?.fields || Object.keys(rows[0] || {}), rows);
          resolve({ users, privacyReport });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
};

const getDataRows = (data) => {
  return Array.isArray(data) ? data.filter((row) => !isLikelyEmptyRow(row)) : [];
};

/**
 * Process raw CSV data into safe structured identity-card user objects.
 * @param {Array} data - Raw CSV rows kept only in memory during parsing
 * @returns {Array} - Sanitized user objects
 */
const processCSVData = (data) => {
  return data.map((row, index) => normalizeIdentityRow(row, index));
};

/**
 * Validate user data for official vertical identity cards.
 * @param {Object} user - User object to validate
 * @returns {Object} - Validation result { isValid, errors }
 */
export const validateUser = (user) => validateCardUser(user);

/**
 * Validate all users and return validation report.
 * @param {Array} users - Array of user objects
 * @returns {Object} - Validation report
 */
export const validateUsers = (users) => validateCardUsers(users);

export { cleanName, getUniqueClasses };

export default {
  parseCSV,
  validateUser,
  validateUsers,
  cleanName,
  getUniqueClasses,
};
