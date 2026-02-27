import { Pool } from 'pg';
import { config } from './config';

const connectionString = config.postgresUrl.includes('sslmode=')
  ? config.postgresUrl
  : `${config.postgresUrl}${config.postgresUrl.includes('?') ? '&' : '?'}sslmode=require`;

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err: Error) => {
  console.error('[db] Unexpected error on idle client', err);
});

export async function initDb() {
  // Users: id, name, email, password_hash, wallet_address, created_at, updated_at
  await pool.query(`
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
  await pool.query(`alter table users add column if not exists name text;`).catch(() => { });
  await pool.query(`alter table users add column if not exists username text;`).catch(() => { });
  await pool.query(`alter table users add column if not exists telegram_chat_id text;`).catch(() => { });
  await pool.query(`alter table users add column if not exists telegram_username text;`).catch(() => { });
  await pool.query(`create unique index if not exists idx_users_username on users(username) where username is not null;`).catch(() => { });

  await pool.query(`
    create table if not exists wallet_nonces (
      wallet_address text primary key,
      nonce text not null,
      created_at timestamptz default now()
    );
  `);

  // Tasks with FK to users, cascade delete
  await pool.query(`
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

  await pool.query(`create index if not exists idx_tasks_user_id on tasks(user_id);`);
  await pool.query(`create index if not exists idx_tasks_status on tasks(status);`);
  await pool.query(`create index if not exists idx_tasks_created_at on tasks(created_at desc);`);

  await pool.query(`alter table tasks add column if not exists team_id uuid;`).catch(() => { });
  await pool.query(`alter table tasks add column if not exists board_column text default 'backlog';`).catch(() => { });
  await pool.query(`alter table tasks add column if not exists board_order int default 0;`).catch(() => { });

  await pool.query(`
    create table if not exists teams (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      created_by uuid not null references users(id) on delete cascade,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists team_members (
      team_id uuid not null references teams(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      role text not null default 'member' check (role in ('owner', 'admin', 'member')),
      joined_at timestamptz default now(),
      primary key (team_id, user_id)
    );
  `);

  await pool.query(`
    create table if not exists invitations (
      id uuid primary key default gen_random_uuid(),
      team_id uuid not null references teams(id) on delete cascade,
      inviter_id uuid not null references users(id) on delete cascade,
      invitee_email text not null,
      status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
      created_at timestamptz default now()
    );
  `);
  await pool.query(`create index if not exists idx_invitations_email on invitations(invitee_email);`);

  await pool.query(`
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
  await pool.query(`create index if not exists idx_notifications_user on notifications(user_id, read, created_at desc);`);

  await pool.query(`
    create table if not exists task_assignees (
      task_id uuid not null references tasks(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      assigned_at timestamptz default now(),
      primary key (task_id, user_id)
    );
  `);

  await pool.query(`alter table tasks add constraint fk_tasks_team foreign key (team_id) references teams(id) on delete set null;`).catch(() => { });
  await pool.query(`create index if not exists idx_tasks_team_id on tasks(team_id);`).catch(() => { });

  // ── Chat tables ──
  await pool.query(`
    create table if not exists conversations (
      id uuid primary key default gen_random_uuid(),
      type text not null check (type in ('group', 'dm')),
      name text,
      team_id uuid references teams(id) on delete cascade,
      created_at timestamptz default now()
    );
  `);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_message_id uuid;`).catch(() => { });

  await pool.query(`
    create table if not exists conversation_members (
      conversation_id uuid not null references conversations(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      joined_at timestamptz default now(),
      primary key (conversation_id, user_id)
    );
  `);
  await pool.query(`create index if not exists idx_conv_members_user on conversation_members(user_id);`);

  await pool.query(`
    create table if not exists messages (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references conversations(id) on delete cascade,
      sender_id uuid not null references users(id) on delete cascade,
      content text default '',
      media_type text,
      media_data text,
      created_at timestamptz default now()
    );
  `);
  await pool.query(`create index if not exists idx_messages_conv on messages(conversation_id, created_at desc);`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type text;`).catch(() => { });
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_data text;`).catch(() => { });
  await pool.query(`ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;`).catch(() => { });
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id uuid references messages(id) on delete set null;`).catch(() => { });
}
