// Ensures the authenticated user is an admin.
export const requireAdmin = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

