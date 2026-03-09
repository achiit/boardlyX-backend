import { pool } from '../db';

export interface ResourceCategoryRow {
    id: string;
    team_id: string;
    name: string;
    created_at: Date;
}

export interface ResourceRow {
    id: string;
    category_id: string;
    user_id: string;
    title: string;
    url: string;
    description: string;
    created_at: Date;
}

export async function createCategory(teamId: string, name: string): Promise<ResourceCategoryRow> {
    const { rows } = await pool.query<ResourceCategoryRow>(
        'insert into resource_categories (team_id, name) values ($1, $2) returning *',
        [teamId, name]
    );
    return rows[0];
}

export async function listCategories(teamId: string): Promise<ResourceCategoryRow[]> {
    const { rows } = await pool.query<ResourceCategoryRow>(
        'select * from resource_categories where team_id = $1 order by name asc',
        [teamId]
    );
    return rows;
}

export async function getCategoryById(id: string): Promise<ResourceCategoryRow | null> {
    const { rows } = await pool.query<ResourceCategoryRow>(
        'select * from resource_categories where id = $1',
        [id]
    );
    return rows[0] || null;
}

export async function deleteCategory(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
        'delete from resource_categories where id = $1',
        [id]
    );
    return (rowCount ?? 0) > 0;
}

export async function createResource(categoryId: string, userId: string, title: string, url: string, description: string = ''): Promise<ResourceRow> {
    const { rows } = await pool.query<ResourceRow>(
        'insert into resources (category_id, user_id, title, url, description) values ($1, $2, $3, $4, $5) returning *',
        [categoryId, userId, title, url, description]
    );
    return rows[0];
}

export async function listResources(categoryId: string): Promise<ResourceRow[]> {
    const { rows } = await pool.query<ResourceRow>(
        'select r.*, u.name as user_name from resources r join users u on u.id = r.user_id where category_id = $1 order by created_at desc',
        [categoryId]
    );
    return rows;
}

export async function deleteResource(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
        'delete from resources where id = $1',
        [id]
    );
    return (rowCount ?? 0) > 0;
}
