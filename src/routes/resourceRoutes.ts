import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as resourceController from '../controllers/resourceController';

const router = Router();

router.use(authMiddleware);

// Categories
router.post('/categories', (req, res, next) => {
    resourceController.createCategory(req, res).catch(next);
});
router.get('/categories/:teamId', (req, res, next) => {
    resourceController.listCategories(req, res).catch(next);
});
router.delete('/categories/:id', (req, res, next) => {
    resourceController.deleteCategory(req, res).catch(next);
});

// Resources
router.post('/', (req, res, next) => {
    resourceController.createResource(req, res).catch(next);
});
router.get('/:categoryId', (req, res, next) => {
    resourceController.listResources(req, res).catch(next);
});
router.delete('/:id', (req, res, next) => {
    resourceController.deleteResource(req, res).catch(next);
});

export default router;
