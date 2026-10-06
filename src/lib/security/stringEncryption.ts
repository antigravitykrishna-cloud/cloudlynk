/**
 * String Encryption Module
 * Encrypts sensitive strings at compile time to prevent easy reversing
 * Uses XOR cipher with random key rotation
 */

import { Platform } from 'react-native';

// Randomly generated keys for cipher (rotate keys to make analysis harder)
const CIPHER_KEYS = [
  [0x7a, 0x4f, 0x82, 0xb3, 0x61, 0xd4, 0x23, 0x19],
  [0x91, 0x2e, 0xa7, 0x5c, 0xb8, 0x43, 0xf1, 0x76],
  [0x3b, 0xc2, 0x69, 0xe5, 0x47, 0xd8, 0x1f, 0x94],
];

let keyIndex = 0;

/**
 * Simple XOR-based cipher for compile-time string encryption
 * Use this during build time to encrypt sensitive strings
 */
function xorEncrypt(text: string, key: number[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    bytes.push(text.charCodeAt(i) ^ key[i % key.length]);
  }
  return bytes;
}

/**
 * Decrypt XOR-encrypted string at runtime
 */
function xorDecrypt(bytes: number[], key: number[]): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i] ^ key[i % key.length]);
  }
  return result;
}

/**
 * Decrypt sensitive strings
 * Call this at runtime only when needed
 */
export function decryptString(encryptedBytes: number[]): string {
  const key = CIPHER_KEYS[keyIndex++ % CIPHER_KEYS.length];
  return xorDecrypt(encryptedBytes, key);
}

/**
 * Obfuscated API endpoints
 */
export const ApiEndpoints = {
  classifyPersona: () =>
    decryptString([
      0x66, 0x6a, 0x7c, 0x5b, 0x41, 0x2a, 0x57, 0x3e, 0x79, 0x4d, 0x68, 0x5c, 0x3f, 0x4a, 0x6e,
    ]),
  recordDevice: () =>
    decryptString([0x72, 0x5f, 0x6d, 0x48, 0x59, 0x36, 0x7a, 0x4b, 0x65, 0x3c, 0x5e, 0x72]),
  checkReview: () => decryptString([0x6c, 0x4d, 0x72, 0x5a, 0x4f, 0x2c, 0x6e, 0x43]),
};

/**
 * Sensitive strings that could reveal functionality
 */
export const SensitiveStrings = {
  personaReviewer: () => decryptString([0x72, 0x5e, 0x7e, 0x49, 0x65, 0x3f, 0x65, 0x72]),
  personaOrganic: () => decryptString([0x71, 0x52, 0x6f, 0x4a, 0x6e, 0x27, 0x63]),
  cloakingActive: () =>
    decryptString([0x63, 0x4b, 0x76, 0x58, 0x4a, 0x38, 0x7b, 0x3f, 0x5c, 0x24, 0x7a, 0x6e]),
};
