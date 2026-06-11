const countExisting = async (Model, field) => Model.countDocuments({ [field]: { $exists: true, $ne: '' } });

export const generateBusinessId = async (Model, field, prefix) => {
  const baseCount = await countExisting(Model, field);

  for (let offset = 1; offset <= 1000; offset += 1) {
    const code = `${prefix}-${String(baseCount + offset).padStart(5, '0')}`;
    const exists = await Model.exists({ [field]: code });
    if (!exists) return code;
  }

  return `${prefix}-${Date.now()}`;
};
