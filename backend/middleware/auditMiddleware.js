import AuditLog from '../models/AuditLog.js';
import Customer from '../models/Customer.js';
import Bill from '../models/Bill.js';
import Employee from '../models/Employee.js';
import Expense from '../models/Expense.js';
import Buyer from '../models/Buyer.js';
import Material from '../models/Material.js';
import Load from '../models/Load.js';
import User from '../models/User.js';

export const getModelByResource = (resource) => {
  switch (resource) {
    case 'Customer': return Customer;
    case 'Bill': return Bill;
    case 'Employee': return Employee;
    case 'Expense': return Expense;
    case 'Buyer': return Buyer;
    case 'Material': return Material;
    case 'Load': return Load;
    case 'Admin': return User;
    default: return null;
  }
};

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
  if (path.includes('/loads')) return 'Load';
  if (path.includes('/buyers')) return 'Buyer';
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

const sanitizeDocument = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  const clone = JSON.parse(JSON.stringify(doc));
  const keysToRedact = ['password', 'passwordHash', 'token', 'salt'];
  keysToRedact.forEach((key) => {
    if (key in clone) clone[key] = '[redacted]';
  });
  return clone;
};

export const auditWrites = async (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.user) {
    return next();
  }

  let oldDocument = null;
  const isEdit = ['PUT', 'PATCH'].includes(req.method);
  const resource = resourceFromPath(req.originalUrl);

  if (isEdit) {
    try {
      const match = req.originalUrl.match(/\/([0-9a-fA-F]{24})/);
      if (match) {
        const id = match[1];
        const Model = getModelByResource(resource);
        if (Model) {
          oldDocument = await Model.findById(id).lean();
        }
      }
    } catch (err) {
      console.error('Audit: failed to fetch old document', err.message);
    }
  }

  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    const isRestoreAction = req.originalUrl.includes('/restore');
    const shouldAudit =
      (res.statusCode >= 200 && res.statusCode < 400) ||
      (res.statusCode === 409 && isRestoreAction);

    if (shouldAudit) {
      let newDocument = null;
      if (isEdit && oldDocument) {
        try {
          const Model = getModelByResource(resource);
          if (Model) {
            newDocument = await Model.findById(oldDocument._id).lean();
          }
        } catch (err) {
          console.error('Audit: failed to fetch new document', err.message);
        }
      }

      AuditLog.create({
        actor: req.user.userId,
        actorName: req.user.name || req.user.username || 'Admin',
        actorUsername: req.user.username || '',
        action: describeAction(req.method, req.originalUrl, req.body),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        targetId: req.params?.id || body?._id || body?.id || body?.bill?._id || body?.restored?._id || (oldDocument ? oldDocument._id.toString() : undefined),
        targetLabel: body?.restoreAudit?.phoneNumber || body?.restored?.phone || body?.restored?.name || (oldDocument ? (oldDocument.name || oldDocument.billNumber || oldDocument.type) : undefined),
        metadata: {
          resource,
          details: body?.auditDetails || body?.message || '',
          body: sanitizeBody(req.body),
          responseMessage: body?.message,
          recordType: body?.restoreAudit?.recordType || resource,
          phoneNumber: body?.restoreAudit?.phoneNumber || body?.restored?.phone || req.body?.phone || (oldDocument ? oldDocument.phone : undefined),
          actionTaken: body?.restoreAudit?.actionTaken || req.body?.action || describeAction(req.method, req.originalUrl, req.body),
          restoredBy: req.user.name || req.user.username || 'Admin',
          oldDocument: oldDocument ? sanitizeDocument(oldDocument) : undefined,
          newDocument: newDocument ? sanitizeDocument(newDocument) : undefined
        }
      }).catch((err) => {
        console.error('Audit log failed:', err.message);
      });
    }
    return originalJson(body);
  };

  next();
};
