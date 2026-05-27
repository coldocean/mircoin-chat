import { db } from "./database";
import * as schema from "./database/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { WSClientMessage, WSServerMessage, ChannelUserInfo, ChannelListItem, WhoisInfo } from "./ws-types";

// --- State ---
interface ConnectedUser {
  ws: any; // Bun WebSocket
  nickname: string;
  identified: boolean;
  role: "owner" | "superadmin" | "user";
  hiddenRole: boolean;
  ip: string;
  connectedAt: Date;
  lastActivity: Date;
  channels: Set<string>;
}

const connectedUsers = new Map<any, ConnectedUser>(); // ws -> user
const nickToWs = new Map<string, any>(); // nickname -> ws

const OWNER_NICK = "deemah";

const MOTD = [
  "╔══════════════════════════════════════════════════════╗",
  "║           Welcome to mIRCoin Chat (Free Chat)       ║",
  "║══════════════════════════════════════════════════════║",
  "║                                                      ║",
  "║  This is a free IRC-style chat service.              ║",
  "║  Please be respectful to other users.                ║",
  "║                                                      ║",
  "║  Commands:                                           ║",
  "║    /register <nick> <password>  - Register nickname  ║",
  "║    /identify <nick> <password>  - Login              ║",
  "║    /join #channel               - Join a channel     ║",
  "║    /list                        - List channels      ║",
  "║    /msg <nick> <message>        - Private message    ║",
  "║    /help                        - Full command list  ║",
  "║                                                      ║",
  "║  Rules:                                              ║",
  "║    1. No spamming or flooding                        ║",
  "║    2. No harassment or hate speech                   ║",
  "║    3. Respect channel operators                      ║",
  "║    4. Have fun!                                      ║",
  "║                                                      ║",
  "╚══════════════════════════════════════════════════════╝",
];

function send(ws: any, msg: WSServerMessage) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {}
}

function broadcast(msg: WSServerMessage, exclude?: any) {
  for (const [ws] of connectedUsers) {
    if (ws !== exclude) send(ws, msg);
  }
}

function broadcastToChannel(channel: string, msg: WSServerMessage, exclude?: any) {
  for (const [ws, user] of connectedUsers) {
    if (user.channels.has(channel) && ws !== exclude) {
      send(ws, msg);
    }
  }
}

function isAdmin(user: ConnectedUser): boolean {
  return user.role === "owner" || user.role === "superadmin";
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "mircoin_salt_2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getChannelUserRole(channelName: string, nickname: string): Promise<string | null> {
  const cu = await db.select().from(schema.channelUsers).where(
    and(eq(schema.channelUsers.channelName, channelName), eq(schema.channelUsers.nickname, nickname))
  );
  return cu[0]?.role ?? null;
}

async function hasChannelPermission(user: ConnectedUser, channelName: string, requiredRole: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const role = await getChannelUserRole(channelName, user.nickname);
  if (!role) return false;
  const hierarchy = ["owner", "op", "halfop", "voice", "regular"];
  return hierarchy.indexOf(role) <= hierarchy.indexOf(requiredRole);
}

// --- Handlers ---

export async function handleConnection(ws: any, ip: string) {
  const tempNick = `Guest${Math.floor(Math.random() * 99999)}`;
  const user: ConnectedUser = {
    ws, nickname: tempNick, identified: false, role: "user", hiddenRole: false,
    ip, connectedAt: new Date(), lastActivity: new Date(), channels: new Set(),
  };
  connectedUsers.set(ws, user);
  nickToWs.set(tempNick, ws);

  const onlineCount = connectedUsers.size;
  const channelCount = (await db.select({ count: sql<number>`count(*)` }).from(schema.channels))[0]?.count ?? 0;

  send(ws, {
    type: "connection_info",
    ip: ip,
    hostname: ip,
    timestamp: new Date().toISOString(),
  });

  send(ws, {
    type: "welcome",
    nickname: tempNick,
    motd: MOTD,
    serverInfo: {
      name: "mIRCoin Chat",
      version: "1.0.0",
      users: onlineCount,
      channels: channelCount as number,
    },
  });
}

export async function handleDisconnect(ws: any) {
  const user = connectedUsers.get(ws);
  if (!user) return;

  // Part from all channels
  for (const ch of user.channels) {
    broadcastToChannel(ch, { type: "parted", channel: ch, nickname: user.nickname, reason: "Connection closed" }, ws);
    await db.delete(schema.channelUsers).where(
      and(eq(schema.channelUsers.channelName, ch), eq(schema.channelUsers.nickname, user.nickname))
    );
  }

  // Notify PM partners
  broadcast({ type: "user_offline", nickname: user.nickname }, ws);

  if (user.identified) {
    await db.update(schema.users).set({ lastSeen: new Date() }).where(eq(schema.users.nickname, user.nickname));
  }

  nickToWs.delete(user.nickname);
  connectedUsers.delete(ws);
}

export async function handleMessage(ws: any, raw: string) {
  const user = connectedUsers.get(ws);
  if (!user) return;

  let msg: WSClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", code: "PARSE_ERROR", message: "Invalid JSON" });
    return;
  }

  user.lastActivity = new Date();

  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong", timestamp: Date.now() });
      break;

    case "register":
      await handleRegister(ws, user, msg.nickname, msg.password);
      break;

    case "identify":
      await handleIdentify(ws, user, msg.nickname, msg.password);
      break;

    case "nick":
      await handleNick(ws, user, msg.newNick);
      break;

    case "join":
      await handleJoin(ws, user, msg.channel, msg.password);
      break;

    case "part":
      await handlePart(ws, user, msg.channel, msg.reason);
      break;

    case "msg":
      await handleChannelMsg(ws, user, msg.target, msg.message);
      break;

    case "privmsg":
      handlePrivMsg(ws, user, msg.target, msg.message);
      break;

    case "action":
      await handleAction(ws, user, msg.target, msg.message);
      break;

    case "notice":
      handleNotice(ws, user, msg.target, msg.message);
      break;

    case "topic":
      await handleTopic(ws, user, msg.channel, msg.topic);
      break;

    case "kick":
      await handleKick(ws, user, msg.channel, msg.nickname, msg.reason);
      break;

    case "ban":
      await handleBan(ws, user, msg.channel, msg.nickname, msg.reason);
      break;

    case "unban":
      await handleUnban(ws, user, msg.channel, msg.nickname);
      break;

    case "mode":
      await handleMode(ws, user, msg.channel, msg.mode, msg.param);
      break;

    case "list":
      await handleList(ws);
      break;

    case "whois":
      await handleWhois(ws, user, msg.nickname);
      break;

    case "names":
      await handleNames(ws, user, msg.channel);
      break;

    case "quit":
      await handleQuit(ws, user, msg.reason);
      break;

    case "invite":
      handleInvite(ws, user, msg.nickname, msg.channel);
      break;

    case "op":
    case "deop":
    case "voice":
    case "devoice":
      await handleChannelRole(ws, user, msg);
      break;

    case "server_ban":
      await handleServerBan(ws, user, msg.nickname, msg.reason);
      break;

    case "server_unban":
      await handleServerUnban(ws, user, msg.nickname);
      break;

    case "set_superadmin":
      await handleSetSuperadmin(ws, user, msg.nickname);
      break;

    case "remove_superadmin":
      await handleRemoveSuperadmin(ws, user, msg.nickname);
      break;

    case "hideme":
      await handleHideMe(ws, user, msg.value);
      break;

    // PM relay messages - just forward to target
    case "pm_key_exchange":
    case "pm_key_accept":
    case "pm_encrypted":
    case "pm_session_close":
    case "pm_photo":
      handlePMRelay(ws, user, msg);
      break;

    default:
      send(ws, { type: "error", code: "UNKNOWN_CMD", message: "Unknown command" });
  }
}

// --- Command Implementations ---

async function handleRegister(ws: any, user: ConnectedUser, nickname: string, password: string) {
  if (!nickname || !password) {
    send(ws, { type: "error", code: "INVALID_PARAMS", message: "Usage: /register <nickname> <password>" });
    return;
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_\-\[\]\\^{}|`]{0,29}$/.test(nickname)) {
    send(ws, { type: "error", code: "INVALID_NICK", message: "Invalid nickname. Use letters, numbers, _ - [ ] \\ ^ { } | ` (max 30 chars)" });
    return;
  }

  if (password.length < 4) {
    send(ws, { type: "error", code: "WEAK_PASSWORD", message: "Password must be at least 4 characters" });
    return;
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.nickname, nickname));
  if (existing.length > 0) {
    send(ws, { type: "error", code: "NICK_TAKEN", message: `Nickname "${nickname}" is already registered` });
    return;
  }

  const hash = await hashPassword(password);
  const role = nickname.toLowerCase() === OWNER_NICK.toLowerCase() ? "owner" : "user";

  await db.insert(schema.users).values({
    nickname,
    passwordHash: hash,
    role,
    ip: user.ip,
  });

  // Update user state
  const oldNick = user.nickname;
  nickToWs.delete(oldNick);
  user.nickname = nickname;
  user.identified = true;
  user.role = role;
  nickToWs.set(nickname, ws);

  send(ws, { type: "registered", nickname });
  send(ws, { type: "identified", nickname, role, hiddenRole: false });

  if (oldNick !== nickname) {
    broadcast({ type: "nick_changed", oldNick, newNick: nickname }, ws);
  }

  broadcast({ type: "user_online", nickname }, ws);
}

async function handleIdentify(ws: any, user: ConnectedUser, nickname: string, password: string) {
  if (!nickname || !password) {
    send(ws, { type: "error", code: "INVALID_PARAMS", message: "Usage: /identify <nickname> <password>" });
    return;
  }

  const existing = await db.select().from(schema.users).where(eq(schema.users.nickname, nickname));
  if (existing.length === 0) {
    send(ws, { type: "error", code: "NOT_REGISTERED", message: `Nickname "${nickname}" is not registered. Use /register first.` });
    return;
  }

  const dbUser = existing[0];
  if (dbUser.banned) {
    send(ws, { type: "error", code: "BANNED", message: `You are banned: ${dbUser.banReason || "No reason given"}` });
    return;
  }

  const hash = await hashPassword(password);
  if (hash !== dbUser.passwordHash) {
    send(ws, { type: "error", code: "WRONG_PASSWORD", message: "Incorrect password" });
    return;
  }

  // Check if nick is already in use by another connection
  const existingWs = nickToWs.get(nickname);
  if (existingWs && existingWs !== ws) {
    send(ws, { type: "error", code: "NICK_IN_USE", message: `Nickname "${nickname}" is already in use` });
    return;
  }

  const oldNick = user.nickname;
  nickToWs.delete(oldNick);
  user.nickname = nickname;
  user.identified = true;
  user.role = dbUser.role as any;
  user.hiddenRole = !!dbUser.hiddenRole;
  nickToWs.set(nickname, ws);

  await db.update(schema.users).set({ lastSeen: new Date(), ip: user.ip }).where(eq(schema.users.nickname, nickname));

  send(ws, { type: "identified", nickname, role: dbUser.role, hiddenRole: !!dbUser.hiddenRole });

  if (oldNick !== nickname) {
    broadcast({ type: "nick_changed", oldNick, newNick: nickname }, ws);
  }

  broadcast({ type: "user_online", nickname }, ws);
}

async function handleNick(ws: any, user: ConnectedUser, newNick: string) {
  if (!newNick || !/^[a-zA-Z_][a-zA-Z0-9_\-\[\]\\^{}|`]{0,29}$/.test(newNick)) {
    send(ws, { type: "error", code: "INVALID_NICK", message: "Invalid nickname" });
    return;
  }

  // Check if registered by someone else
  const existing = await db.select().from(schema.users).where(eq(schema.users.nickname, newNick));
  if (existing.length > 0 && user.nickname !== newNick) {
    send(ws, { type: "error", code: "NICK_REGISTERED", message: `Nickname "${newNick}" is registered. Use /identify to log in.` });
    return;
  }

  if (nickToWs.has(newNick) && nickToWs.get(newNick) !== ws) {
    send(ws, { type: "error", code: "NICK_IN_USE", message: `Nickname "${newNick}" is already in use` });
    return;
  }

  const oldNick = user.nickname;
  nickToWs.delete(oldNick);
  user.nickname = newNick;
  nickToWs.set(newNick, ws);

  // Update channel_users table
  for (const ch of user.channels) {
    await db.update(schema.channelUsers).set({ nickname: newNick }).where(
      and(eq(schema.channelUsers.channelName, ch), eq(schema.channelUsers.nickname, oldNick))
    );
  }

  broadcast({ type: "nick_changed", oldNick, newNick });
}

async function handleJoin(ws: any, user: ConnectedUser, channelName: string, password?: string) {
  if (!channelName.startsWith("#")) channelName = "#" + channelName;
  channelName = channelName.toLowerCase();

  if (!/^#[a-zA-Z0-9_\-]{1,49}$/.test(channelName)) {
    send(ws, { type: "error", code: "INVALID_CHANNEL", message: "Invalid channel name" });
    return;
  }

  // Check if channel exists, if not create it
  let channel = (await db.select().from(schema.channels).where(eq(schema.channels.name, channelName)))[0];

  if (!channel) {
    // Create channel, user becomes owner
    await db.insert(schema.channels).values({
      name: channelName,
      ownerNickname: user.nickname,
      topic: `Welcome to ${channelName}`,
    });
    channel = (await db.select().from(schema.channels).where(eq(schema.channels.name, channelName)))[0];
  } else {
    // Check password if channel has one
    if (channel.password && channel.password !== password) {
      send(ws, { type: "error", code: "BAD_CHANNEL_KEY", message: "Incorrect channel password" });
      return;
    }

    // Check ban
    const ban = await db.select().from(schema.channelBans).where(
      and(eq(schema.channelBans.channelName, channelName), eq(schema.channelBans.bannedNickname, user.nickname))
    );
    if (ban.length > 0 && !isAdmin(user)) {
      send(ws, { type: "error", code: "BANNED_FROM_CHANNEL", message: `You are banned from ${channelName}` });
      return;
    }
  }

  // Add to channel if not already there
  const existingMembership = await db.select().from(schema.channelUsers).where(
    and(eq(schema.channelUsers.channelName, channelName), eq(schema.channelUsers.nickname, user.nickname))
  );

  if (existingMembership.length === 0) {
    const role = channel.ownerNickname === user.nickname ? "owner" : (isAdmin(user) ? "op" : "regular");
    await db.insert(schema.channelUsers).values({
      channelName,
      nickname: user.nickname,
      role,
    });
  }

  user.channels.add(channelName);

  // Log join message
  await db.insert(schema.channelMessages).values({
    channelName,
    nickname: user.nickname,
    message: `${user.nickname} has joined ${channelName}`,
    type: "join",
  });

  // Get channel users
  const channelUsersDb = await db.select().from(schema.channelUsers).where(eq(schema.channelUsers.channelName, channelName));
  const users: ChannelUserInfo[] = channelUsersDb.map(cu => ({
    nickname: cu.nickname,
    role: cu.role as any,
    isOnline: nickToWs.has(cu.nickname),
  }));

  // Send joined to the user
  send(ws, { type: "joined", channel: channelName, nickname: user.nickname, users });

  // Send topic
  if (channel.topic) {
    send(ws, { type: "topic_changed", channel: channelName, nickname: "server", topic: channel.topic });
  }

  // Send recent history (last 50 messages)
  const history = await db.select().from(schema.channelMessages)
    .where(eq(schema.channelMessages.channelName, channelName))
    .orderBy(desc(schema.channelMessages.timestamp))
    .limit(50);

  if (history.length > 0) {
    send(ws, {
      type: "channel_history",
      channel: channelName,
      messages: history.reverse().map(m => ({
        nickname: m.nickname,
        message: m.message,
        msgType: m.type,
        timestamp: m.timestamp.toISOString(),
      })),
    });
  }

  // Broadcast to channel
  broadcastToChannel(channelName, { type: "joined", channel: channelName, nickname: user.nickname, users }, ws);
}

async function handlePart(ws: any, user: ConnectedUser, channelName: string, reason?: string) {
  channelName = channelName.toLowerCase();
  if (!user.channels.has(channelName)) {
    send(ws, { type: "error", code: "NOT_IN_CHANNEL", message: `You're not in ${channelName}` });
    return;
  }

  user.channels.delete(channelName);
  await db.delete(schema.channelUsers).where(
    and(eq(schema.channelUsers.channelName, channelName), eq(schema.channelUsers.nickname, user.nickname))
  );

  await db.insert(schema.channelMessages).values({
    channelName,
    nickname: user.nickname,
    message: `${user.nickname} has left ${channelName}${reason ? ` (${reason})` : ""}`,
    type: "part",
  });

  broadcastToChannel(channelName, { type: "parted", channel: channelName, nickname: user.nickname, reason });
  send(ws, { type: "parted", channel: channelName, nickname: user.nickname, reason });
}

async function handleChannelMsg(ws: any, user: ConnectedUser, target: string, message: string) {
  if (!message) return;
  target = target.toLowerCase();

  if (!target.startsWith("#")) {
    // It's a private message to a user
    handlePrivMsg(ws, user, target, message);
    return;
  }

  if (!user.channels.has(target)) {
    send(ws, { type: "error", code: "NOT_IN_CHANNEL", message: `You're not in ${target}` });
    return;
  }

  await db.insert(schema.channelMessages).values({
    channelName: target,
    nickname: user.nickname,
    message,
    type: "message",
  });

  const msgObj: WSServerMessage = {
    type: "channel_msg",
    channel: target,
    nickname: user.nickname,
    message,
    timestamp: new Date().toISOString(),
  };

  broadcastToChannel(target, msgObj);
}

function handlePrivMsg(ws: any, user: ConnectedUser, target: string, message: string) {
  const targetWs = nickToWs.get(target);
  if (!targetWs) {
    send(ws, { type: "pm_user_offline", nickname: target });
    return;
  }
  // For unencrypted quick messages, relay as-is
  send(targetWs, { type: "pm_encrypted", from: user.nickname, encrypted: message, iv: "" });
}

async function handleAction(ws: any, user: ConnectedUser, target: string, message: string) {
  if (!message) return;

  if (target.startsWith("#")) {
    target = target.toLowerCase();
    if (!user.channels.has(target)) {
      send(ws, { type: "error", code: "NOT_IN_CHANNEL", message: `You're not in ${target}` });
      return;
    }

    await db.insert(schema.channelMessages).values({
      channelName: target,
      nickname: user.nickname,
      message,
      type: "action",
    });

    broadcastToChannel(target, {
      type: "channel_action",
      channel: target,
      nickname: user.nickname,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

function handleNotice(ws: any, user: ConnectedUser, target: string, message: string) {
  if (target.startsWith("#")) {
    broadcastToChannel(target.toLowerCase(), {
      type: "channel_notice",
      channel: target.toLowerCase(),
      nickname: user.nickname,
      message,
      timestamp: new Date().toISOString(),
    });
  } else {
    const targetWs = nickToWs.get(target);
    if (targetWs) {
      send(targetWs, { type: "channel_notice", channel: "", nickname: user.nickname, message, timestamp: new Date().toISOString() });
    }
  }
}

async function handleTopic(ws: any, user: ConnectedUser, channelName: string, topic: string) {
  channelName = channelName.toLowerCase();
  if (!user.channels.has(channelName)) {
    send(ws, { type: "error", code: "NOT_IN_CHANNEL", message: `You're not in ${channelName}` });
    return;
  }

  const hasPerms = await hasChannelPermission(user, channelName, "halfop");
  if (!hasPerms) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "You don't have permission to change the topic" });
    return;
  }

  await db.update(schema.channels).set({ topic }).where(eq(schema.channels.name, channelName));

  await db.insert(schema.channelMessages).values({
    channelName,
    nickname: user.nickname,
    message: `${user.nickname} changed the topic to: ${topic}`,
    type: "topic",
  });

  broadcastToChannel(channelName, { type: "topic_changed", channel: channelName, nickname: user.nickname, topic });
}

async function handleKick(ws: any, user: ConnectedUser, channelName: string, targetNick: string, reason?: string) {
  channelName = channelName.toLowerCase();
  const hasPerms = await hasChannelPermission(user, channelName, "halfop");
  if (!hasPerms) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "You don't have permission to kick" });
    return;
  }

  const targetWs = nickToWs.get(targetNick);
  const targetUser = targetWs ? connectedUsers.get(targetWs) : null;

  // Can't kick admins unless you're also an admin
  if (targetUser && isAdmin(targetUser) && !isAdmin(user)) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "You can't kick a server admin" });
    return;
  }

  await db.delete(schema.channelUsers).where(
    and(eq(schema.channelUsers.channelName, channelName), eq(schema.channelUsers.nickname, targetNick))
  );

  if (targetUser) {
    targetUser.channels.delete(channelName);
  }

  await db.insert(schema.channelMessages).values({
    channelName,
    nickname: user.nickname,
    message: `${user.nickname} kicked ${targetNick}${reason ? `: ${reason}` : ""}`,
    type: "kick",
  });

  broadcastToChannel(channelName, { type: "kicked", channel: channelName, nickname: targetNick, by: user.nickname, reason });
  if (targetWs) {
    send(targetWs, { type: "kicked", channel: channelName, nickname: targetNick, by: user.nickname, reason });
  }
}

async function handleBan(ws: any, user: ConnectedUser, channelName: string, targetNick: string, reason?: string) {
  channelName = channelName.toLowerCase();
  const hasPerms = await hasChannelPermission(user, channelName, "op");
  if (!hasPerms) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "You need op to ban" });
    return;
  }

  await db.insert(schema.channelBans).values({
    channelName,
    bannedNickname: targetNick,
    bannedBy: user.nickname,
    reason,
  });

  // Also kick them
  await handleKick(ws, user, channelName, targetNick, reason || "Banned");

  broadcastToChannel(channelName, { type: "banned", channel: channelName, nickname: targetNick, by: user.nickname, reason });
}

async function handleUnban(ws: any, user: ConnectedUser, channelName: string, targetNick: string) {
  channelName = channelName.toLowerCase();
  const hasPerms = await hasChannelPermission(user, channelName, "op");
  if (!hasPerms) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "You need op to unban" });
    return;
  }

  await db.delete(schema.channelBans).where(
    and(eq(schema.channelBans.channelName, channelName), eq(schema.channelBans.bannedNickname, targetNick))
  );

  broadcastToChannel(channelName, { type: "unbanned", channel: channelName, nickname: targetNick, by: user.nickname });
}

async function handleMode(ws: any, user: ConnectedUser, channelName: string, mode: string, param?: string) {
  channelName = channelName.toLowerCase();
  const hasPerms = await hasChannelPermission(user, channelName, "op");
  if (!hasPerms) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "You need op to change modes" });
    return;
  }

  const channel = (await db.select().from(schema.channels).where(eq(schema.channels.name, channelName)))[0];
  if (!channel) return;

  let currentMode = channel.mode || "";
  // Simple mode handling: +x adds, -x removes
  if (mode.startsWith("+")) {
    const flag = mode.slice(1);
    if (!currentMode.includes(flag)) currentMode += flag;
  } else if (mode.startsWith("-")) {
    const flag = mode.slice(1);
    currentMode = currentMode.replace(flag, "");
  }

  await db.update(schema.channels).set({ mode: currentMode }).where(eq(schema.channels.name, channelName));

  await db.insert(schema.channelMessages).values({
    channelName,
    nickname: user.nickname,
    message: `${user.nickname} sets mode ${mode}${param ? ` ${param}` : ""}`,
    type: "mode",
  });

  broadcastToChannel(channelName, { type: "mode_changed", channel: channelName, nickname: user.nickname, mode, param });
}

async function handleList(ws: any) {
  const allChannels = await db.select().from(schema.channels).where(eq(schema.channels.isPrivate, false));
  const list: ChannelListItem[] = [];

  for (const ch of allChannels) {
    const count = (await db.select({ count: sql<number>`count(*)` }).from(schema.channelUsers)
      .where(eq(schema.channelUsers.channelName, ch.name)))[0]?.count ?? 0;
    list.push({
      name: ch.name,
      topic: ch.topic || "",
      userCount: count as number,
      isPrivate: ch.isPrivate,
    });
  }

  send(ws, { type: "channel_list", channels: list });
}

async function handleWhois(ws: any, user: ConnectedUser, targetNick: string) {
  const target = await db.select().from(schema.users).where(eq(schema.users.nickname, targetNick));
  if (target.length === 0) {
    send(ws, { type: "error", code: "NO_SUCH_NICK", message: `No such nickname: ${targetNick}` });
    return;
  }

  const t = target[0];
  const targetUser = [...connectedUsers.values()].find(u => u.nickname === targetNick);

  const chans = await db.select().from(schema.channelUsers).where(eq(schema.channelUsers.nickname, targetNick));

  // If target has hidden role, show "user" unless the requester is admin
  const visibleRole = (t.hiddenRole && !isAdmin(user)) ? "user" : t.role;

  const info: WhoisInfo = {
    nickname: t.nickname,
    role: visibleRole,
    channels: chans.map(c => c.channelName),
    registeredAt: t.registeredAt.toISOString(),
    lastSeen: t.lastSeen.toISOString(),
    ip: isAdmin(user) ? (t.ip || undefined) : undefined,
    idle: targetUser ? Math.floor((Date.now() - targetUser.lastActivity.getTime()) / 1000) : -1,
    isOnline: !!targetUser,
  };

  send(ws, { type: "whois_reply", nickname: targetNick, info });
}

async function handleNames(ws: any, user: ConnectedUser, channelName: string) {
  channelName = channelName.toLowerCase();
  const channelUsersDb = await db.select().from(schema.channelUsers).where(eq(schema.channelUsers.channelName, channelName));
  const users: ChannelUserInfo[] = channelUsersDb.map(cu => ({
    nickname: cu.nickname,
    role: cu.role as any,
    isOnline: nickToWs.has(cu.nickname),
  }));
  send(ws, { type: "names_reply", channel: channelName, users });
}

async function handleQuit(ws: any, user: ConnectedUser, reason?: string) {
  broadcast({ type: "user_quit", nickname: user.nickname, reason }, ws);
  await handleDisconnect(ws);
  try { ws.close(); } catch {}
}

function handleInvite(ws: any, user: ConnectedUser, targetNick: string, channelName: string) {
  const targetWs = nickToWs.get(targetNick);
  if (!targetWs) {
    send(ws, { type: "error", code: "NO_SUCH_NICK", message: `${targetNick} is not online` });
    return;
  }
  send(targetWs, { type: "invited", channel: channelName, by: user.nickname });
  send(ws, { type: "info", message: `Invited ${targetNick} to ${channelName}` });
}

async function handleChannelRole(ws: any, user: ConnectedUser, msg: any) {
  const channelName = msg.channel.toLowerCase();
  const hasPerms = await hasChannelPermission(user, channelName, "op");
  if (!hasPerms) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "You need op" });
    return;
  }

  let newRole: string;
  switch (msg.type) {
    case "op": newRole = "op"; break;
    case "deop": newRole = "regular"; break;
    case "voice": newRole = "voice"; break;
    case "devoice": newRole = "regular"; break;
    default: return;
  }

  await db.update(schema.channelUsers).set({ role: newRole as any }).where(
    and(eq(schema.channelUsers.channelName, channelName), eq(schema.channelUsers.nickname, msg.nickname))
  );

  const modeChar = msg.type === "op" || msg.type === "deop" ? "o" : "v";
  const modeSign = msg.type === "op" || msg.type === "voice" ? "+" : "-";

  broadcastToChannel(channelName, {
    type: "mode_changed",
    channel: channelName,
    nickname: user.nickname,
    mode: `${modeSign}${modeChar}`,
    param: msg.nickname,
  });
}

async function handleServerBan(ws: any, user: ConnectedUser, targetNick: string, reason?: string) {
  if (!isAdmin(user)) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "Server admin only" });
    return;
  }

  await db.update(schema.users).set({ banned: true, banReason: reason || "Banned by admin" })
    .where(eq(schema.users.nickname, targetNick));

  const targetWs = nickToWs.get(targetNick);
  if (targetWs) {
    send(targetWs, { type: "error", code: "BANNED", message: `You have been banned: ${reason || "No reason given"}` });
    await handleQuit(targetWs, connectedUsers.get(targetWs)!, "Banned");
  }

  send(ws, { type: "info", message: `Server banned ${targetNick}` });
}

async function handleServerUnban(ws: any, user: ConnectedUser, targetNick: string) {
  if (!isAdmin(user)) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "Server admin only" });
    return;
  }

  await db.update(schema.users).set({ banned: false, banReason: null })
    .where(eq(schema.users.nickname, targetNick));

  send(ws, { type: "info", message: `Server unbanned ${targetNick}` });
}

async function handleSetSuperadmin(ws: any, user: ConnectedUser, targetNick: string) {
  if (user.role !== "owner") {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "Owner only" });
    return;
  }

  // Count current superadmins
  const superadmins = await db.select().from(schema.users).where(eq(schema.users.role, "superadmin"));
  if (superadmins.length >= 4) {
    send(ws, { type: "error", code: "LIMIT_REACHED", message: "Maximum 4 superadmins allowed" });
    return;
  }

  await db.update(schema.users).set({ role: "superadmin" }).where(eq(schema.users.nickname, targetNick));

  const targetWs = nickToWs.get(targetNick);
  const targetUser = targetWs ? connectedUsers.get(targetWs) : null;
  if (targetUser) targetUser.role = "superadmin";

  send(ws, { type: "info", message: `${targetNick} is now a superadmin` });
  if (targetWs) send(targetWs, { type: "info", message: "You are now a superadmin" });
}

async function handleRemoveSuperadmin(ws: any, user: ConnectedUser, targetNick: string) {
  if (user.role !== "owner") {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "Owner only" });
    return;
  }

  await db.update(schema.users).set({ role: "user" }).where(eq(schema.users.nickname, targetNick));

  const targetWs = nickToWs.get(targetNick);
  const targetUser = targetWs ? connectedUsers.get(targetWs) : null;
  if (targetUser) targetUser.role = "user";

  send(ws, { type: "info", message: `${targetNick} is no longer a superadmin` });
}

async function handleHideMe(ws: any, user: ConnectedUser, value: boolean) {
  if (!isAdmin(user)) {
    send(ws, { type: "error", code: "NO_PERMISSION", message: "Owner/superadmin only" });
    return;
  }

  if (!user.identified) {
    send(ws, { type: "error", code: "NOT_IDENTIFIED", message: "You must be identified to use this command" });
    return;
  }

  user.hiddenRole = value;
  await db.update(schema.users).set({ hiddenRole: value }).where(eq(schema.users.nickname, user.nickname));

  send(ws, { type: "info", message: value ? "Your role badge is now hidden from other users" : "Your role badge is now visible to all users" });

  // Re-send identified so client updates its own badge
  send(ws, { type: "identified", nickname: user.nickname, role: user.role, hiddenRole: value });

  // Update names in all channels this user is in, so other users see the change
  for (const ch of user.channels) {
    const channelUsersDb = await db.select().from(schema.channelUsers).where(eq(schema.channelUsers.channelName, ch));
    const users: ChannelUserInfo[] = channelUsersDb.map(cu => ({
      nickname: cu.nickname,
      role: cu.role as any,
      isOnline: nickToWs.has(cu.nickname),
    }));
    broadcastToChannel(ch, { type: "names_reply", channel: ch, users });
  }
}

function handlePMRelay(ws: any, user: ConnectedUser, msg: WSClientMessage) {
  let target: string = "";
  if ("target" in msg) target = msg.target;
  if (!target) return;

  const targetWs = nickToWs.get(target);
  if (!targetWs) {
    send(ws, { type: "pm_user_offline", nickname: target });
    return;
  }

  // Relay PM messages as-is (encrypted content, we don't read it)
  switch (msg.type) {
    case "pm_key_exchange":
      send(targetWs, { type: "pm_key_exchange", from: user.nickname, publicKey: (msg as any).publicKey });
      break;
    case "pm_key_accept":
      send(targetWs, { type: "pm_key_accept", from: user.nickname, publicKey: (msg as any).publicKey });
      break;
    case "pm_encrypted":
      send(targetWs, { type: "pm_encrypted", from: user.nickname, encrypted: (msg as any).encrypted, iv: (msg as any).iv });
      break;
    case "pm_session_close":
      send(targetWs, { type: "pm_session_close", from: user.nickname });
      break;
    case "pm_photo":
      send(targetWs, { type: "pm_photo", from: user.nickname, data: (msg as any).data, iv: (msg as any).iv });
      break;
  }
}
