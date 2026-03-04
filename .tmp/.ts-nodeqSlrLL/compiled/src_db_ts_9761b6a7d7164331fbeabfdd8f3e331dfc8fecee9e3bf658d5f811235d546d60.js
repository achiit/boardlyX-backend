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
    await exports.pool.query(`alter table users add column if not exists telegram_chat_id text;`).catch(() => { });
    await exports.pool.query(`alter table users add column if not exists telegram_username text;`).catch(() => { });
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
    // ── Chat tables ──
    await exports.pool.query(`
    create table if not exists conversations (
      id uuid primary key default gen_random_uuid(),
      type text not null check (type in ('group', 'dm')),
      name text,
      team_id uuid references teams(id) on delete cascade,
      created_at timestamptz default now()
    );
  `);
    await exports.pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_message_id uuid;`).catch(() => { });
    await exports.pool.query(`
    create table if not exists conversation_members (
      conversation_id uuid not null references conversations(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      joined_at timestamptz default now(),
      primary key (conversation_id, user_id)
    );
  `);
    await exports.pool.query(`create index if not exists idx_conv_members_user on conversation_members(user_id);`);
    await exports.pool.query(`
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
    await exports.pool.query(`create index if not exists idx_messages_conv on messages(conversation_id, created_at desc);`);
    await exports.pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type text;`).catch(() => { });
    await exports.pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_data text;`).catch(() => { });
    await exports.pool.query(`ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;`).catch(() => { });
    await exports.pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id uuid references messages(id) on delete set null;`).catch(() => { });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9kYi50cyIsInNvdXJjZXMiOlsiL1ZvbHVtZXMvQWFkaXR5YSdzIFNTRC9EZXZlbG9wbWVudC9ib2FyZGx5WC1iYWNrZW5kL3NyYy9kYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFtQkEsd0JBb0pDO0FBdktELDJCQUEwQjtBQUMxQixxQ0FBa0M7QUFFbEMsTUFBTSxnQkFBZ0IsR0FBRyxlQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7SUFDOUQsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxXQUFXO0lBQ3BCLENBQUMsQ0FBQyxHQUFHLGVBQU0sQ0FBQyxXQUFXLEdBQUcsZUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxpQkFBaUIsQ0FBQztBQUU3RSxRQUFBLElBQUksR0FBRyxJQUFJLFNBQUksQ0FBQztJQUMzQixnQkFBZ0I7SUFDaEIsR0FBRyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFO0lBQ2xDLEdBQUcsRUFBRSxFQUFFO0lBQ1AsaUJBQWlCLEVBQUUsS0FBSztJQUN4Qix1QkFBdUIsRUFBRSxLQUFLO0NBQy9CLENBQUMsQ0FBQztBQUVILFlBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBVSxFQUFFLEVBQUU7SUFDOUIsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUM3RCxDQUFDLENBQUMsQ0FBQztBQUVJLEtBQUssVUFBVSxNQUFNO0lBQzFCLGdGQUFnRjtJQUNoRixNQUFNLFlBQUksQ0FBQyxLQUFLLENBQUM7Ozs7Ozs7Ozs7R0FVaEIsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxZQUFJLENBQUMsS0FBSyxDQUFDLHVEQUF1RCxDQUFDLENBQUMsS0FBSyxDQUFD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LENBQUMsQ0FBQztJQUNoSCxNQUFNLFlBQUksQ0FBQyxLQUFLLENBQUMsZ0VBQWdFLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDcEcsTUFBTSxZQUFJLENBQUMsS0FBSyxDQUFDLGdFQUFnRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3BHLE1BQU0sWUFBSSxDQUFDLEtBQUssQ0FBQywwREFBMEQsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM5RixNQUFNLFlBQUksQ0FBQyxLQUFLLENBQUMsNEdBQTRHLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbEosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBvb2wgfSBmcm9tICdwZyc7XG5pbXBvcnQgeyBjb25maWcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbmNvbnN0IGNvbm5lY3Rpb25TdHJpbmcgPSBjb25maWcucG9zdGdyZXNVcmwuaW5jbHVkZXMoJ3NzbG1vZGU9JylcbiAgPyBjb25maWcucG9zdGdyZXNVcmxcbiAgOiBgJHtjb25maWcucG9zdGdyZXNVcmx9JHtjb25maWcucG9zdGdyZXNVcmwuaW5jbHVkZXMoJz8nKSA/ICcmJyA6ICc/J31zc2xtb2RlPXJlcXVpcmVgO1xuXG5leHBvcnQgY29uc3QgcG9vbCA9IG5ldyBQb29sKHtcbiAgY29ubmVjdGlvblN0cmluZyxcbiAgc3NsOiB7IHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2UgfSxcbiAgbWF4OiAyMCxcbiAgaWRsZVRpbWVvdXRNaWxsaXM6IDMwMDAwLFxuICBjb25uZWN0aW9uVGltZW91dE1pbGxpczogMTAwMDAsXG59KTtcblxucG9vbC5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuICBjb25zb2xlLmVycm9yKCdbZGJdIFVuZXhwZWN0ZWQgZXJyb3Igb24gaWRsZSBjbGllbnQnLCBlcnIpO1xufSk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbml0RGIoKSB7XG4gIC8vIFVzZXJzOiBpZCwgbmFtZSwgZW1haWwsIHBhc3N3b3JkX2hhc2gsIHdhbGxldF9hZGRyZXNzLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0XG4gIGF3YWl0IHBvb2wucXVlcnkoYFxuICAgIGNyZWF0ZSB0YWJsZSBpZiBub3QgZXhpc3RzIHVzZXJzIChcbiAgICAgIGlkIHV1aWQgcHJpbWFyeSBrZXkgZGVmYXVsdCBnZW5fcmFuZG9tX3V1aWQoKSxcbiAgICAgIG5hbWUgdGV4dCxcbiAgICAgIGVtYWlsIHRleHQgdW5pcXVlLFxuICAgICAgcGFzc3dvcmRfaGFzaCB0ZXh0LFxuICAgICAgd2FsbGV0X2FkZHJlc3MgdGV4dCB1bmlxdWUsXG4gICAgICBjcmVhdGVkX2F0IHRpbWVzdGFtcHR6IGRlZmF1bHQgbm93KCksXG4gICAgICB1cGRhdGVkX2F0IHRpbWVzdGFtcHR6IGRlZmF1bHQgbm93KClcbiAgICApO1xuICBgKTtcbiAgYXdhaXQgcG9vbC5xdWVyeShgYWx0ZXIgdGFibGUgdXNlcnMgYWRkIGNvbHVtbiBpZiBub3QgZXhpc3RzIG5hbWUgdGV4dDtgKS5jYXRjaCgoKSA9PiB7IH0pO1xuICBhd2FpdCBwb29sLnF1ZXJ5KGBhbHRlciB0YWJsZSB1c2VycyBhZGQgY29sdW1uIGlmIG5vdCBleGlzdHMgdXNlcm5hbWUgdGV4dDtgKS5jYXRjaCgoKSA9PiB7IH0pO1xuICBhd2FpdCBwb29sLnF1ZXJ5KGBhbHRlciB0YWJsZSB1c2VycyBhZGQgY29sdW1uIGlmIG5vdCBleGlzdHMgdGVsZWdyYW1fY2hhdF9pZCB0ZXh0O2ApLmNhdGNoKCgpID0+IHsgfSk7XG4gIGF3YWl0IHBvb2wucXVlcnkoYGFsdGVyIHRhYmxlIHVzZXJzIGFkZCBjb2x1bW4gaWYgbm90IGV4aXN0cyB0ZWxlZ3JhbV91c2VybmFtZSB0ZXh0O2ApLmNhdGNoKCgpID0+IHsgfSk7XG4gIGF3YWl0IHBvb2wucXVlcnkoYGNyZWF0ZSB1bmlxdWUgaW5kZXggaWYgbm90IGV4aXN0cyBpZHhfdXNlcnNfdXNlcm5hbWUgb24gdXNlcnModXNlcm5hbWUpIHdoZXJlIHVzZXJuYW1lIGlzIG5vdCBudWxsO2ApLmNhdGNoKCgpID0+IHsgfSk7XG5cbiAgYXdhaXQgcG9vbC5xdWVyeShgXG4gICAgY3JlYXRlIHRhYmxlIGlmIG5vdCBleGlzdHMgd2FsbGV0X25vbmNlcyAoXG4gICAgICB3YWxsZXRfYWRkcmVzcyB0ZXh0IHByaW1hcnkga2V5LFxuICAgICAgbm9uY2UgdGV4dCBub3QgbnVsbCxcbiAgICAgIGNyZWF0ZWRfYXQgdGltZXN0YW1wdHogZGVmYXVsdCBub3coKVxuICAgICk7XG4gIGApO1xuXG4gIC8vIFRhc2tzIHdpdGggRksgdG8gdXNlcnMsIGNhc2NhZGUgZGVsZXRlXG4gIGF3YWl0IHBvb2wucXVlcnkoYFxuICAgIGNyZWF0ZSB0YWJsZSBpZiBub3QgZXhpc3RzIHRhc2tzIChcbiAgICAgIGlkIHV1aWQgcHJpbWFyeSBrZXkgZGVmYXVsdCBnZW5fcmFuZG9tX3V1aWQoKSxcbiAgICAgIHVzZXJfaWQgdXVpZCBub3QgbnVsbCByZWZlcmVuY2VzIHVzZXJzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIHRpdGxlIHRleHQgbm90IG51bGwsXG4gICAgICBkZXNjcmlwdGlvbiB0ZXh0IGRlZmF1bHQgJycsXG4gICAgICBzdGF0dXMgdGV4dCBub3QgbnVsbCBkZWZhdWx0ICdwZW5kaW5nJyBjaGVjayAoc3RhdHVzIGluICgncGVuZGluZycsICdjb21wbGV0ZWQnKSksXG4gICAgICBwcmlvcml0eSB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgJ21lZGl1bScgY2hlY2sgKHByaW9yaXR5IGluICgnbG93JywgJ21lZGl1bScsICdoaWdoJykpLFxuICAgICAgZHVlX2RhdGUgdGltZXN0YW1wdHosXG4gICAgICB0YXNrX2hhc2ggdGV4dCxcbiAgICAgIHRyYW5zYWN0aW9uX2hhc2ggdGV4dCxcbiAgICAgIGNoYWluX3RpbWVzdGFtcCB0aW1lc3RhbXB0eixcbiAgICAgIGNyZWF0ZWRfYXQgdGltZXN0YW1wdHogZGVmYXVsdCBub3coKSxcbiAgICAgIHVwZGF0ZWRfYXQgdGltZXN0YW1wdHogZGVmYXVsdCBub3coKVxuICAgICk7XG4gIGApO1xuXG4gIGF3YWl0IHBvb2wucXVlcnkoYGNyZWF0ZSBpbmRleCBpZiBub3QgZXhpc3RzIGlkeF90YXNrc191c2VyX2lkIG9uIHRhc2tzKHVzZXJfaWQpO2ApO1xuICBhd2FpdCBwb29sLnF1ZXJ5KGBjcmVhdGUgaW5kZXggaWYgbm90IGV4aXN0cyBpZHhfdGFza3Nfc3RhdHVzIG9uIHRhc2tzKHN0YXR1cyk7YCk7XG4gIGF3YWl0IHBvb2wucXVlcnkoYGNyZWF0ZSBpbmRleCBpZiBub3QgZXhpc3RzIGlkeF90YXNrc19jcmVhdGVkX2F0IG9uIHRhc2tzKGNyZWF0ZWRfYXQgZGVzYyk7YCk7XG5cbiAgYXdhaXQgcG9vbC5xdWVyeShgYWx0ZXIgdGFibGUgdGFza3MgYWRkIGNvbHVtbiBpZiBub3QgZXhpc3RzIHRlYW1faWQgdXVpZDtgKS5jYXRjaCgoKSA9PiB7IH0pO1xuICBhd2FpdCBwb29sLnF1ZXJ5KGBhbHRlciB0YWJsZSB0YXNrcyBhZGQgY29sdW1uIGlmIG5vdCBleGlzdHMgYm9hcmRfY29sdW1uIHRleHQgZGVmYXVsdCAnYmFja2xvZyc7YCkuY2F0Y2goKCkgPT4geyB9KTtcbiAgYXdhaXQgcG9vbC5xdWVyeShgYWx0ZXIgdGFibGUgdGFza3MgYWRkIGNvbHVtbiBpZiBub3QgZXhpc3RzIGJvYXJkX29yZGVyIGludCBkZWZhdWx0IDA7YCkuY2F0Y2goKCkgPT4geyB9KTtcblxuICBhd2FpdCBwb29sLnF1ZXJ5KGBcbiAgICBjcmVhdGUgdGFibGUgaWYgbm90IGV4aXN0cyB0ZWFtcyAoXG4gICAgICBpZCB1dWlkIHByaW1hcnkga2V5IGRlZmF1bHQgZ2VuX3JhbmRvbV91dWlkKCksXG4gICAgICBuYW1lIHRleHQgbm90IG51bGwsXG4gICAgICBjcmVhdGVkX2J5IHV1aWQgbm90IG51bGwgcmVmZXJlbmNlcyB1c2VycyhpZCkgb24gZGVsZXRlIGNhc2NhZGUsXG4gICAgICBjcmVhdGVkX2F0IHRpbWVzdGFtcHR6IGRlZmF1bHQgbm93KClcbiAgICApO1xuICBgKTtcblxuICBhd2FpdCBwb29sLnF1ZXJ5KGBcbiAgICBjcmVhdGUgdGFibGUgaWYgbm90IGV4aXN0cyB0ZWFtX21lbWJlcnMgKFxuICAgICAgdGVhbV9pZCB1dWlkIG5vdCBudWxsIHJlZmVyZW5jZXMgdGVhbXMoaWQpIG9uIGRlbGV0ZSBjYXNjYWRlLFxuICAgICAgdXNlcl9pZCB1dWlkIG5vdCBudWxsIHJlZmVyZW5jZXMgdXNlcnMoaWQpIG9uIGRlbGV0ZSBjYXNjYWRlLFxuICAgICAgcm9sZSB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgJ21lbWJlcicgY2hlY2sgKHJvbGUgaW4gKCdvd25lcicsICdhZG1pbicsICdtZW1iZXInKSksXG4gICAgICBqb2luZWRfYXQgdGltZXN0YW1wdHogZGVmYXVsdCBub3coKSxcbiAgICAgIHByaW1hcnkga2V5ICh0ZWFtX2lkLCB1c2VyX2lkKVxuICAgICk7XG4gIGApO1xuXG4gIGF3YWl0IHBvb2wucXVlcnkoYFxuICAgIGNyZWF0ZSB0YWJsZSBpZiBub3QgZXhpc3RzIGludml0YXRpb25zIChcbiAgICAgIGlkIHV1aWQgcHJpbWFyeSBrZXkgZGVmYXVsdCBnZW5fcmFuZG9tX3V1aWQoKSxcbiAgICAgIHRlYW1faWQgdXVpZCBub3QgbnVsbCByZWZlcmVuY2VzIHRlYW1zKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIGludml0ZXJfaWQgdXVpZCBub3QgbnVsbCByZWZlcmVuY2VzIHVzZXJzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIGludml0ZWVfZW1haWwgdGV4dCBub3QgbnVsbCxcbiAgICAgIHN0YXR1cyB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgJ3BlbmRpbmcnIGNoZWNrIChzdGF0dXMgaW4gKCdwZW5kaW5nJywgJ2FjY2VwdGVkJywgJ3JlamVjdGVkJykpLFxuICAgICAgY3JlYXRlZF9hdCB0aW1lc3RhbXB0eiBkZWZhdWx0IG5vdygpXG4gICAgKTtcbiAgYCk7XG4gIGF3YWl0IHBvb2wucXVlcnkoYGNyZWF0ZSBpbmRleCBpZiBub3QgZXhpc3RzIGlkeF9pbnZpdGF0aW9uc19lbWFpbCBvbiBpbnZpdGF0aW9ucyhpbnZpdGVlX2VtYWlsKTtgKTtcblxuICBhd2FpdCBwb29sLnF1ZXJ5KGBcbiAgICBjcmVhdGUgdGFibGUgaWYgbm90IGV4aXN0cyBub3RpZmljYXRpb25zIChcbiAgICAgIGlkIHV1aWQgcHJpbWFyeSBrZXkgZGVmYXVsdCBnZW5fcmFuZG9tX3V1aWQoKSxcbiAgICAgIHVzZXJfaWQgdXVpZCBub3QgbnVsbCByZWZlcmVuY2VzIHVzZXJzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIHR5cGUgdGV4dCBub3QgbnVsbCxcbiAgICAgIHRpdGxlIHRleHQgbm90IG51bGwsXG4gICAgICBtZXNzYWdlIHRleHQgZGVmYXVsdCAnJyxcbiAgICAgIGRhdGEganNvbmIgZGVmYXVsdCAne30nLFxuICAgICAgcmVhZCBib29sZWFuIGRlZmF1bHQgZmFsc2UsXG4gICAgICBjcmVhdGVkX2F0IHRpbWVzdGFtcHR6IGRlZmF1bHQgbm93KClcbiAgICApO1xuICBgKTtcbiAgYXdhaXQgcG9vbC5xdWVyeShgY3JlYXRlIGluZGV4IGlmIG5vdCBleGlzdHMgaWR4X25vdGlmaWNhdGlvbnNfdXNlciBvbiBub3RpZmljYXRpb25zKHVzZXJfaWQsIHJlYWQsIGNyZWF0ZWRfYXQgZGVzYyk7YCk7XG5cbiAgYXdhaXQgcG9vbC5xdWVyeShgXG4gICAgY3JlYXRlIHRhYmxlIGlmIG5vdCBleGlzdHMgdGFza19hc3NpZ25lZXMgKFxuICAgICAgdGFza19pZCB1dWlkIG5vdCBudWxsIHJlZmVyZW5jZXMgdGFza3MoaWQpIG9uIGRlbGV0ZSBjYXNjYWRlLFxuICAgICAgdXNlcl9pZCB1dWlkIG5vdCBudWxsIHJlZmVyZW5jZXMgdXNlcnMoaWQpIG9uIGRlbGV0ZSBjYXNjYWRlLFxuICAgICAgYXNzaWduZWRfYXQgdGltZXN0YW1wdHogZGVmYXVsdCBub3coKSxcbiAgICAgIHByaW1hcnkga2V5ICh0YXNrX2lkLCB1c2VyX2lkKVxuICAgICk7XG4gIGApO1xuXG4gIGF3YWl0IHBvb2wucXVlcnkoYGFsdGVyIHRhYmxlIHRhc2tzIGFkZCBjb25zdHJhaW50IGZrX3Rhc2tzX3RlYW0gZm9yZWlnbiBrZXkgKHRlYW1faWQpIHJlZmVyZW5jZXMgdGVhbXMoaWQpIG9uIGRlbGV0ZSBzZXQgbnVsbDtgKS5jYXRjaCgoKSA9PiB7IH0pO1xuICBhd2FpdCBwb29sLnF1ZXJ5KGBjcmVhdGUgaW5kZXggaWYgbm90IGV4aXN0cyBpZHhfdGFza3NfdGVhbV9pZCBvbiB0YXNrcyh0ZWFtX2lkKTtgKS5jYXRjaCgoKSA9PiB7IH0pO1xuXG4gIC8vIOKUgOKUgCBDaGF0IHRhYmxlcyDilIDilIBcbiAgYXdhaXQgcG9vbC5xdWVyeShgXG4gICAgY3JlYXRlIHRhYmxlIGlmIG5vdCBleGlzdHMgY29udmVyc2F0aW9ucyAoXG4gICAgICBpZCB1dWlkIHByaW1hcnkga2V5IGRlZmF1bHQgZ2VuX3JhbmRvbV91dWlkKCksXG4gICAgICB0eXBlIHRleHQgbm90IG51bGwgY2hlY2sgKHR5cGUgaW4gKCdncm91cCcsICdkbScpKSxcbiAgICAgIG5hbWUgdGV4dCxcbiAgICAgIHRlYW1faWQgdXVpZCByZWZlcmVuY2VzIHRlYW1zKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIGNyZWF0ZWRfYXQgdGltZXN0YW1wdHogZGVmYXVsdCBub3coKVxuICAgICk7XG4gIGApO1xuICBhd2FpdCBwb29sLnF1ZXJ5KGBBTFRFUiBUQUJMRSBjb252ZXJzYXRpb25zIEFERCBDT0xVTU4gSUYgTk9UIEVYSVNUUyBwaW5uZWRfbWVzc2FnZV9pZCB1dWlkO2ApLmNhdGNoKCgpID0+IHsgfSk7XG5cbiAgYXdhaXQgcG9vbC5xdWVyeShgXG4gICAgY3JlYXRlIHRhYmxlIGlmIG5vdCBleGlzdHMgY29udmVyc2F0aW9uX21lbWJlcnMgKFxuICAgICAgY29udmVyc2F0aW9uX2lkIHV1aWQgbm90IG51bGwgcmVmZXJlbmNlcyBjb252ZXJzYXRpb25zKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIHVzZXJfaWQgdXVpZCBub3QgbnVsbCByZWZlcmVuY2VzIHVzZXJzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIGpvaW5lZF9hdCB0aW1lc3RhbXB0eiBkZWZhdWx0IG5vdygpLFxuICAgICAgcHJpbWFyeSBrZXkgKGNvbnZlcnNhdGlvbl9pZCwgdXNlcl9pZClcbiAgICApO1xuICBgKTtcbiAgYXdhaXQgcG9vbC5xdWVyeShgY3JlYXRlIGluZGV4IGlmIG5vdCBleGlzdHMgaWR4X2NvbnZfbWVtYmVyc191c2VyIG9uIGNvbnZlcnNhdGlvbl9tZW1iZXJzKHVzZXJfaWQpO2ApO1xuXG4gIGF3YWl0IHBvb2wucXVlcnkoYFxuICAgIGNyZWF0ZSB0YWJsZSBpZiBub3QgZXhpc3RzIG1lc3NhZ2VzIChcbiAgICAgIGlkIHV1aWQgcHJpbWFyeSBrZXkgZGVmYXVsdCBnZW5fcmFuZG9tX3V1aWQoKSxcbiAgICAgIGNvbnZlcnNhdGlvbl9pZCB1dWlkIG5vdCBudWxsIHJlZmVyZW5jZXMgY29udmVyc2F0aW9ucyhpZCkgb24gZGVsZXRlIGNhc2NhZGUsXG4gICAgICBzZW5kZXJfaWQgdXVpZCBub3QgbnVsbCByZWZlcmVuY2VzIHVzZXJzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIGNvbnRlbnQgdGV4dCBkZWZhdWx0ICcnLFxuICAgICAgbWVkaWFfdHlwZSB0ZXh0LFxuICAgICAgbWVkaWFfZGF0YSB0ZXh0LFxuICAgICAgY3JlYXRlZF9hdCB0aW1lc3RhbXB0eiBkZWZhdWx0IG5vdygpXG4gICAgKTtcbiAgYCk7XG4gIGF3YWl0IHBvb2wucXVlcnkoYGNyZWF0ZSBpbmRleCBpZiBub3QgZXhpc3RzIGlkeF9tZXNzYWdlc19jb252IG9uIG1lc3NhZ2VzKGNvbnZlcnNhdGlvbl9pZCwgY3JlYXRlZF9hdCBkZXNjKTtgKTtcbiAgYXdhaXQgcG9vbC5xdWVyeShgQUxURVIgVEFCTEUgbWVzc2FnZXMgQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTIG1lZGlhX3R5cGUgdGV4dDtgKS5jYXRjaCgoKSA9PiB7IH0pO1xuICBhd2FpdCBwb29sLnF1ZXJ5KGBBTFRFUiBUQUJMRSBtZXNzYWdlcyBBREQgQ09MVU1OIElGIE5PVCBFWElTVFMgbWVkaWFfZGF0YSB0ZXh0O2ApLmNhdGNoKCgpID0+IHsgfSk7XG4gIGF3YWl0IHBvb2wucXVlcnkoYEFMVEVSIFRBQkxFIG1lc3NhZ2VzIEFMVEVSIENPTFVNTiBjb250ZW50IERST1AgTk9UIE5VTEw7YCkuY2F0Y2goKCkgPT4geyB9KTtcbiAgYXdhaXQgcG9vbC5xdWVyeShgQUxURVIgVEFCTEUgbWVzc2FnZXMgQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTIHJlcGx5X3RvX2lkIHV1aWQgcmVmZXJlbmNlcyBtZXNzYWdlcyhpZCkgb24gZGVsZXRlIHNldCBudWxsO2ApLmNhdGNoKCgpID0+IHsgfSk7XG59XG4iXX0=