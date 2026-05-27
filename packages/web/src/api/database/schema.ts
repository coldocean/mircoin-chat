import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nickname: text("nickname").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "superadmin", "user"] }).notNull().default("user"),
  registeredAt: integer("registered_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastSeen: integer("last_seen", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  ip: text("ip"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  banReason: text("ban_reason"),
  hiddenRole: integer("hidden_role", { mode: "boolean" }).notNull().default(false),
});

export const channels = sqliteTable("channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  topic: text("topic").default(""),
  ownerNickname: text("owner_nickname").notNull(),
  mode: text("mode").default(""), // +n, +t, +i, +m, +s, etc.
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
  password: text("password"),
});

export const channelMessages = sqliteTable("channel_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelName: text("channel_name").notNull(),
  nickname: text("nickname").notNull(),
  message: text("message").notNull(),
  type: text("type", { enum: ["message", "action", "notice", "join", "part", "kick", "mode", "topic"] }).notNull().default("message"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const channelUsers = sqliteTable("channel_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelName: text("channel_name").notNull(),
  nickname: text("nickname").notNull(),
  role: text("role", { enum: ["owner", "op", "halfop", "voice", "regular"] }).notNull().default("regular"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("channel_user_idx").on(table.channelName, table.nickname),
]);

export const channelBans = sqliteTable("channel_bans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelName: text("channel_name").notNull(),
  bannedNickname: text("banned_nickname").notNull(),
  bannedBy: text("banned_by").notNull(),
  reason: text("reason"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
