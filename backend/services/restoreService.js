import Customer from '../models/Customer.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import { findActiveByPhone } from '../utils/phone.js';
import { normalizeVehicleNumber } from '../utils/vehicleNumber.js';

const buildAuditPayload = (recordType, phoneNumber, actionTaken, details) => ({
  auditDetails: details,
  restoreAudit: {
    recordType,
    phoneNumber: phoneNumber || '',
    actionTaken
  }
});

const mergeCustomerFields = (active, backup) => {
  if (!active.name?.trim() && backup.name) active.name = backup.name;
  if (!active.address?.trim() && backup.address) active.address = backup.address;
  const existingNumbers = new Set((active.vehicles || []).map((v) => normalizeVehicleNumber(v.number)));
  for (const vehicle of backup.vehicles || []) {
    const number = normalizeVehicleNumber(vehicle.number);
    if (number && !existingNumbers.has(number)) {
      active.vehicles.push({ number, addedAt: vehicle.addedAt || new Date() });
      existingNumbers.add(number);
    }
  }
};

const mergeEmployeeFields = (active, backup) => {
  if (!active.name?.trim() && backup.name) active.name = backup.name;
  if (!active.designation?.trim() && backup.designation) active.designation = backup.designation;
  if (!active.phone?.trim() && backup.phone) active.phone = backup.phone;
  if (backup.dailyWages != null && (!active.dailyWages || active.dailyWages === 0)) {
    active.dailyWages = backup.dailyWages;
  }
};

export const buildRestorePreviewItem = async (type, backup) => {
  const Model = type === 'Customer' ? Customer : Employee;
  const existingRecord = backup.phone
    ? await findActiveByPhone(Model, backup.phone, backup._id)
    : null;

  return {
    type,
    backup,
    existingRecord,
    restoreStatus: existingRecord ? 'Existing' : 'Available'
  };
};

export const getRestorePreview = async () => {
  const [archivedCustomers, archivedEmployees] = await Promise.all([
    Customer.find({ isDeleted: true }).sort({ updatedAt: -1 }),
    Employee.find({ isDeleted: true }).sort({ updatedAt: -1 })
  ]);

  const [customers, employees] = await Promise.all([
    Promise.all(archivedCustomers.map((record) => buildRestorePreviewItem('Customer', record))),
    Promise.all(archivedEmployees.map((record) => buildRestorePreviewItem('Employee', record)))
  ]);

  return { customers, employees };
};

export const restoreCustomerRecord = async (backupId, action = 'restore') => {
  const backup = await Customer.findById(backupId);
  if (!backup) {
    const err = new Error('Customer not found');
    err.statusCode = 404;
    throw err;
  }
  if (!backup.isDeleted) {
    const err = new Error('Customer is not in deleted backup');
    err.statusCode = 400;
    throw err;
  }

  const existing = backup.phone
    ? await findActiveByPhone(Customer, backup.phone, backup._id)
    : null;

  if (action === 'keep') {
    return {
      status: 'Existing',
      message: 'Kept current customer record; backup remains archived',
      backup,
      existingRecord: existing,
      ...buildAuditPayload(
        'Customer',
        backup.phone,
        'Keep',
        `Kept current customer for phone ${backup.phone || 'N/A'}; backup ${backup.name} not restored`
      )
    };
  }

  if (existing) {
    if (action === 'merge') {
      mergeCustomerFields(existing, backup);
      await existing.save();
      return {
        status: 'Restored',
        message: 'Merged backup into existing customer',
        restored: existing,
        backup,
        existingRecord: existing,
        ...buildAuditPayload(
          'Customer',
          backup.phone,
          'Merge',
          `Merged deleted customer ${backup.name} into existing record for phone ${backup.phone}`
        )
      };
    }

    if (action === 'replace') {
      existing.isDeleted = true;
      await existing.save();
      backup.isDeleted = false;
      await backup.save();
      return {
        status: 'Restored',
        message: 'Replaced current customer with backup record',
        restored: backup,
        backup,
        existingRecord: existing,
        ...buildAuditPayload(
          'Customer',
          backup.phone,
          'Replace',
          `Replaced active customer with backup ${backup.name} for phone ${backup.phone}`
        )
      };
    }

    return {
      status: 'Existing',
      message: 'An active customer with this phone number already exists',
      backup,
      existingRecord: existing,
      conflict: true,
      ...buildAuditPayload(
        'Customer',
        backup.phone,
        'Existing',
        `Restore blocked for ${backup.name}: phone ${backup.phone} already exists as ${existing.name}`
      )
    };
  }

  backup.isDeleted = false;
  await backup.save();
  return {
    status: 'Restored',
    message: 'Customer restored',
    restored: backup,
    backup,
    ...buildAuditPayload(
      'Customer',
      backup.phone,
      'Restore',
      `Restored customer ${backup.name} (${backup.phone || 'no phone'})`
    )
  };
};

export const restoreEmployeeRecord = async (backupId, action = 'restore') => {
  const backup = await Employee.findById(backupId);
  if (!backup) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  if (!backup.isDeleted) {
    const err = new Error('Employee is not in deleted backup');
    err.statusCode = 400;
    throw err;
  }

  const existing = backup.phone
    ? await findActiveByPhone(Employee, backup.phone, backup._id)
    : null;

  if (action === 'keep') {
    return {
      status: 'Existing',
      message: 'Kept current employee record; backup remains archived',
      backup,
      existingRecord: existing,
      ...buildAuditPayload(
        'Employee',
        backup.phone,
        'Keep',
        `Kept current employee for phone ${backup.phone || 'N/A'}; backup ${backup.name} not restored`
      )
    };
  }

  if (existing) {
    if (action === 'merge') {
      mergeEmployeeFields(existing, backup);
      existing.status = 'Active';
      existing.salarySettled = false;
      await existing.save();
      await Attendance.updateMany({ employee: existing._id }, { isArchived: false });
      return {
        status: 'Restored',
        message: 'Merged backup into existing employee',
        restored: existing,
        backup,
        existingRecord: existing,
        ...buildAuditPayload(
          'Employee',
          backup.phone,
          'Merge',
          `Merged deleted employee ${backup.name} into existing record for phone ${backup.phone}`
        )
      };
    }

    if (action === 'replace') {
      existing.isDeleted = true;
      existing.status = 'Inactive';
      await existing.save();
      await Attendance.updateMany({ employee: existing._id }, { isArchived: true });

      backup.isDeleted = false;
      backup.status = 'Active';
      backup.salarySettled = false;
      await backup.save();
      await Attendance.updateMany({ employee: backup._id }, { isArchived: false });

      return {
        status: 'Restored',
        message: 'Replaced current employee with backup record',
        restored: backup,
        backup,
        existingRecord: existing,
        ...buildAuditPayload(
          'Employee',
          backup.phone,
          'Replace',
          `Replaced active employee with backup ${backup.name} for phone ${backup.phone}`
        )
      };
    }

    return {
      status: 'Existing',
      message: 'An active employee with this phone number already exists',
      backup,
      existingRecord: existing,
      conflict: true,
      ...buildAuditPayload(
        'Employee',
        backup.phone,
        'Existing',
        `Restore blocked for ${backup.name}: phone ${backup.phone} already exists as ${existing.name}`
      )
    };
  }

  backup.isDeleted = false;
  backup.status = 'Active';
  backup.salarySettled = false;
  await backup.save();
  await Attendance.updateMany({ employee: backup._id }, { isArchived: false });

  return {
    status: 'Restored',
    message: 'Employee restored',
    restored: backup,
    backup,
    ...buildAuditPayload(
      'Employee',
      backup.phone,
      'Restore',
      `Restored employee ${backup.name} (${backup.phone || 'no phone'})`
    )
  };
};

export const bulkRestoreRecords = async (records = [], action = 'restore') => {
  const results = [];

  for (const record of records) {
    try {
      const result =
        record.type === 'Customer'
          ? await restoreCustomerRecord(record.id, record.action || action)
          : await restoreEmployeeRecord(record.id, record.action || action);

      results.push({
        type: record.type,
        id: record.id,
        success: result.status === 'Restored' || result.status === 'Existing',
        ...result
      });
    } catch (err) {
      results.push({
        type: record.type,
        id: record.id,
        success: false,
        status: 'Failed',
        message: err.message || 'Restore failed'
      });
    }
  }

  return results;
};
