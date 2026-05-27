import { useEffect, useRef, useCallback } from "react";
import * as store from "../lib/irc-store";
import type { WSClientMessage, WSServerMessage } from "../../api/ws-types";

let wsInstance: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let pongTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let isIntentionalClose = false;
let mountCount = 0; // Track mounts to handle StrictMode double-mount

// Persist credentials for auto re-identify on reconnect
let savedNick: string | null = null;
let savedPassword: string | null = null;

const PING_INTERVAL = 20_000;   // send ping every 20s
const PONG_TIMEOUT = 10_000;    // expect pong within 10s
const RECONNECT_BASE = 1_000;   // start at 1s
const RECONNECT_MAX = 15_000;   // cap at 15s

function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function sendWs(msg: WSClientMessage) {
  if (wsInstance?.readyState === WebSocket.OPEN) {
    wsInstance.send(JSON.stringify(msg));
  }
}

function clearTimers() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (pongTimeout) { clearTimeout(pongTimeout); pongTimeout = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function startHeartbeat() {
  // Clear any existing heartbeat
  if (pingInterval) clearInterval(pingInterval);
  if (pongTimeout) clearTimeout(pongTimeout);

  pingInterval = setInterval(() => {
    if (wsInstance?.readyState === WebSocket.OPEN) {
      sendWs({ type: "ping" });

      // If no pong within timeout, assume dead connection — force reconnect
      pongTimeout = setTimeout(() => {
        console.warn("[IRC] Pong timeout — forcing reconnect");
        store.addServerMessage("*** Connection stale, reconnecting...", "error");
        if (wsInstance) {
          try { wsInstance.close(); } catch {}
        }
      }, PONG_TIMEOUT);
    }
  }, PING_INTERVAL);
}

function getReconnectDelay() {
  // Exponential backoff: 1s, 2s, 4s, 8s, 15s cap
  const delay = Math.min(RECONNECT_BASE * Math.pow(2, reconnectAttempts), RECONNECT_MAX);
  // Add small jitter
  return delay + Math.random() * 500;
}

function handleServerMsg(msg: WSServerMessage) {
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ts = new Date().toISOString();

  switch (msg.type) {
    case "connection_info":
      store.setIP(msg.ip);
      store.addServerMessage(`*** Connecting to mIRCoin Chat server...`, "server");
      store.addServerMessage(`*** Your IP address is ${msg.ip}`, "server");
      store.addServerMessage(`*** Connection established at ${new Date(msg.timestamp).toLocaleString()}`, "server");
      break;

    case "welcome":
      store.setConnected(true);
      store.setNickname(msg.nickname);
      store.addServerMessage(`*** Welcome to ${msg.serverInfo.name} v${msg.serverInfo.version}`, "server");
      store.addServerMessage(`*** There are ${msg.serverInfo.users} users on ${msg.serverInfo.channels} channels`, "server");
      store.addServerMessage(`*** Your nickname is ${msg.nickname}`, "server");
      store.addServerMessage("", "server");
      store.addServerMessage("*** Message of the Day:", "server");
      for (const line of msg.motd) {
        store.addServerMessage(line, "server");
      }
      store.addServerMessage("", "server");
      store.addServerMessage("*** End of /MOTD", "server");

      // Auto re-identify if we have saved credentials (reconnect scenario)
      if (savedNick && savedPassword) {
        store.addServerMessage("*** Auto-identifying...", "info");
        sendWs({ type: "identify", nickname: savedNick, password: savedPassword });
      } else {
        store.addServerMessage("*** Use /register <nick> <password> to register, or /identify <nick> <password> to login", "info");
      }
      break;

    case "error":
      store.addServerMessage(`*** Error [${msg.code}]: ${msg.message}`, "error");
      const s = store.getState();
      if (s.activeView === "channel" && s.activeChannel) {
        store.addChannelMessage(s.activeChannel, { id: genId(), nickname: "*", message: `Error: ${msg.message}`, type: "error", timestamp: ts });
      }
      // If identify fails on reconnect, clear saved creds
      if (msg.code === "WRONG_PASSWORD" || msg.code === "NOT_REGISTERED") {
        savedNick = null;
        savedPassword = null;
      }
      break;

    case "info":
      store.addServerMessage(`*** ${msg.message}`, "info");
      break;

    case "registered":
      store.addServerMessage(`*** Nickname "${msg.nickname}" registered successfully!`, "server");
      break;

    case "identified":
      store.setIdentified(msg.nickname, msg.role, msg.hiddenRole);
      store.addServerMessage(`*** You are now identified as ${msg.nickname} (${msg.role})${msg.hiddenRole ? " [hidden]" : ""}`, "server");

      // Auto-rejoin channels we were in before disconnect
      const prevChannels = store.getState().channels;
      if (prevChannels.size > 0) {
        store.addServerMessage("*** Rejoining channels...", "info");
        for (const [name] of prevChannels) {
          sendWs({ type: "join", channel: name });
        }
      }
      break;

    case "nick_changed":
      store.nickChanged(msg.oldNick, msg.newNick);
      store.addServerMessage(`*** ${msg.oldNick} is now known as ${msg.newNick}`, "server");
      for (const [name, ch] of store.getState().channels) {
        if (ch.users.find(u => u.nickname === msg.newNick || u.nickname === msg.oldNick)) {
          store.addChannelMessage(name, {
            id: genId(), nickname: "*",
            message: `${msg.oldNick} is now known as ${msg.newNick}`,
            type: "info", timestamp: ts,
          });
        }
      }
      break;

    case "joined": {
      const myNick = store.getState().nickname;
      if (msg.nickname === myNick) {
        store.addChannel(msg.channel, msg.users);
        store.addServerMessage(`*** You have joined ${msg.channel}`, "server");
      } else {
        store.addUserToChannel(msg.channel, msg.nickname);
        store.addChannelMessage(msg.channel, {
          id: genId(), nickname: msg.nickname,
          message: `${msg.nickname} has joined ${msg.channel}`,
          type: "join", timestamp: ts,
        });
        if (msg.users) store.updateChannelUsers(msg.channel, msg.users);
      }
      break;
    }

    case "parted": {
      const myNick2 = store.getState().nickname;
      if (msg.nickname === myNick2) {
        store.removeChannel(msg.channel);
        store.addServerMessage(`*** You have left ${msg.channel}${msg.reason ? ` (${msg.reason})` : ""}`, "server");
      } else {
        store.removeUserFromChannel(msg.channel, msg.nickname);
        store.addChannelMessage(msg.channel, {
          id: genId(), nickname: msg.nickname,
          message: `${msg.nickname} has left ${msg.channel}${msg.reason ? ` (${msg.reason})` : ""}`,
          type: "part", timestamp: ts,
        });
      }
      break;
    }

    case "channel_msg":
      store.addChannelMessage(msg.channel, {
        id: genId(), nickname: msg.nickname, message: msg.message,
        type: "message", timestamp: msg.timestamp,
      });
      break;

    case "channel_action":
      store.addChannelMessage(msg.channel, {
        id: genId(), nickname: msg.nickname, message: msg.message,
        type: "action", timestamp: msg.timestamp,
      });
      break;

    case "channel_notice":
      if (msg.channel) {
        store.addChannelMessage(msg.channel, {
          id: genId(), nickname: msg.nickname, message: msg.message,
          type: "notice", timestamp: msg.timestamp,
        });
      } else {
        store.addServerMessage(`-${msg.nickname}- ${msg.message}`, "notice");
      }
      break;

    case "topic_changed":
      store.setChannelTopic(msg.channel, msg.topic);
      store.addChannelMessage(msg.channel, {
        id: genId(), nickname: msg.nickname,
        message: `${msg.nickname} changed the topic to: ${msg.topic}`,
        type: "topic", timestamp: ts,
      });
      break;

    case "kicked":
      if (msg.nickname === store.getState().nickname) {
        store.removeChannel(msg.channel);
        store.addServerMessage(`*** You have been kicked from ${msg.channel} by ${msg.by}${msg.reason ? ` (${msg.reason})` : ""}`, "error");
      } else {
        store.removeUserFromChannel(msg.channel, msg.nickname);
        store.addChannelMessage(msg.channel, {
          id: genId(), nickname: msg.by,
          message: `${msg.by} kicked ${msg.nickname}${msg.reason ? ` (${msg.reason})` : ""}`,
          type: "kick", timestamp: ts,
        });
      }
      break;

    case "banned":
      store.addChannelMessage(msg.channel, {
        id: genId(), nickname: msg.by,
        message: `${msg.by} banned ${msg.nickname}${msg.reason ? ` (${msg.reason})` : ""}`,
        type: "kick", timestamp: ts,
      });
      break;

    case "unbanned":
      store.addChannelMessage(msg.channel, {
        id: genId(), nickname: msg.by,
        message: `${msg.by} unbanned ${msg.nickname}`,
        type: "info", timestamp: ts,
      });
      break;

    case "mode_changed":
      store.addChannelMessage(msg.channel, {
        id: genId(), nickname: msg.nickname,
        message: `${msg.nickname} sets mode ${msg.mode}${msg.param ? ` ${msg.param}` : ""}`,
        type: "mode", timestamp: ts,
      });
      sendWs({ type: "names", channel: msg.channel });
      break;

    case "channel_list":
      store.setChannelList(msg.channels);
      store.addServerMessage("*** Channel list:", "server");
      if (msg.channels.length === 0) {
        store.addServerMessage("*** No public channels found. Create one with /join #channelname", "info");
      }
      for (const ch of msg.channels) {
        store.addServerMessage(`***   ${ch.name} (${ch.userCount} users) - ${ch.topic || "No topic"}`, "server");
      }
      store.addServerMessage("*** End of /LIST", "server");
      break;

    case "whois_reply":
      store.addServerMessage(`*** WHOIS ${msg.info.nickname}:`, "server");
      store.addServerMessage(`***   Role: ${msg.info.role}`, "server");
      store.addServerMessage(`***   Online: ${msg.info.isOnline ? "Yes" : "No"}`, "server");
      store.addServerMessage(`***   Channels: ${msg.info.channels.join(", ") || "None"}`, "server");
      store.addServerMessage(`***   Registered: ${new Date(msg.info.registeredAt).toLocaleString()}`, "server");
      store.addServerMessage(`***   Last seen: ${new Date(msg.info.lastSeen).toLocaleString()}`, "server");
      if (msg.info.ip) store.addServerMessage(`***   IP: ${msg.info.ip}`, "server");
      if (msg.info.idle >= 0) store.addServerMessage(`***   Idle: ${msg.info.idle}s`, "server");
      store.addServerMessage(`*** End of /WHOIS`, "server");
      break;

    case "names_reply":
      store.updateChannelUsers(msg.channel, msg.users);
      break;

    case "user_quit":
      store.removeOnlineUser(msg.nickname);
      for (const [name, ch] of store.getState().channels) {
        if (ch.users.find(u => u.nickname === msg.nickname)) {
          store.removeUserFromChannel(name, msg.nickname);
          store.addChannelMessage(name, {
            id: genId(), nickname: msg.nickname,
            message: `${msg.nickname} has quit${msg.reason ? ` (${msg.reason})` : ""}`,
            type: "quit", timestamp: ts,
          });
        }
      }
      break;

    case "user_online":
      store.addOnlineUser(msg.nickname);
      break;

    case "user_offline":
      store.removeOnlineUser(msg.nickname);
      break;

    case "invited":
      store.addServerMessage(`*** ${msg.by} has invited you to ${msg.channel}`, "info");
      break;

    case "channel_history":
      for (const m of msg.messages) {
        store.addChannelMessage(msg.channel, {
          id: genId(), nickname: m.nickname, message: m.message,
          type: m.msgType as any, timestamp: m.timestamp, isHistory: true,
        });
      }
      break;

    // PM relay
    case "pm_encrypted":
      store.addPMMessage(msg.from, {
        id: genId(), nickname: msg.from, message: msg.encrypted,
        type: "pm", timestamp: ts,
      });
      break;

    case "pm_session_close":
      store.markPMSessionClosed(msg.from);
      break;

    case "pm_user_offline":
      store.addServerMessage(`*** ${msg.nickname} is not online`, "error");
      break;

    case "pm_user_online":
      store.addServerMessage(`*** ${msg.nickname} is now online`, "info");
      break;

    case "pm_photo":
      store.addPMMessage(msg.from, {
        id: genId(), nickname: msg.from, message: msg.data,
        type: "pm_photo", timestamp: ts,
      });
      break;

    case "pong":
      // Clear pong timeout — connection is alive
      if (pongTimeout) { clearTimeout(pongTimeout); pongTimeout = null; }
      break;
  }
}

// Intercept identify/register to save credentials
function interceptAndSend(msg: WSClientMessage) {
  if (msg.type === "identify" || msg.type === "register") {
    savedNick = msg.nickname;
    savedPassword = msg.password;
  }
  sendWs(msg);
}

function connect() {
  if (wsInstance?.readyState === WebSocket.OPEN || wsInstance?.readyState === WebSocket.CONNECTING) return;

  isIntentionalClose = false;
  store.addServerMessage("*** Connecting to server...", "server");

  try {
    wsInstance = new WebSocket(getWsUrl());
  } catch (err) {
    store.addServerMessage("*** Failed to create WebSocket connection", "error");
    scheduleReconnect();
    return;
  }

  wsInstance.onopen = () => {
    store.setConnected(true);
    reconnectAttempts = 0; // reset backoff on successful connect
    clearTimers();
    startHeartbeat();
  };

  wsInstance.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as WSServerMessage;
      handleServerMsg(msg);
    } catch {}
  };

  wsInstance.onclose = (event) => {
    clearTimers();
    store.setConnected(false);

    if (isIntentionalClose) {
      store.addServerMessage("*** Disconnected from server", "server");
      return;
    }

    const reason = event.reason || "Connection lost";
    store.addServerMessage(`*** Disconnected from server (${event.code}: ${reason})`, "error");
    scheduleReconnect();
  };

  wsInstance.onerror = () => {
    store.addServerMessage("*** Connection error", "error");
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return; // already scheduled

  const delay = getReconnectDelay();
  reconnectAttempts++;

  store.addServerMessage(`*** Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})...`, "server");

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

// Handle page visibility — reconnect immediately when tab becomes visible
function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
      // Cancel any pending reconnect timer and connect NOW
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      reconnectAttempts = 0;
      store.addServerMessage("*** Tab active — reconnecting...", "server");
      connect();
    }
  }
}

// Handle network events
function handleOnline() {
  if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectAttempts = 0;
    store.addServerMessage("*** Network restored — reconnecting...", "server");
    connect();
  }
}

export function useIRC() {
  useEffect(() => {
    mountCount++;
    
    // Only connect if we don't already have an active connection
    if (!wsInstance || wsInstance.readyState === WebSocket.CLOSED) {
      isIntentionalClose = false;
      connect();
    }

    // Listen for tab visibility changes (mobile browsers suspend WS in background)
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // Listen for network online/offline
    window.addEventListener("online", handleOnline);

    return () => {
      mountCount--;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      
      // Only actually disconnect if no more mounted instances (handles StrictMode)
      // In StrictMode, React unmounts then immediately remounts — 
      // use setTimeout to let the remount happen first
      setTimeout(() => {
        if (mountCount === 0) {
          isIntentionalClose = true;
          clearTimers();
          if (wsInstance) {
            try { wsInstance.close(); } catch {}
            wsInstance = null;
          }
        }
      }, 100);
    };
  }, []);

  const send = useCallback((msg: WSClientMessage) => {
    interceptAndSend(msg);
  }, []);

  return { send };
}

// Export the intercepting version as sendWs so all callers get credential saving
export { interceptAndSend as sendWs };
