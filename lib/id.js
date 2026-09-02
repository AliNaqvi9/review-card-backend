const crypto = require("crypto");

// No 0/O, 1/l/I - avoids ids that are ambiguous when someone reads them aloud
// or types them by hand (not that they usually will, but cheap to avoid).
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateId(length = 7) {
  const bytes = crypto.randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

// Only allow what we ourselves generate, or short manual slugs a human might
// type in the admin form - keeps the /c/:id route param predictable.
const VALID_ID = /^[A-Za-z0-9_-]{1,40}$/;

// The self-serve edit link has no login behind it - this token IS the
// credential, so it needs to be long and unguessable, unlike the short
// public `id` above. 256 bits, URL-safe.
function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

module.exports = { generateId, generateToken, VALID_ID };
