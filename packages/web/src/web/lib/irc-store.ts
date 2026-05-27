// Zustand-like simple state management for IRC
import { useSyncExternalStore, useCallback } from "react";

export interface ChatMessage {
  id: string;
  nickname: string;
  message: string;
  type: "message" | "action" | "notice" | "join" | "part" | "kick" | "mode" | "topic" | "server" | "error" | "info" | "quit" | "pm" | "pm_photo";
  timestamp: string;
  isHistory?: boolean;
}

export interface Channel {
  name: string;
  topic: string;
  users: { nickname: string; role: string; isOnline: boolean }[];
  messages: ChatMessage[];
  unread: number;
  isMentioned: boolean;
}

export interface PMSession {
  nickname: string;
  messages: ChatMessage[];
  isOpen: boolean;
  sessionActive: boolean;
  unread: number;
}

export interface IRCState {
  // Connection
  connected: boolean;
  identified: boolean;
  nickname: string;
  role: string;
  ip: string;

  // Channels
  channels: Map<string, Channel>;
  activeChannel: string | null;

  // PMs
  pmSessions: Map<string, PMSession>;
  activePM: string | null;

  // Active view
  activeView: "channel" | "pm" | "server";

  // Server messages (connection log)
  serverMessages: ChatMessage[];

  // Channel list (from /list)
  channelList: { name: string; topic: string; userCount: number; isPrivate: boolean }[];

  // Theme
  theme: "dark" | "light";

  // Online users we know about
  onlineUsers: Set<string>;
}

let state: IRCState = {
  connected: false,
  identified: false,
  nickname: "",
  role: "user",
  ip: "",
  channels: new Map(),
  activeChannel: null,
  pmSessions: new Map(),
  activePM: null,
  activeView: "server",
  serverMessages: [],
  channelList: [],
  theme: (localStorage.getItem("mircoin-theme") as "dark" | "light") || "dark",
  onlineUsers: new Set(),
};

const listeners = new Set<() => void>();

function emit() {
  state = { ...state }; // trigger re-render
  listeners.forEach((l) => l());
}

export function getState(): IRCState {
  return state;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIRCStore<T>(selector: (s: IRCState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// --- Mutations ---

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function setConnected(connected: boolean) {
  state.connected = connected;
  emit();
}

export function setIdentified(nickname: string, role: string) {
  state.identified = true;
  state.nickname = nickname;
  state.role = role;
  emit();
}

export function setNickname(nickname: string) {
  state.nickname = nickname;
  emit();
}

export function setIP(ip: string) {
  state.ip = ip;
  emit();
}

export function addServerMessage(message: string, type: ChatMessage["type"] = "server") {
  state.serverMessages = [...state.serverMessages, {
    id: genId(),
    nickname: "*",
    message,
    type,
    timestamp: new Date().toISOString(),
  }];
  emit();
}

export function addChannel(name: string, users: Channel["users"] = []) {
  if (!state.channels.has(name)) {
    state.channels = new Map(state.channels);
    state.channels.set(name, { name, topic: "", users, messages: [], unread: 0, isMentioned: false });
  }
  state.activeChannel = name;
  state.activeView = "channel";
  emit();
}

export function removeChannel(name: string) {
  state.channels = new Map(state.channels);
  state.channels.delete(name);
  if (state.activeChannel === name) {
    const keys = [...state.channels.keys()];
    state.activeChannel = keys.length > 0 ? keys[0] : null;
    if (!state.activeChannel) state.activeView = "server";
  }
  emit();
}

export function setActiveChannel(name: string) {
  state.activeChannel = name;
  state.activeView = "channel";
  const ch = state.channels.get(name);
  if (ch) {
    ch.unread = 0;
    ch.isMentioned = false;
    state.channels = new Map(state.channels);
  }
  state.activePM = null;
  emit();
}

export function addChannelMessage(channel: string, msg: ChatMessage) {
  const ch = state.channels.get(channel);
  if (!ch) return;
  ch.messages = [...ch.messages, msg];
  if (state.activeChannel !== channel || state.activeView !== "channel") {
    ch.unread++;
    if (msg.message.includes(state.nickname)) ch.isMentioned = true;
  }
  state.channels = new Map(state.channels);
  emit();
}

export function setChannelTopic(channel: string, topic: string) {
  const ch = state.channels.get(channel);
  if (ch) {
    ch.topic = topic;
    state.channels = new Map(state.channels);
    emit();
  }
}

export function updateChannelUsers(channel: string, users: Channel["users"]) {
  const ch = state.channels.get(channel);
  if (ch) {
    ch.users = users;
    state.channels = new Map(state.channels);
    emit();
  }
}

export function addUserToChannel(channel: string, nickname: string, role = "regular") {
  const ch = state.channels.get(channel);
  if (!ch) return;
  if (!ch.users.find(u => u.nickname === nickname)) {
    ch.users = [...ch.users, { nickname, role, isOnline: true }];
    state.channels = new Map(state.channels);
    emit();
  }
}

export function removeUserFromChannel(channel: string, nickname: string) {
  const ch = state.channels.get(channel);
  if (!ch) return;
  ch.users = ch.users.filter(u => u.nickname !== nickname);
  state.channels = new Map(state.channels);
  emit();
}

export function setChannelList(list: IRCState["channelList"]) {
  state.channelList = list;
  emit();
}

// PM Sessions
export function openPMSession(nickname: string) {
  if (!state.pmSessions.has(nickname)) {
    state.pmSessions = new Map(state.pmSessions);
    state.pmSessions.set(nickname, { nickname, messages: [], isOpen: true, sessionActive: true, unread: 0 });
  } else {
    const pm = state.pmSessions.get(nickname)!;
    pm.isOpen = true;
    pm.unread = 0;
    state.pmSessions = new Map(state.pmSessions);
  }
  state.activePM = nickname;
  state.activeView = "pm";
  state.activeChannel = null;
  emit();
}

export function closePMSession(nickname: string) {
  state.pmSessions = new Map(state.pmSessions);
  state.pmSessions.delete(nickname);
  if (state.activePM === nickname) {
    state.activePM = null;
    const keys = [...state.channels.keys()];
    if (keys.length > 0) {
      state.activeChannel = keys[0];
      state.activeView = "channel";
    } else {
      state.activeView = "server";
    }
  }
  emit();
}

export function addPMMessage(nickname: string, msg: ChatMessage) {
  if (!state.pmSessions.has(nickname)) {
    state.pmSessions = new Map(state.pmSessions);
    state.pmSessions.set(nickname, { nickname, messages: [], isOpen: false, sessionActive: true, unread: 0 });
  }
  const pm = state.pmSessions.get(nickname)!;
  pm.messages = [...pm.messages, msg];
  if (state.activePM !== nickname || state.activeView !== "pm") {
    pm.unread++;
  }
  state.pmSessions = new Map(state.pmSessions);
  emit();
}

export function markPMSessionClosed(nickname: string) {
  const pm = state.pmSessions.get(nickname);
  if (pm) {
    pm.sessionActive = false;
    pm.messages = [...pm.messages, {
      id: genId(),
      nickname: "*",
      message: `${nickname} closed the chat. All messages have expired.`,
      type: "info",
      timestamp: new Date().toISOString(),
    }];
    state.pmSessions = new Map(state.pmSessions);
    emit();
  }
}

export function setTheme(theme: "dark" | "light") {
  state.theme = theme;
  localStorage.setItem("mircoin-theme", theme);
  emit();
}

export function setActiveView(view: IRCState["activeView"]) {
  state.activeView = view;
  if (view === "server") {
    state.activeChannel = null;
    state.activePM = null;
  }
  emit();
}

export function addOnlineUser(nickname: string) {
  state.onlineUsers = new Set(state.onlineUsers);
  state.onlineUsers.add(nickname);
  // Update user online status in channels
  state.channels = new Map(state.channels);
  for (const [, ch] of state.channels) {
    const u = ch.users.find(u => u.nickname === nickname);
    if (u) u.isOnline = true;
  }
  emit();
}

export function removeOnlineUser(nickname: string) {
  state.onlineUsers = new Set(state.onlineUsers);
  state.onlineUsers.delete(nickname);
  state.channels = new Map(state.channels);
  for (const [, ch] of state.channels) {
    const u = ch.users.find(u => u.nickname === nickname);
    if (u) u.isOnline = false;
  }
  emit();
}

export function nickChanged(oldNick: string, newNick: string) {
  // Update in channels
  state.channels = new Map(state.channels);
  for (const [, ch] of state.channels) {
    const u = ch.users.find(u => u.nickname === oldNick);
    if (u) u.nickname = newNick;
  }
  // Update PM sessions
  const pm = state.pmSessions.get(oldNick);
  if (pm) {
    state.pmSessions = new Map(state.pmSessions);
    state.pmSessions.delete(oldNick);
    pm.nickname = newNick;
    state.pmSessions.set(newNick, pm);
    if (state.activePM === oldNick) state.activePM = newNick;
  }
  // Update online users
  if (state.onlineUsers.has(oldNick)) {
    state.onlineUsers = new Set(state.onlineUsers);
    state.onlineUsers.delete(oldNick);
    state.onlineUsers.add(newNick);
  }
  emit();
}
