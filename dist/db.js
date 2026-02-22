"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.initDb = initDb;
const pg_1 = require("pg");
const config_1 = require("./config");
const connectionString = config_1.config.postgresUrl.includes('sslmode=')
    ? config_1.config.postgresUrl
    : `${config_1.config.postgresUrl}${config_1.config.postgresUrl.includes('?') ? '&' : '?'}sslmode=require`;
exports.pool = new pg_1.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});
exports.pool.on('error', (err) => {
    console.error('[db] Unexpected error on idle client', err);
});
async function initDb() {
    // Users: id, name, email, password_hash, wallet_address, created_at, updated_at
    await exports.pool.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      name text,
      email text unique,
      password_hash text,
      wallet_address text unique,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
    await exports.pool.query(`alter table users add column if not exists name text;`).catch(() => { });
    await exports.pool.query(`alter table users add column if not exists username text;`).catch(() => { });
    await exports.pool.query(`create unique index if not exists idx_users_username on users(username) where username is not null;`).catch(() => { });
    await exports.pool.query(`
    create table if not exists wallet_nonces (
      wallet_address text primary key,
      nonce text not null,
      created_at timestamptz default now()
    );
  `);
    // Tasks with FK to users, cascade delete
    await exports.pool.query(`
    create table if not exists tasks (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      title text not null,
      description text default '',
      status text not null default 'pending' check (status in ('pending', 'completed')),
      priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
      due_date timestamptz,
      task_hash text,
      transaction_hash text,
      chain_timestamp timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
    await exports.pool.query(`create index if not exists idx_tasks_user_id on tasks(user_id);`);
    await exports.pool.query(`create index if not exists idx_tasks_status on tasks(status);`);
    await exports.pool.query(`create index if not exists idx_tasks_created_at on tasks(created_at desc);`);
    await exports.pool.query(`alter table tasks add column if not exists team_id uuid;`).catch(() => { });
    await exports.pool.query(`alter table tasks add column if not exists board_column text default 'backlog';`).catch(() => { });
    await exports.pool.query(`alter table tasks add column if not exists board_order int default 0;`).catch(() => { });
    await exports.pool.query(`
    create table if not exists teams (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      created_by uuid not null references users(id) on delete cascade,
      created_at timestamptz default now()
    );
  `);
    await exports.pool.query(`
    create table if not exists team_members (
      team_id uuid not null references teams(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      role text not null default 'member' check (role in ('owner', 'admin', 'member')),
      joined_at timestamptz default now(),
      primary key (team_id, user_id)
    );
  `);
    await exports.pool.query(`
    create table if not exists invitations (
      id uuid primary key default gen_random_uuid(),
      team_id uuid not null references teams(id) on delete cascade,
      inviter_id uuid not null references users(id) on delete cascade,
      invitee_email text not null,
      status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
      created_at timestamptz default now()
    );
  `);
    await exports.pool.query(`create index if not exists idx_invitations_email on invitations(invitee_email);`);
    await exports.pool.query(`
    create table if not exists notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      type text not null,
      title text not null,
      message text default '',
      data jsonb default '{}',
      read boolean default false,
      created_at timestamptz default now()
    );
  `);
    await exports.pool.query(`create index if not exists idx_notifications_user on notifications(user_id, read, created_at desc);`);
    await exports.pool.query(`
    create table if not exists task_assignees (
      task_id uuid not null references tasks(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      assigned_at timestamptz default now(),
      primary key (task_id, user_id)
    );
  `);
    await exports.pool.query(`alter table tasks add constraint fk_tasks_team foreign key (team_id) references teams(id) on delete set null;`).catch(() => { });
    await exports.pool.query(`create index if not exists idx_tasks_team_id on tasks(team_id);`).catch(() => { });
}
