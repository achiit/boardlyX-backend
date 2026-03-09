import { Request, Response } from 'express';
import { z } from 'zod';
import * as resourceRepository from '../repositories/resourceRepository';

const CreateCategorySchema = z.object({
    teamId: z.string().uuid(),
    name: z.string().min(1).max(100),
});

const CreateResourceSchema = z.object({
    categoryId: z.string().uuid(),
    title: z.string().min(1).max(200),
    url: z.string().url(),
    description: z.string().max(1000).optional(),
});

function getUserId(req: Request): string {
    return (req as any).user?.userId;
}

export async function createCategory(req: Request, res: Response) {
    const parse = CreateCategorySchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    }
    try {
        const category = await resourceRepository.createCategory(parse.data.teamId, parse.data.name);
        return res.status(201).json(category);
    } catch (err: any) {
        console.error('[resourceController] Error creating category', err);
        return res.status(500).json({ error: 'Failed to create category' });
    }
}

export async function listCategories(req: Request, res: Response) {
    const { teamId } = req.params;
    try {
        const categories = await resourceRepository.listCategories(teamId);
        return res.json(categories);
    } catch (err: any) {
        console.error('[resourceController] Error listing categories', err);
        return res.status(500).json({ error: 'Failed to list categories' });
    }
}

export async function deleteCategory(req: Request, res: Response) {
    const { id } = req.params;
    try {
        const deleted = await resourceRepository.deleteCategory(id);
        if (!deleted) return res.status(404).json({ error: 'Category not found' });
        return res.status(204).send();
    } catch (err: any) {
        console.error('[resourceController] Error deleting category', err);
        return res.status(500).json({ error: 'Failed to delete category' });
    }
}

export async function createResource(req: Request, res: Response) {
    const parse = CreateResourceSchema.safeParse(req.body);
    if (!parse.success) {
        return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    }
    const userId = getUserId(req);
    try {
        const resource = await resourceRepository.createResource(
            parse.data.categoryId,
            userId,
            parse.data.title,
            parse.data.url,
            parse.data.description
        );
        return res.status(201).json(resource);
    } catch (err: any) {
        console.error('[resourceController] Error creating resource', err);
        return res.status(500).json({ error: 'Failed to create resource' });
    }
}

export async function listResources(req: Request, res: Response) {
    const { categoryId } = req.params;
    try {
        const resources = await resourceRepository.listResources(categoryId);
        return res.json(resources);
    } catch (err: any) {
        console.error('[resourceController] Error listing resources', err);
        return res.status(500).json({ error: 'Failed to list resources' });
    }
}

export async function deleteResource(req: Request, res: Response) {
    const { id } = req.params;
    try {
        const deleted = await resourceRepository.deleteResource(id);
        if (!deleted) return res.status(404).json({ error: 'Resource not found' });
        return res.status(204).send();
    } catch (err: any) {
        console.error('[resourceController] Error deleting resource', err);
        return res.status(500).json({ error: 'Failed to delete resource' });
    }
}
