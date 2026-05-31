-- ═══════════════════════════════════════════════════════════════════════════
-- STUDYROOM — Complete Database Schema
-- Run this entire file in your Supabase SQL Editor (one-shot)
-- Last updated: 2026-05-29
-- ═══════════════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1. USERS                                                               │
-- │    Used by: auth.js, users.js, friends.js, rooms.js, todos.js,         │
-- │             activity.js, lobby.js                                      │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        UNIQUE NOT NULL,
  password_hash text        NOT NULL,
  avatar_url    text        DEFAULT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_users" ON users;
CREATE POLICY "service_all_users" ON users FOR ALL USING (true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2. ROOMS                                                               │
-- │    Used by: rooms.js (create, validate, join-public, mine, info,       │
-- │             delete), lobby.js (public room listing)                    │
-- │    Columns required by code:                                           │
-- │      id, name, code, pin, is_public, visibility, topic,                │
-- │      max_members, created_by, expires_at, created_at                   │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS rooms (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL DEFAULT 'Study Room',
  code          text        UNIQUE NOT NULL,
  pin           char(4)     NOT NULL DEFAULT '0000',
  is_public     boolean     DEFAULT false,
  visibility    text        NOT NULL DEFAULT 'private'
                            CHECK (visibility IN ('public', 'protected', 'private')),
  topic         text        DEFAULT 'General',
  max_members   int         DEFAULT 10,
  created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rooms_code_idx   ON rooms(code);
CREATE INDEX IF NOT EXISTS rooms_public_idx ON rooms(is_public);
CREATE INDEX IF NOT EXISTS rooms_user_idx   ON rooms(created_by);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_rooms" ON rooms;
CREATE POLICY "service_all_rooms" ON rooms FOR ALL USING (true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 3. ROOM ACCESS REQUESTS (for protected rooms)                          │
-- │    Used by: rooms.js (request-join, respond-request, pending-requests) │
-- │    Columns required by code:                                           │
-- │      id, room_code, requester_id, owner_id, status, message,           │
-- │      created_at                                                        │
-- │    Upsert conflict key: (room_code, requester_id)                      │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS room_access_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code     text        NOT NULL,
  requester_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'rejected')),
  message       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_code, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_rar_room  ON room_access_requests(room_code);
CREATE INDEX IF NOT EXISTS idx_rar_owner ON room_access_requests(owner_id);

ALTER TABLE room_access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_rar" ON room_access_requests;
CREATE POLICY "service_all_rar" ON room_access_requests FOR ALL USING (true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 4. FRIENDS                                                             │
-- │    Used by: friends.js (list, request, accept, delete)                 │
-- │             rooms.js  (getFriendIds helper, friends-activity)          │
-- │    Columns required by code:                                           │
-- │      id, user_id_1, user_id_2, status, requested_by, created_at       │
-- │    Supabase join syntax used:                                          │
-- │      u1:user_id_1 ( id, name, email, avatar_url )                     │
-- │      u2:user_id_2 ( id, name, email, avatar_url )                     │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS friends (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_2     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted')),
  requested_by  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(user_id_1, user_id_2)
);

CREATE INDEX IF NOT EXISTS friends_user1_idx ON friends(user_id_1);
CREATE INDEX IF NOT EXISTS friends_user2_idx ON friends(user_id_2);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_friends" ON friends;
CREATE POLICY "service_all_friends" ON friends FOR ALL USING (true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 5. TODOS                                                               │
-- │    Used by: todos.js (create, list, delete)                            │
-- │    Columns required by code:                                           │
-- │      id, title, description, created_by, created_at                    │
-- │    Supabase join syntax used:                                          │
-- │      creator:created_by ( id, name, avatar_url )                       │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS todos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  description   text,
  is_completed  boolean     DEFAULT false,
  created_by    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todos_user_idx ON todos(created_by);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_todos" ON todos;
CREATE POLICY "service_all_todos" ON todos FOR ALL USING (true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 6. TODO MEMBERS                                                        │
-- │    Used by: todos.js (add/remove collaborators, list members,          │
-- │             check membership for toggle)                               │
-- │    Columns required by code:                                           │
-- │      id, todo_id, user_id, added_at                                    │
-- │    Upsert conflict key: (todo_id, user_id)                             │
-- │    Supabase join syntax used:                                          │
-- │      user:user_id ( id, name, avatar_url )                             │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS todo_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id       uuid        NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at      timestamptz DEFAULT now(),
  UNIQUE(todo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_todo_members_todo ON todo_members(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_members_user ON todo_members(user_id);

ALTER TABLE todo_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_todo_members" ON todo_members;
CREATE POLICY "service_all_todo_members" ON todo_members FOR ALL USING (true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 7. TODO COMPLETIONS                                                    │
-- │    Used by: todos.js (toggle completion per user, build enriched todo) │
-- │    Columns required by code:                                           │
-- │      id, todo_id, user_id, completed_at                                │
-- │    Unique constraint: (todo_id, user_id) — one completion per member   │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS todo_completions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id       uuid        NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at  timestamptz DEFAULT now(),
  UNIQUE(todo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_todo_completions_todo ON todo_completions(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_completions_user ON todo_completions(user_id);

ALTER TABLE todo_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_todo_completions" ON todo_completions;
CREATE POLICY "service_all_todo_completions" ON todo_completions FOR ALL USING (true);


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 8. ACTIVITY LOGS                                                       │
-- │    Used by: activity.js (get chart data, logActivity helper)           │
-- │             socket/core.js (logs session duration on disconnect)       │
-- │    Columns required by code:                                           │
-- │      id, user_id, duration_minutes, room_code, created_at              │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS activity_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_minutes int         NOT NULL DEFAULT 0,
  room_code        text        DEFAULT NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_user_idx    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS activity_created_idx ON activity_logs(created_at);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_activity" ON activity_logs;
CREATE POLICY "service_all_activity" ON activity_logs FOR ALL USING (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- NOTES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tables NOT in Supabase (they live in MongoDB via Mongoose):
--   • Chat, ChatUser, Message  → server/models/chat.js  (MongoDB)
--   • Media                    → server/models/media.js  (MongoDB)
--
-- Features using in-memory storage (no database):
--   • Timer       → server/routes/features/timer.js      (JS object)
--   • Whiteboard  → server/routes/features/whiteboard.js  (JS object)
--
-- Features using external APIs (no database):
--   • Chess       → server/routes/chess.js     (Stockfish binary)
--   • Music       → server/routes/music.js     (YouTube Data API)
--
-- Files (Supabase Storage, not SQL):
--   • Room files  → server/routes/features/files.js
--     Requires a Supabase Storage bucket named "room-files"
--
-- ═══════════════════════════════════════════════════════════════════════════
