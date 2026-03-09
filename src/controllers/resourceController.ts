import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import * as resourceRepository from '../repositories/resourceRepository';
import * as teamRepository from '../repositories/teamRepository';
import { notifyTeamMembersOfResource } from '../telegramBot';

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
    const userId = getUserId(req);
    try {
        const isMember = await teamRepository.isTeamMember(parse.data.teamId, userId);
        if (!isMember) return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });

        const category = await resourceRepository.createCategory(parse.data.teamId, parse.data.name);
        return res.status(201).json(category);
    } catch (err: any) {
        console.error('[resourceController] Error creating category', err);
        return res.status(500).json({ error: 'Failed to create category' });
    }
}

export async function listCategories(req: Request, res: Response) {
    const { teamId } = req.params;
    const userId = getUserId(req);
    try {
        const isMember = await teamRepository.isTeamMember(teamId, userId);
        if (!isMember) return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });

        const categories = await resourceRepository.listCategories(teamId);
        return res.json(categories);
    } catch (err: any) {
        console.error('[resourceController] Error listing categories', err);
        return res.status(500).json({ error: 'Failed to list categories' });
    }
}

export async function deleteCategory(req: Request, res: Response) {
    const { id } = req.params;
    const userId = getUserId(req);
    try {
        const category = await resourceRepository.getCategoryById(id);
        if (!category) return res.status(404).json({ error: 'Category not found' });

        const isMember = await teamRepository.isTeamMember(category.team_id, userId);
        if (!isMember) return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });

        const deleted = await resourceRepository.deleteCategory(id);
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
        const category = await resourceRepository.getCategoryById(parse.data.categoryId);
        if (!category) return res.status(404).json({ error: 'Category not found' });

        const isMember = await teamRepository.isTeamMember(category.team_id, userId);
        if (!isMember) return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });

        const resource = await resourceRepository.createResource(
            parse.data.categoryId,
            userId,
            parse.data.title,
            parse.data.url,
            parse.data.description
        );

        // Telegram Notification
        const team = await teamRepository.getTeamById(category.team_id);
        const sender = (req as any).user; // Assuming user info is available in req.user
        if (team) {
            notifyTeamMembersOfResource(
                team.id,
                team.name,
                userId,
                sender.name || sender.email || 'A team member',
                category.name,
                resource.title,
                resource.url
            ).catch(console.error);
        }

        return res.status(201).json(resource);
    } catch (err: any) {
        console.error('[resourceController] Error creating resource', err);
        return res.status(500).json({ error: 'Failed to create resource' });
    }
}

export async function listResources(req: Request, res: Response) {
    const { categoryId } = req.params;
    const userId = getUserId(req);
    try {
        const category = await resourceRepository.getCategoryById(categoryId);
        if (!category) return res.status(404).json({ error: 'Category not found' });

        const isMember = await teamRepository.isTeamMember(category.team_id, userId);
        if (!isMember) return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });

        const resources = await resourceRepository.listResources(categoryId);
        return res.json(resources);
    } catch (err: any) {
        console.error('[resourceController] Error listing resources', err);
        return res.status(500).json({ error: 'Failed to list resources' });
    }
}

export async function deleteResource(req: Request, res: Response) {
    const { id } = req.params;
    const userId = getUserId(req);
    try {
        const { rows } = await pool.query('select category_id from resources where id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Resource not found' });

        const category = await resourceRepository.getCategoryById(rows[0].category_id);
        if (!category) return res.status(404).json({ error: 'Category not found' });

        const isMember = await teamRepository.isTeamMember(category.team_id, userId);
        if (!isMember) return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });

        const deleted = await resourceRepository.deleteResource(id);
        return res.status(204).send();
    } catch (err: any) {
        console.error('[resourceController] Error deleting resource', err);
        return res.status(500).json({ error: 'Failed to delete resource' });
    }
}
