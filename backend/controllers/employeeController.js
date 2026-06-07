import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import SalaryPayment from '../models/SalaryPayment.js';
import Expense from '../models/Expense.js';
import { assertUniquePhone } from '../utils/phone.js';
import { restoreEmployeeRecord } from '../services/restoreService.js';
import { permanentlyDeleteEmployee as purgeEmployee } from '../services/purgeService.js';

// --- EMPLOYEE CRUD ---

export const getEmployees = async (req, res, next) => {
  try {
    const employees = await Employee.find({
      isDeleted: false,
      salarySettled: { $ne: true }
    }).sort({ name: 1 });
    res.json(employees);
  } catch (err) {
    next(err);
  }
};

export const createEmployee = async (req, res, next) => {
  try {
    const { name, phone, designation, dailyWages, status } = req.body;
    if (!name || dailyWages == null) {
      return res.status(400).json({ message: 'Name and dailyWages are required' });
    }

    const normalizedPhone = await assertUniquePhone(Employee, phone);

    const employee = await Employee.create({
      name,
      phone: normalizedPhone,
      designation,
      dailyWages,
      status: status || 'Active'
    });

    res.status(201).json({
      ...employee.toObject(),
      auditDetails: `Created employee ${employee.name}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const updateEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const { name, phone, designation, dailyWages, status } = req.body;
    if (name) employee.name = name;
    if (phone !== undefined) {
      employee.phone = await assertUniquePhone(Employee, phone, employee._id);
    }
    if (designation !== undefined) employee.designation = designation;
    if (dailyWages != null) employee.dailyWages = dailyWages;
    if (status) employee.status = status;

    const updated = await employee.save();
    res.json({
      ...updated.toObject(),
      auditDetails: `Edited employee ${updated.name}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    employee.isDeleted = true;
    employee.status = 'Inactive';
    await employee.save();

    await Attendance.updateMany({ employee: employee._id }, { isArchived: true });

    res.json({
      message: 'Employee removed',
      auditDetails: `Deleted employee ${employee.name} and archived attendance records`
    });
  } catch (err) {
    next(err);
  }
};

export const getArchivedEmployees = async (req, res, next) => {
  try {
    const employees = await Employee.find({ isDeleted: true }).sort({ updatedAt: -1 });
    res.json(employees);
  } catch (err) {
    next(err);
  }
};

export const restoreEmployee = async (req, res, next) => {
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

export const permanentDeleteEmployee = async (req, res, next) => {
  try {
    const result = await purgeEmployee(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

// --- ATTENDANCE MANAGEMENT ---

export const getAttendance = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    const attendanceRecords = await Attendance.find({
      date: { $gte: start, $lte: end },
      isArchived: { $ne: true }
    });

    const employeeIdsWithAttendance = attendanceRecords.map((a) => a.employee.toString());

    const employees = await Employee.find({
      isDeleted: false,
      salarySettled: { $ne: true },
      status: 'Active'
    }).sort({ name: 1 });

    // Group records by employeeId and date string YYYY-MM-DD
    const attendanceMap = {};
    attendanceRecords.forEach((a) => {
      const empId = a.employee.toString();
      const dateStr = a.date.toISOString().split('T')[0];
      if (!attendanceMap[empId]) {
        attendanceMap[empId] = {};
      }
      attendanceMap[empId][dateStr] = a.status;
    });

    const result = employees.map((emp) => {
      const empId = emp._id.toString();
      return {
        employeeId: emp._id,
        name: emp.name,
        designation: emp.designation,
        statuses: attendanceMap[empId] || {} // maps YYYY-MM-DD -> status
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const saveAttendance = async (req, res, next) => {
  try {
    const { attendance } = req.body; // array of { employeeId, date: 'YYYY-MM-DD', status: 'Present'|'Half-Day'|'Absent'|'Unmarked' }
    if (!Array.isArray(attendance)) {
      return res.status(400).json({ message: 'attendance array is required' });
    }

    for (const record of attendance) {
      const targetDate = new Date(record.date + 'T00:00:00.000Z');
      if (record.status === 'Unmarked') {
        await Attendance.deleteOne({ date: targetDate, employee: record.employeeId });
      } else {
        await Attendance.findOneAndUpdate(
          { date: targetDate, employee: record.employeeId },
          { status: record.status },
          { upsert: true, new: true }
        );
      }
    }
    res.json({
      message: 'Attendance pool updated successfully',
      auditDetails: `Updated attendance for ${attendance.length} entries`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteAttendanceRange = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    await Attendance.deleteMany({
      date: { $gte: start, $lte: end }
    });

    res.json({
      message: 'Attendance records in range deleted successfully',
      auditDetails: `Deleted attendance records from ${startDate} to ${endDate}`
    });
  } catch (err) {
    next(err);
  }
};

// --- SALARY COMPUTATION & PAYMENTS ---

export const getSalaries = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }
    const m = parseInt(month);
    const y = parseInt(year);

    const startOfMonth = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
    const lastDay = new Date(y, m, 0).getDate();
    const endOfMonth = new Date(`${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`);

    // Fetch all attendance logs for this month
    const attendanceLogs = await Attendance.find({
      date: { $gte: startOfMonth, $lte: endOfMonth },
      isArchived: { $ne: true }
    });

    // Fetch existing SalaryPayment records for this month
    const payments = await SalaryPayment.find({ month: m, year: y }).populate('history.expenseRef');
    const paymentsMap = {};
    payments.forEach((p) => {
      paymentsMap[p.employee.toString()] = p;
    });

    // Include deactivated employees who have logs or payments in this period
    const employeeIdsWithLogs = [
      ...attendanceLogs.map((log) => log.employee.toString()),
      ...payments.map((p) => p.employee.toString())
    ];

    const employees = await Employee.find({
      isDeleted: false,
      salarySettled: { $ne: true },
      $or: [
        { status: 'Active' },
        { _id: { $in: [...new Set(employeeIdsWithLogs)] } }
      ]
    }).sort({ name: 1 });

    // Group attendance by employee: Present (1.0), Half-Day (0.5), Absent (0.0)
    const attendanceSummary = {};
    attendanceLogs.forEach((log) => {
      const empId = log.employee.toString();
      let weight = 0;
      if (log.status === 'Present') weight = 1;
      else if (log.status === 'Half-Day') weight = 0.5;
      
      attendanceSummary[empId] = (attendanceSummary[empId] || 0) + weight;
    });

    const result = await Promise.all(employees.map(async (emp) => {
      const empId = emp._id.toString();
      const attendedDays = attendanceSummary[empId] || 0;
      const dailyWages = emp.dailyWages;
      const baseSalary = attendedDays * dailyWages;

      const existingPayment = paymentsMap[empId];

      if (existingPayment) {
        // Dynamically sync and update the salary record in database from attendance logs
        existingPayment.attendedDays = attendedDays;
        existingPayment.dailyWagesSnapshot = dailyWages;
        existingPayment.baseSalary = baseSalary;
        existingPayment.totalSalary = baseSalary + existingPayment.bonus;
        existingPayment.pendingAmount = existingPayment.totalSalary - existingPayment.paidAmount;

        if (Math.abs(existingPayment.pendingAmount) < 1e-4) {
          existingPayment.pendingAmount = 0;
          existingPayment.paymentStatus = 'Paid';
        } else if (existingPayment.paidAmount > 0) {
          existingPayment.paymentStatus = 'Partially Paid';
        } else {
          existingPayment.paymentStatus = 'Unpaid';
        }

        await existingPayment.save();

        return {
          _id: existingPayment._id,
          employee: {
            _id: emp._id,
            name: emp.name,
            designation: emp.designation,
            dailyWages: emp.dailyWages
          },
          attendedDays: existingPayment.attendedDays,
          dailyWagesSnapshot: existingPayment.dailyWagesSnapshot,
          baseSalary: existingPayment.baseSalary,
          bonus: existingPayment.bonus,
          totalSalary: existingPayment.totalSalary,
          paidAmount: existingPayment.paidAmount,
          pendingAmount: existingPayment.pendingAmount,
          paymentStatus: existingPayment.paymentStatus,
          history: existingPayment.history
        };
      } else {
        return {
          employee: {
            _id: emp._id,
            name: emp.name,
            designation: emp.designation,
            dailyWages: emp.dailyWages
          },
          attendedDays,
          dailyWagesSnapshot: dailyWages,
          baseSalary,
          bonus: 0,
          totalSalary: baseSalary,
          paidAmount: 0,
          pendingAmount: baseSalary,
          paymentStatus: baseSalary === 0 ? 'Paid' : 'Unpaid',
          history: []
        };
      }
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getSalarySummary = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    const [attendanceLogs, salaryRecords] = await Promise.all([
      Attendance.find({ date: { $gte: start, $lte: end } }),
      SalaryPayment.find({ 'history.date': { $gte: start, $lte: end } })
    ]);

    const employeeIds = [
      ...attendanceLogs.map((log) => log.employee.toString()),
      ...salaryRecords.map((record) => record.employee.toString())
    ];

    const employees = await Employee.find({
      $or: [
        { status: 'Active', isDeleted: false },
        { _id: { $in: [...new Set(employeeIds)] } }
      ]
    }).sort({ name: 1 });

    const attendanceByEmployee = {};
    attendanceLogs.forEach((log) => {
      const empId = log.employee.toString();
      if (!attendanceByEmployee[empId]) {
        attendanceByEmployee[empId] = { attendedDays: 0, logs: [] };
      }
      let weight = 0;
      if (log.status === 'Present') weight = 1;
      if (log.status === 'Half-Day') weight = 0.5;
      attendanceByEmployee[empId].attendedDays += weight;
      attendanceByEmployee[empId].logs.push(log);
    });

    const paymentsByEmployee = {};
    salaryRecords.forEach((record) => {
      const empId = record.employee.toString();
      const filteredHistory = record.history.filter((tx) => tx.date >= start && tx.date <= end);
      if (!paymentsByEmployee[empId]) paymentsByEmployee[empId] = [];
      paymentsByEmployee[empId].push(...filteredHistory);
    });

    const result = employees.map((emp) => {
      const empId = emp._id.toString();
      const attendance = attendanceByEmployee[empId] || { attendedDays: 0, logs: [] };
      const history = paymentsByEmployee[empId] || [];
      const baseSalary = attendance.attendedDays * emp.dailyWages;
      const bonus = history
        .filter((tx) => tx.type === 'Bonus')
        .reduce((sum, tx) => sum + tx.amount, 0);
      const paidAmount = history.reduce((sum, tx) => sum + tx.amount, 0);
      const totalSalary = baseSalary + bonus;
      const pendingAmount = Math.max(0, totalSalary - paidAmount);

      return {
        employee: {
          _id: emp._id,
          name: emp.name,
          designation: emp.designation,
          dailyWages: emp.dailyWages
        },
        attendedDays: attendance.attendedDays,
        dailyWagesSnapshot: emp.dailyWages,
        baseSalary,
        bonus,
        totalSalary,
        paidAmount,
        pendingAmount,
        paymentStatus: pendingAmount === 0 ? 'Paid' : paidAmount > 0 ? 'Partially Paid' : 'Unpaid',
        history
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const paySalary = async (req, res, next) => {
  try {
    const { employeeId, month, year, amount, type } = req.body;
    if (!employeeId || !month || !year || amount == null || !type) {
      return res.status(400).json({ message: 'employeeId, month, year, amount, and type are required' });
    }

    const payAmt = Number(amount);
    if (payAmt <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const m = parseInt(month);
    const y = parseInt(year);

    // Compute monthly working statistics for initial setup
    const startOfMonth = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
    const lastDay = new Date(y, m, 0).getDate();
    const endOfMonth = new Date(`${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`);

    const attendanceLogs = await Attendance.find({
      employee: employeeId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
      isArchived: { $ne: true }
    });

    let attendedDays = 0;
    attendanceLogs.forEach((log) => {
      if (log.status === 'Present') attendedDays += 1;
      else if (log.status === 'Half-Day') attendedDays += 0.5;
    });

    const baseSalary = attendedDays * employee.dailyWages;

    let salaryPayment = await SalaryPayment.findOne({ employee: employeeId, month: m, year: y });
    if (!salaryPayment) {
      salaryPayment = new SalaryPayment({
        employee: employeeId,
        month: m,
        year: y,
        attendedDays,
        dailyWagesSnapshot: employee.dailyWages,
        baseSalary,
        bonus: 0,
        totalSalary: baseSalary,
        paidAmount: 0,
        pendingAmount: baseSalary,
        paymentStatus: baseSalary === 0 ? 'Paid' : 'Unpaid',
        history: []
      });
    } else {
      salaryPayment.attendedDays = attendedDays;
      salaryPayment.dailyWagesSnapshot = employee.dailyWages;
      salaryPayment.baseSalary = baseSalary;
      salaryPayment.totalSalary = baseSalary + salaryPayment.bonus;
      salaryPayment.pendingAmount = salaryPayment.totalSalary - salaryPayment.paidAmount;
    }

    let description = '';
    if (type === 'Bonus') {
      salaryPayment.bonus += payAmt;
      salaryPayment.totalSalary = salaryPayment.baseSalary + salaryPayment.bonus;
      salaryPayment.paidAmount += payAmt;
      salaryPayment.pendingAmount = salaryPayment.totalSalary - salaryPayment.paidAmount;
      description = `Bonus payment to ${employee.name} for ${String(m).padStart(2, '0')}/${y}`;
    } else if (type === 'Salary') {
      if (payAmt > salaryPayment.pendingAmount + 1e-4) {
        return res.status(400).json({ 
          message: `Payment amount ₹${payAmt} exceeds the pending salary amount ₹${salaryPayment.pendingAmount}` 
        });
      }
      salaryPayment.paidAmount += payAmt;
      salaryPayment.pendingAmount = salaryPayment.totalSalary - salaryPayment.paidAmount;
      description = `Salary payment to ${employee.name} for ${String(m).padStart(2, '0')}/${y}`;
    } else {
      return res.status(400).json({ message: 'Invalid payment type. Must be Salary or Bonus' });
    }

    // Update paymentStatus
    if (Math.abs(salaryPayment.pendingAmount) < 1e-4) {
      salaryPayment.pendingAmount = 0;
      salaryPayment.paymentStatus = 'Paid';
    } else if (salaryPayment.paidAmount > 0) {
      salaryPayment.paymentStatus = 'Partially Paid';
    } else {
      salaryPayment.paymentStatus = 'Unpaid';
    }

    // Auto-create matching expense record
    const expense = await Expense.create({
      date: new Date(),
      type: 'Labour',
      description,
      amount: payAmt
    });

    // Log in salary history
    salaryPayment.history.push({
      amount: payAmt,
      date: new Date(),
      type,
      expenseRef: expense._id
    });

    await salaryPayment.save();

    if (salaryPayment.paymentStatus === 'Paid') {
      employee.salarySettled = true;
      employee.isDeleted = true;
      employee.status = 'Inactive';
      await employee.save();
      await Attendance.updateMany({ employee: employee._id }, { isArchived: true });
    }

    res.status(200).json({
      message: 'Payment recorded successfully',
      salaryPayment,
      expense,
      employeeSettled: salaryPayment.paymentStatus === 'Paid',
      auditDetails: `Recorded ${type.toLowerCase()} payment of ${payAmt} to ${employee.name}${salaryPayment.paymentStatus === 'Paid' ? ' — salary fully settled, removed from employee management' : ''}`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteTransaction = async (req, res, next) => {
  try {
    const { paymentId, transactionId } = req.params;

    const salaryPayment = await SalaryPayment.findById(paymentId);
    if (!salaryPayment) {
      return res.status(404).json({ message: 'Salary payment record not found' });
    }

    const txIndex = salaryPayment.history.findIndex((h) => h._id.toString() === transactionId);
    if (txIndex === -1) {
      return res.status(404).json({ message: 'Transaction not found in history' });
    }

    const tx = salaryPayment.history[txIndex];

    // Delete associated Expense if it exists
    if (tx.expenseRef) {
      await Expense.findByIdAndDelete(tx.expenseRef);
    }

    // Subtract from totals based on type
    if (tx.type === 'Bonus') {
      salaryPayment.bonus -= tx.amount;
      salaryPayment.totalSalary = salaryPayment.baseSalary + salaryPayment.bonus;
      salaryPayment.paidAmount -= tx.amount;
    } else if (tx.type === 'Salary') {
      salaryPayment.paidAmount -= tx.amount;
    }
    salaryPayment.pendingAmount = salaryPayment.totalSalary - salaryPayment.paidAmount;

    // Recalculate status
    if (Math.abs(salaryPayment.pendingAmount) < 1e-4) {
      salaryPayment.pendingAmount = 0;
      salaryPayment.paymentStatus = 'Paid';
    } else if (salaryPayment.paidAmount > 0) {
      salaryPayment.paymentStatus = 'Partially Paid';
    } else {
      salaryPayment.paymentStatus = 'Unpaid';
    }

    // Remove transaction from history
    salaryPayment.history.splice(txIndex, 1);

    await salaryPayment.save();

    res.json({
      message: 'Transaction deleted successfully',
      salaryPayment,
      auditDetails: `Deleted ${tx.type.toLowerCase()} transaction of ${tx.amount}`
    });
  } catch (err) {
    next(err);
  }
};
