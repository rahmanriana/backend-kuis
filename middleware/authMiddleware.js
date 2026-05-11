function ensureAuthenticated(req, res, next) {
  if (req.user) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Authentication required' });
}

module.exports = {
  ensureAuthenticated
};
