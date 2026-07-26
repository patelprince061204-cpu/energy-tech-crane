// src/lib/validators.js
// Shared input constraints, mirrored server-side for real enforcement.
// These are used as onKeyDown/onChange filters so the user can't even type
// an invalid character, plus as pre-submit checks for a clear error message.

export const ALPHA_RE = /^[A-Za-z\s.'-]*$/;
// Address allows commas and line breaks too, since City/State are now typed
// into the same free-text field rather than separate boxes.
export const ADDRESS_RE = /^[A-Za-z\s.,'\n-]*$/;
export const DIGITS_RE = /^[0-9]*$/;
export const MOBILE_RE = /^[0-9]{10}$/;

// Strips anything that isn't a letter/space/. '- as the user types
export function alphaOnly(value) {
  return value.replace(/[^A-Za-z\s.'-]/g, '');
}

// Strips anything that isn't a letter/space/comma/newline/. '- as the user types
export function addressAlphaOnly(value) {
  return value.replace(/[^A-Za-z\s.,'\n-]/g, '');
}

export function isAddressAlpha(value) {
  return ADDRESS_RE.test(value || '');
}

// Strips anything that isn't a digit as the user types
export function digitsOnly(value) {
  return value.replace(/[^0-9]/g, '');
}

// Mobile: digits only, capped at 10 characters while typing
export function mobileInput(value) {
  return digitsOnly(value).slice(0, 10);
}

export function isValidMobile(value) {
  return MOBILE_RE.test(value || '');
}

export function isAlpha(value) {
  return ALPHA_RE.test(value || '');
}
