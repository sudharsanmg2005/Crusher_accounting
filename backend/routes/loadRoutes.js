import express from 'express';
import { getLoads, createLoad, updateLoad, deleteLoad } from '../controllers/loadController.js';

const router = express.Router();

router.route('/')
  .get(getLoads)
  .post(createLoad);

router.route('/:id')
  .put(updateLoad)
  .delete(deleteLoad);

export default router;
