export const normalizePhone = (phone, { required = false } = {}) => {
  if (!phone || !String(phone).trim()) {
    if (required) {
      const err = new Error('Phone number is required');
      err.statusCode = 400;
      throw err;
    }
    return '';
  }
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length !== 10) {
    const err = new Error('Phone number must be exactly 10 digits');
    err.statusCode = 400;
    throw err;
  }
  return digits;
};

export const findActiveByPhone = async (Model, phone, excludeId) => {
  if (!phone) return null;
  const query = { phone, isDeleted: false };
  if (excludeId) query._id = { $ne: excludeId };
  return Model.findOne(query);
};

export const assertUniquePhone = async (Model, phone, excludeId, label = 'Record') => {
  const normalized = normalizePhone(phone, { required: true });
  const existing = await findActiveByPhone(Model, normalized, excludeId);
  if (existing) {
    const err = new Error(
      `Phone number ${normalized} is already registered to ${existing.name}. Duplicate phone numbers are not allowed.`
    );
    err.statusCode = 409;
    err.existingRecord = existing;
    throw err;
  }
  return normalized;
};
