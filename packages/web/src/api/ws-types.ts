// WebSocket message types for mIRCoin Chat

export type WSClientMessage =
  | { type: "register"; nickname: string; password: string }
  | { type: "identify"; nickname: string; password: string }
  | { type: "nick"; newNick: string }
  | { type: "join"; channel: string; password?: string }
  | { type: "part"; channel: string; reason?: string }
  | { type: "msg"; target: string; message: string } // channel or nick
  | { type: "privmsg"; target: string; message: string }
  | { type: "action"; target: string; message: string } // /me
  | { type: "notice"; target: string; message: string }
  | { type: "topic"; channel: string; topic: string }
  | { type: "kick"; channel: string; nickname: string; reason?: string }
  | { type: "ban"; channel: string; nickname: string; reason?: string }
  | { type: "unban"; channel: string; nickname: string }
  | { type: "mode"; channel: string; mode: string; param?: string }
  | { type: "list" }
  | { type: "whois"; nickname: string }
  | { type: "quit"; reason?: string }
  | { type: "names"; channel: string }
  | { type: "invite"; nickname: string; channel: string }
  | { type: "ping" }
  // PM encryption key exchange
  | { type: "pm_key_exchange"; target: string; publicKey: string }
  | { type: "pm_key_accept"; target: string; publicKey: string }
  | { type: "pm_encrypted"; target: string; encrypted: string; iv: string }
  | { type: "pm_session_close"; target: string }
  | { type: "pm_photo"; target: string; data: string; iv: string } // base64 encrypted jpg
  // Channel op commands
  | { type: "op"; channel: string; nickname: string }
  | { type: "deop"; channel: string; nickname: string }
  | { type: "voice"; channel: string; nickname: string }
  | { type: "devoice"; channel: string; nickname: string }
  // Server admin commands (owner/superadmin only)
  | { type: "server_ban"; nickname: string; reason?: string }
  | { type: "server_unban"; nickname: string }
  | { type: "set_superadmin"; nickname: string }
  | { type: "remove_superadmin"; nickname: string }
  | { type: "hideme"; value: boolean };

export type WSServerMessage =
  | { type: "welcome"; nickname: string; motd: string[]; serverInfo: { name: string; version: string; users: number; channels: number } }
  | { type: "error"; code: string; message: string }
  | { type: "info"; message: string }
  | { type: "registered"; nickname: string }
  | { type: "identified"; nickname: string; role: string; hiddenRole?: boolean }
  | { type: "nick_changed"; oldNick: string; newNick: string }
  | { type: "joined"; channel: string; nickname: string; users: ChannelUserInfo[] }
  | { type: "parted"; channel: string; nickname: string; reason?: string }
  | { type: "channel_msg"; channel: string; nickname: string; message: string; timestamp: string }
  | { type: "channel_action"; channel: string; nickname: string; message: string; timestamp: string }
  | { type: "channel_notice"; channel: string; nickname: string; message: string; timestamp: string }
  | { type: "topic_changed"; channel: string; nickname: string; topic: string }
  | { type: "kicked"; channel: string; nickname: string; by: string; reason?: string }
  | { type: "banned"; channel: string; nickname: string; by: string; reason?: string }
  | { type: "unbanned"; channel: string; nickname: string; by: string }
  | { type: "mode_changed"; channel: string; nickname: string; mode: string; param?: string }
  | { type: "channel_list"; channels: ChannelListItem[] }
  | { type: "whois_reply"; nickname: string; info: WhoisInfo }
  | { type: "names_reply"; channel: string; users: ChannelUserInfo[] }
  | { type: "user_quit"; nickname: string; reason?: string }
  | { type: "user_online"; nickname: string }
  | { type: "user_offline"; nickname: string }
  | { type: "invited"; channel: string; by: string }
  | { type: "pong"; timestamp: number }
  // PM relay
  | { type: "pm_key_exchange"; from: string; publicKey: string }
  | { type: "pm_key_accept"; from: string; publicKey: string }
  | { type: "pm_encrypted"; from: string; encrypted: string; iv: string }
  | { type: "pm_session_close"; from: string }
  | { type: "pm_photo"; from: string; data: string; iv: string }
  | { type: "pm_user_offline"; nickname: string }
  | { type: "pm_user_online"; nickname: string }
  // History for channels
  | { type: "channel_history"; channel: string; messages: { nickname: string; message: string; msgType: string; timestamp: string }[] }
  // Connection info
  | { type: "connection_info"; ip: string; hostname: string; timestamp: string };

export interface ChannelUserInfo {
  nickname: string;
  role: "owner" | "op" | "halfop" | "voice" | "regular";
  isOnline: boolean;
}

export interface ChannelListItem {
  name: string;
  topic: string;
  userCount: number;
  isPrivate: boolean;
}

export interface WhoisInfo {
  nickname: string;
  role: string;
  channels: string[];
  registeredAt: string;
  lastSeen: string;
  ip?: string; // only for admins
  idle: number;
  isOnline: boolean;
}
