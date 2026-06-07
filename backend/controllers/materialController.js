import Material from '../models/Material.js';
import { permanentlyDeleteMaterial as purgeMaterial } from '../services/purgeService.js';

export const getMaterials = async (req, res, next) => {
  try {
    const materials = await Material.find({ isDeleted: false }).sort({ name: 1 });
    res.json(materials);
  } catch (err) {
    next(err);
  }
};

export const createMaterial = async (req, res, next) => {
  try {
    const { name, currentPrice, pricePerTon } = req.body;
    const material = await Material.create({
      name,
      currentPrice,
      pricePerTon: pricePerTon ?? currentPrice,
      priceHistory: [{ price: currentPrice }]
    });
    res.status(201).json({
      ...material.toObject(),
      auditDetails: `Created material ${material.name} at price ${material.currentPrice}`
    });
  } catch (err) {
    next(err);
  }
};

export const updateMaterialPrice = async (req, res, next) => {
  try {
    const { currentPrice, pricePerTon } = req.body;
    const material = await Material.findById(req.params.id);
    if (!material) {
      res.status(404);
      throw new Error('Material not found');
    }
    if (currentPrice != null) {
      material.currentPrice = currentPrice;
      material.priceHistory.push({ price: currentPrice });
    }
    if (pricePerTon != null) material.pricePerTon = pricePerTon;
    await material.save();
    res.json({
      ...material.toObject(),
      auditDetails: `Edited material ${material.name} price to ${material.currentPrice}`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteMaterial = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      res.status(404);
      throw new Error('Material not found');
    }
    material.isDeleted = true;
    await material.save();
    res.json({
      message: 'Material removed',
      auditDetails: `Deleted material ${material.name}`
    });
  } catch (err) {
    next(err);
  }
};

export const getArchivedMaterials = async (req, res, next) => {
  try {
    const materials = await Material.find({ isDeleted: true }).sort({ updatedAt: -1 });
    res.json(materials);
  } catch (err) {
    next(err);
  }
};

export const restoreMaterial = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      res.status(404);
      throw new Error('Material not found');
    }
    material.isDeleted = false;
    await material.save();
    res.json({
      message: 'Material restored',
      restored: material,
      auditDetails: `Restored material ${material.name}`
    });
  } catch (err) {
    next(err);
  }
};

export const permanentDeleteMaterial = async (req, res, next) => {
  try {
    const result = await purgeMaterial(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

