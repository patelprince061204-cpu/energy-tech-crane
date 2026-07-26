// lib/fileSecurity.js
// Shared helpers for the file-upload endpoints (documents, material
// purchase bills, dispatch attachments, company logo/certificates/team
// photos). Two concerns, kept together since every upload endpoint needs
// both:
//
//   1. sanitizeHeaderFilename() - a filename is user-controlled input that
//      ends up inside an HTTP response header (Content-Disposition) on
//      every download. Unsanitized, a filename containing \r or \n makes
//      Node's http module throw ("Invalid character in header content"),
//      turning every future download of that file into a 500 error. A
//      filename containing a bare `"` can also break out of the quoted
//      attribute value per RFC 6266, letting extra header directives be
//      smuggled in for HTTP clients that parse that leniently. Stripping
//      control characters and escaping quotes closes both.
//
//   2. isAllowedImageType() - an allowlist for the few endpoints that are
//      supposed to only ever receive an image (company logo, certificate
//      badge, team member photo). The Documents module intentionally
//      accepts any file type (invoices, PDFs, agreements) - that's a
//      deliberate business decision, not a gap, so this allowlist is only
//      applied where an image is actually required.

// Strips characters that are unsafe inside an HTTP header value (CR, LF,
// and other control characters), then escapes any remaining double-quote
// so it can't break out of the quoted filename="..." attribute. Falls back
// to a safe default if nothing usable is left (e.g. a filename that was
// nothing but control characters).
function sanitizeHeaderFilename(name) {
  const cleaned = String(name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '') // strip all control chars, incl. \r \n \t
    .replace(/"/g, "'") // quotes would otherwise close the attribute early
    .trim();
  return cleaned || 'download';
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);

function isAllowedImageType(mimeType) {
  return ALLOWED_IMAGE_MIME_TYPES.has(String(mimeType || '').toLowerCase());
}

module.exports = { sanitizeHeaderFilename, isAllowedImageType };
