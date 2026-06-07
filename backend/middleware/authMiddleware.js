import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verifies JWT and attaches `req.user`.
// Expected Authorization header: `Bearer <token>`
export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);
    if (!user || user.isActive === false || user.isDeleted === true) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = {
      userId: user._id.toString(),
      username: user.username,
      name: user.name,
      role: user.role,
      accessLevel: user.accessLevel || 'full_access'
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

