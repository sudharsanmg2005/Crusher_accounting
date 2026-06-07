import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

const sanitizeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  username: user.username,
  role: user.role,
  accessLevel: user.accessLevel || 'full_access',
  isActive: user.isActive,
  isDeleted: user.isDeleted || false,
  deletedAt: user.deletedAt,
  createdAt: user.createdAt
});

const signToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      username: user.username,
      name: user.name,
      role: user.role,
      accessLevel: user.accessLevel || 'full_access'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!['admin', 'super_admin'].includes(user.role) || user.isActive === false || user.isDeleted === true) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.role === 'admin') {
      const superAdminCount = await User.countDocuments({
        role: 'super_admin',
        isActive: true,
        isDeleted: false
      });
      if (superAdminCount === 0 && process.env.NODE_ENV !== 'production') {
        user.role = 'super_admin';
        user.accessLevel = 'full_access';
        await user.save();
      }
    }

    const token = signToken(user);
    return res.json({
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getMe = async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user || user.isActive === false || user.isDeleted === true) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return res.json(sanitizeUser(user));
};

export const createAdmin = async (req, res) => {
  try {
    const { name, username, password, accessLevel = 'full_access' } = req.body || {};
    if (!name || !username || !password) {
      return res.status(400).json({ message: 'name, username and password are required' });
    }
    if (!['full_access', 'read_only', 'create_bills'].includes(accessLevel)) {
      return res.status(400).json({ message: 'Invalid access level' });
    }

    const existing = await User.findOne({ username });
    if (existing && !existing.isDeleted) {
      return res.status(409).json({ message: 'username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    if (existing?.isDeleted) {
      existing.name = name;
      existing.passwordHash = passwordHash;
      existing.role = 'admin';
      existing.accessLevel = accessLevel;
      existing.isActive = true;
      existing.isDeleted = false;
      existing.deletedAt = undefined;
      await existing.save();
      return res.status(201).json(sanitizeUser(existing));
    }

    const admin = await User.create({
      name,
      username,
      passwordHash,
      role: 'admin',
      accessLevel,
      isActive: true,
      isDeleted: false,
      deletedAt: undefined
    });

    return res.status(201).json(sanitizeUser(admin));
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// One-time bootstrap for the first admin.
// After any admin exists, it becomes forbidden.
export const bootstrapFirstAdmin = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: 'Bootstrap is disabled in production' });
    }

    const adminCount = await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } });
    if (adminCount > 0) {
      return res.status(403).json({ message: 'Bootstrap already completed' });
    }

    const { name, username, password } = req.body || {};
    if (!name || !username || !password) {
      return res.status(400).json({ message: 'name, username and password are required' });
    }

    const existing = await User.findOne({ username });
    if (existing && !existing.isDeleted) {
      return res.status(409).json({ message: 'username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    if (existing?.isDeleted) {
      existing.name = name;
      existing.passwordHash = passwordHash;
      existing.role = 'super_admin';
      existing.accessLevel = 'full_access';
      existing.isActive = true;
      existing.isDeleted = false;
      existing.deletedAt = undefined;
      await existing.save();
      return res.status(201).json(sanitizeUser(existing));
    }

    const admin = await User.create({
      name,
      username,
      passwordHash,
      role: 'super_admin',
      accessLevel: 'full_access'
    });

    return res.status(201).json(sanitizeUser(admin));
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } })
      .select('-passwordHash')
      .sort({ isDeleted: 1, role: -1, createdAt: -1 });
    return res.json(admins.map(sanitizeUser));
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteAdmin = async (req, res) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ message: 'You cannot delete your own admin account' });
    }

    const admin = await User.findById(req.params.id);
    if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.role === 'super_admin') {
      const superCount = await User.countDocuments({ role: 'super_admin', isActive: true });
      if (superCount <= 1) {
        return res.status(400).json({ message: 'At least one active super admin is required' });
      }
    }

    admin.isActive = false;
    admin.isDeleted = true;
    admin.deletedAt = new Date();
    await admin.save();
    return res.json({
      message: 'Admin deleted',
      auditDetails: `Deleted admin ${admin.name} (${admin.username})`
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateAdmin = async (req, res) => {
  try {
    const { accessLevel, isActive, name } = req.body || {};
    const admin = await User.findById(req.params.id);
    if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.isDeleted) {
      return res.status(400).json({ message: 'Deleted admins cannot be edited. Their logs remain available.' });
    }

    if (admin.role === 'super_admin' && isActive === false) {
      const superCount = await User.countDocuments({ role: 'super_admin', isActive: true });
      if (superCount <= 1) {
        return res.status(400).json({ message: 'At least one active super admin is required' });
      }
    }

    if (accessLevel !== undefined) {
      if (!['full_access', 'read_only', 'create_bills'].includes(accessLevel)) {
        return res.status(400).json({ message: 'Invalid access level' });
      }
      if (admin.role !== 'super_admin') {
        admin.accessLevel = accessLevel;
      }
    }
    if (isActive !== undefined) admin.isActive = Boolean(isActive);
    if (name) admin.name = name;

    await admin.save();
    return res.json({
      ...sanitizeUser(admin),
      auditDetails: `Updated admin ${admin.name} (${admin.username}) to ${admin.accessLevel}, ${admin.isActive ? 'active' : 'inactive'}`
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAdminLogs = async (req, res) => {
  try {
    const admin = await User.findById(req.params.id).select('-passwordHash');
    if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const logs = await AuditLog.find({ actor: admin._id }).sort({ createdAt: -1 }).limit(200);
    return res.json({ admin: sanitizeUser(admin), logs });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAllAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 300, 500);
    const logs = await AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'name username role');
    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

