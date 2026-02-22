import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as taskController from '../controllers/taskController';

const router = Router();

router.use(authMiddleware);

router.post('/', (req, res, next) => {
  taskController.createTask(req, res).catch(next);
});
router.get('/', (req, res, next) => {
  taskController.listTasks(req, res).catch(next);
});
router.get('/analytics', (req, res, next) => {
  taskController.getAnalytics(req, res).catch(next);
});
router.get('/my-board', (req, res, next) => {
  taskController.myBoardTasks(req, res).catch(next);
});
router.put('/:id/move', (req, res, next) => {
  taskController.movePersonalTask(req, res).catch(next);
});
router.get('/:id', (req, res, next) => {
  taskController.getTask(req, res).catch(next);
});
router.put('/:id', (req, res, next) => {
  taskController.updateTask(req, res).catch(next);
});
router.delete('/:id', (req, res, next) => {
  taskController.deleteTask(req, res).catch(next);
});
router.post('/:id/store-onchain', (req, res, next) => {
  taskController.storeOnChain(req, res).catch(next);
});
router.get('/:id/verify', (req, res, next) => {
  taskController.verifyTask(req, res).catch(next);
});

export default router;
