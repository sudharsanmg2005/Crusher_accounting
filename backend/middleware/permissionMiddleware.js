export const ACCESS_LEVELS = {
  FULL_ACCESS: 'full_access',
  READ_ONLY: 'read_only',
  CREATE_BILLS: 'create_bills'
};

export const isSuperAdmin = (user) => user?.role === 'super_admin';

export const canWrite = (user) =>
  isSuperAdmin(user) || user?.accessLevel === ACCESS_LEVELS.FULL_ACCESS;

export const canCreateBills = (user) =>
  canWrite(user) || user?.accessLevel === ACCESS_LEVELS.CREATE_BILLS;

export const requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
};

export const requireWriteAccess = (req, res, next) => {
  if (!canWrite(req.user)) {
    return res.status(403).json({ message: 'Full access required' });
  }
  next();
};

export const requireBillCreateAccess = (req, res, next) => {
  if (!canCreateBills(req.user)) {
    return res.status(403).json({ message: 'Bill creation access required' });
  }
  next();
};
