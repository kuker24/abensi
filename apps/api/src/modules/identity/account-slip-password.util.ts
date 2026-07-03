import { randomInt } from 'node:crypto';

const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT_CHARS = '23456789';
const PASSWORD_ALPHABET = `${UPPERCASE_CHARS}${LOWERCASE_CHARS}${DIGIT_CHARS}`;
const DEFAULT_LENGTH = 14;

export function generateAccountSlipPassword(length = DEFAULT_LENGTH) {
  if (!Number.isInteger(length) || length < 12 || length > 32) {
    throw new Error('Panjang password slip akun harus 12-32 karakter.');
  }

  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }

  return password;
}
