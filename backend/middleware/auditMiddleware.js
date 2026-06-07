import AuditLog from '../models/AuditLog.js';

const describeAction = (method, path, body = {}) => {
  if (method === 'PATCH' && path.includes('/restore')) {
    const actionTaken = body?.action || 'Restore';
    return `Restore ${actionTaken}`;
  }
  if (method === 'POST' && path.includes('/restore-management/bulk')) return 'Bulk restore';
  if (method === 'POST' && path.includes('/restore-management/restore-all')) return 'Restore all available';
  if (method === 'POST' && path.includes('/pay')) return 'Recorded payment';
  if (method === 'PUT' && path.includes('/auth/admins')) return 'Updated admin permissions';
  if (method === 'POST') return 'Created record';
  if (method === 'PUT' || method === 'PATCH') return 'Updated record';
  if (method === 'DELETE' && path.includes('/permanent')) return 'Permanently deleted record';
  if (method === 'DELETE') return 'Deleted record';
  return `${method} ${path}`;
};

const resourceFromPath = (path = '') => {
  if (path.includes('/restore-management')) return 'Restore Management';
  if (path.includes('/bills')) return 'Bill';
  if (path.includes('/customers')) return 'Customer';
  if (path.includes('/materials')) return 'Material';
  if (path.includes('/expenses')) return 'Expense';
  if (path.includes('/employees/salaries')) return 'Salary';
  if (path.includes('/employees/attendance')) return 'Attendance';
  if (path.includes('/employees')) return 'Employee';
  if (path.includes('/auth/admins')) return 'Admin';
  return 'Record';
};

const sanitizeBody = (body = {}) => {
  if (!body || typeof body !== 'object') return body;
  const clone = { ...body };
  ['password', 'passwordHash', 'token'].forEach((key) => {
    if (key in clone) clone[key] = '[redacted]';
  });
  return clone;
};

export const auditWrites = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.user) {
    return next();
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const isRestoreAction = req.originalUrl.includes('/restore');
    const shouldAudit =
      (res.statusCode >= 200 && res.statusCode < 400) ||
      (res.statusCode === 409 && isRestoreAction);

    if (shouldAudit) {
      AuditLog.create({
        actor: req.user.userId,
        actorName: req.user.name || req.user.username || 'Admin',
        actorUsername: req.user.username || '',
        action: describeAction(req.method, req.originalUrl, req.body),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        targetId: req.params?.id || body?._id || body?.id || body?.bill?._id || body?.restored?._id,
        targetLabel: body?.restoreAudit?.phoneNumber || body?.restored?.phone || body?.restored?.name,
        metadata: {
          resource: resourceFromPath(req.originalUrl),
          details: body?.auditDetails || body?.message || '',
          body: sanitizeBody(req.body),
          responseMessage: body?.message,
          recordType: body?.restoreAudit?.recordType || resourceFromPath(req.originalUrl),
          phoneNumber: body?.restoreAudit?.phoneNumber || body?.restored?.phone || req.body?.phone,
          actionTaken: body?.restoreAudit?.actionTaken || req.body?.action || describeAction(req.method, req.originalUrl, req.body),
          restoredBy: req.user.name || req.user.username || 'Admin'
        }
      }).catch((err) => {
        console.error('Audit log failed:', err.message);
      });
    }
    return originalJson(body);
  };

  next();
};
