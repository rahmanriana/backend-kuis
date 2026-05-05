/**
 * Generate a random 6-character alphanumeric uppercase code
 * @returns {string} Random code consisting of A-Z and 0-9
 */
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = { generateCode };