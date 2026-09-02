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
    const { name, currentPrice, pricePerTon, customerPrice, customerPricePerTon, buyerPrice, buyerPricePerTon } = req.body;
    
    const custUnitPrice = customerPrice ?? currentPrice ?? 0;
    const custTonPrice = customerPricePerTon ?? pricePerTon ?? custUnitPrice;
    const buyUnitPrice = buyerPrice ?? custUnitPrice;
    const buyTonPrice = buyerPricePerTon ?? custTonPrice;

    const material = await Material.create({
      name,
      currentPrice: custUnitPrice,
      pricePerTon: custTonPrice,
      customerPrice: custUnitPrice,
      customerPricePerTon: custTonPrice,
      buyerPrice: buyUnitPrice,
      buyerPricePerTon: buyTonPrice,
      priceHistory: [{ price: custUnitPrice }]
    });
    res.status(201).json({
      ...material.toObject(),
      auditDetails: `Created material ${material.name} - Cust: ₹${custUnitPrice}/unit (₹${custTonPrice}/ton), Buyer: ₹${buyUnitPrice}/unit (₹${buyTonPrice}/ton)`
    });
  } catch (err) {
    next(err);
  }
};

export const updateMaterialPrice = async (req, res, next) => {
  try {
    const { currentPrice, pricePerTon, customerPrice, customerPricePerTon, buyerPrice, buyerPricePerTon } = req.body;
    const material = await Material.findById(req.params.id);
    if (!material) {
      res.status(404);
      throw new Error('Material not found');
    }
    
    if (customerPrice != null) {
      material.customerPrice = customerPrice;
      material.currentPrice = customerPrice;
      material.priceHistory.push({ price: customerPrice });
    } else if (currentPrice != null) {
      material.currentPrice = currentPrice;
      material.customerPrice = currentPrice;
      material.priceHistory.push({ price: currentPrice });
    }

    if (customerPricePerTon != null) {
      material.customerPricePerTon = customerPricePerTon;
      material.pricePerTon = customerPricePerTon;
    } else if (pricePerTon != null) {
      material.pricePerTon = pricePerTon;
      material.customerPricePerTon = pricePerTon;
    }

    if (buyerPrice != null) {
      material.buyerPrice = buyerPrice;
    }
    if (buyerPricePerTon != null) {
      material.buyerPricePerTon = buyerPricePerTon;
    }

    await material.save();
    res.json({
      ...material.toObject(),
      auditDetails: `Edited material ${material.name} prices - Customer: ₹${material.customerPrice ?? material.currentPrice}, Buyer: ₹${material.buyerPrice ?? material.customerPrice}`
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

