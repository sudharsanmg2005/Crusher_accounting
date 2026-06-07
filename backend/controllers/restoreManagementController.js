import {
  getRestorePreview,
  restoreCustomerRecord,
  restoreEmployeeRecord,
  bulkRestoreRecords
} from '../services/restoreService.js';
import {
  permanentlyDeleteCustomer as purgeCustomer,
  permanentlyDeleteEmployee as purgeEmployee
} from '../services/purgeService.js';

export const previewRestoreManagement = async (req, res, next) => {
  try {
    const preview = await getRestorePreview();
    res.json(preview);
  } catch (err) {
    next(err);
  }
};

export const restoreManagedCustomer = async (req, res, next) => {
  try {
    const { action = 'restore' } = req.body || {};
    const result = await restoreCustomerRecord(req.params.id, action);
    const statusCode = result.conflict ? 409 : 200;
    res.status(statusCode).json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const restoreManagedEmployee = async (req, res, next) => {
  try {
    const { action = 'restore' } = req.body || {};
    const result = await restoreEmployeeRecord(req.params.id, action);
    const statusCode = result.conflict ? 409 : 200;
    res.status(statusCode).json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const bulkRestoreManagedRecords = async (req, res, next) => {
  try {
    const { records = [], action = 'restore' } = req.body || {};
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'records array is required' });
    }

    const results = await bulkRestoreRecords(records, action);
    const summary = {
      total: results.length,
      restored: results.filter((item) => item.status === 'Restored').length,
      existing: results.filter((item) => item.status === 'Existing').length,
      failed: results.filter((item) => item.status === 'Failed').length
    };

    res.json({
      summary,
      results,
      auditDetails: `Bulk restore: ${summary.restored} restored, ${summary.existing} existing, ${summary.failed} failed`
    });
  } catch (err) {
    next(err);
  }
};

export const restoreAllManagedRecords = async (req, res, next) => {
  try {
    const { type = 'all', action = 'restore' } = req.body || {};
    const preview = await getRestorePreview();

    const records = [];
    if (type === 'all' || type === 'Customer') {
      preview.customers
        .filter((item) => item.restoreStatus === 'Available')
        .forEach((item) => records.push({ type: 'Customer', id: item.backup._id.toString() }));
    }
    if (type === 'all' || type === 'Employee') {
      preview.employees
        .filter((item) => item.restoreStatus === 'Available')
        .forEach((item) => records.push({ type: 'Employee', id: item.backup._id.toString() }));
    }

    const results = await bulkRestoreRecords(records, action);
    const summary = {
      total: results.length,
      restored: results.filter((item) => item.status === 'Restored').length,
      existing: results.filter((item) => item.status === 'Existing').length,
      failed: results.filter((item) => item.status === 'Failed').length
    };

    res.json({
      summary,
      results,
      auditDetails: `Restore all available (${type}): ${summary.restored} restored, ${summary.failed} failed`
    });
  } catch (err) {
    next(err);
  }
};

export const permanentDeleteManagedCustomer = async (req, res, next) => {
  try {
    const result = await purgeCustomer(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const permanentDeleteManagedEmployee = async (req, res, next) => {
  try {
    const result = await purgeEmployee(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};
