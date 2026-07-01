import Papa from 'papaparse';
import {
  cleanName,
  getUniqueClasses,
  isLikelyEmptyRow,
  normalizeIdentityRow,
  validateCardUser,
  validateCardUsers,
} from './identityCard';

/**
 * Parse CSV file and return structured identity-card data.
 * Required operational fields: nama, tempat_lahir, tanggal_lahir, nisn, alamat.
 * TTL aliases are supported and qr_value is optional because it can fall back to NISN.
 * @param {File} file - CSV file to parse
 * @returns {Promise<Array>} - Parsed user data
 */
export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        try {
          const users = processCSVData(results.data);
          resolve(users);
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

/**
 * Process raw CSV data into structured identity-card user objects.
 * @param {Array} data - Raw CSV data
 * @returns {Array} - Processed user objects
 */
const processCSVData = (data) => {
  return data
    .filter((row) => !isLikelyEmptyRow(row))
    .map((row, index) => normalizeIdentityRow(row, index));
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
