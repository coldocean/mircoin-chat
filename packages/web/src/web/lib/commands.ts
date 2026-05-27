import type { WSClientMessage } from "../../api/ws-types";
import * as store from "./irc-store";

export interface ParsedCommand {
  wsMessage?: WSClientMessage;
  localAction?: () => void;
  error?: string;
}

export function parseCommand(input: string): ParsedCommand {
  if (!input.startsWith("/")) {
    // Regular message to active channel or PM
    const s = store.getState();
    if (s.activeView === "channel" && s.activeChannel) {
      return { wsMessage: { type: "msg", target: s.activeChannel, message: input } };
    }
    if (s.activeView === "pm" && s.activePM) {
      return { wsMessage: { type: "pm_encrypted", target: s.activePM, encrypted: input, iv: "" } };
    }
    return { error: "No active channel or PM to send to" };
  }

  const parts = input.slice(1).split(" ");
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case "register":
      if (args.length < 2) return { error: "Usage: /register <nickname> <password>" };
      return { wsMessage: { type: "register", nickname: args[0], password: args.slice(1).join(" ") } };

    case "identify":
    case "id":
      if (args.length < 2) return { error: "Usage: /identify <nickname> <password>" };
      return { wsMessage: { type: "identify", nickname: args[0], password: args.slice(1).join(" ") } };

    case "nick":
      if (args.length < 1) return { error: "Usage: /nick <newnick>" };
      return { wsMessage: { type: "nick", newNick: args[0] } };

    case "join":
    case "j":
      if (args.length < 1) return { error: "Usage: /join #channel [password]" };
      return { wsMessage: { type: "join", channel: args[0], password: args[1] } };

    case "part":
    case "leave":
      {
        const s = store.getState();
        const ch = args[0] || s.activeChannel;
        if (!ch) return { error: "Usage: /part #channel [reason]" };
        return { wsMessage: { type: "part", channel: ch, reason: args.slice(1).join(" ") || undefined } };
      }

    case "msg":
    case "privmsg":
    case "pm":
      if (args.length < 2) return { error: "Usage: /msg <nick|#channel> <message>" };
      {
        const target = args[0];
        const message = args.slice(1).join(" ");
        if (target.startsWith("#")) {
          return { wsMessage: { type: "msg", target, message } };
        }
        // Open PM session and send
        return {
          localAction: () => store.openPMSession(target),
          wsMessage: { type: "pm_encrypted", target, encrypted: message, iv: "" },
        };
      }

    case "me":
      {
        const s = store.getState();
        if (args.length < 1) return { error: "Usage: /me <action>" };
        if (s.activeView === "channel" && s.activeChannel) {
          return { wsMessage: { type: "action", target: s.activeChannel, message: args.join(" ") } };
        }
        return { error: "Use /me in a channel" };
      }

    case "notice":
      if (args.length < 2) return { error: "Usage: /notice <nick|#channel> <message>" };
      return { wsMessage: { type: "notice", target: args[0], message: args.slice(1).join(" ") } };

    case "topic":
      {
        const s = store.getState();
        const channel = args[0]?.startsWith("#") ? args[0] : s.activeChannel;
        const topicParts = args[0]?.startsWith("#") ? args.slice(1) : args;
        if (!channel) return { error: "Usage: /topic [#channel] <topic>" };
        return { wsMessage: { type: "topic", channel, topic: topicParts.join(" ") } };
      }

    case "kick":
      {
        const s = store.getState();
        if (args.length < 1) return { error: "Usage: /kick [#channel] <nickname> [reason]" };
        let ch: string, nick: string, reason: string | undefined;
        if (args[0].startsWith("#")) {
          ch = args[0]; nick = args[1]; reason = args.slice(2).join(" ") || undefined;
        } else {
          ch = s.activeChannel || ""; nick = args[0]; reason = args.slice(1).join(" ") || undefined;
        }
        if (!ch) return { error: "No channel specified" };
        return { wsMessage: { type: "kick", channel: ch, nickname: nick, reason } };
      }

    case "ban":
      {
        const s = store.getState();
        if (args.length < 1) return { error: "Usage: /ban [#channel] <nickname> [reason]" };
        let ch: string, nick: string, reason: string | undefined;
        if (args[0].startsWith("#")) {
          ch = args[0]; nick = args[1]; reason = args.slice(2).join(" ") || undefined;
        } else {
          ch = s.activeChannel || ""; nick = args[0]; reason = args.slice(1).join(" ") || undefined;
        }
        if (!ch) return { error: "No channel specified" };
        return { wsMessage: { type: "ban", channel: ch, nickname: nick, reason } };
      }

    case "unban":
      {
        const s = store.getState();
        if (args.length < 1) return { error: "Usage: /unban [#channel] <nickname>" };
        let ch: string, nick: string;
        if (args[0].startsWith("#")) {
          ch = args[0]; nick = args[1];
        } else {
          ch = s.activeChannel || ""; nick = args[0];
        }
        if (!ch) return { error: "No channel specified" };
        return { wsMessage: { type: "unban", channel: ch, nickname: nick } };
      }

    case "mode":
      {
        const s = store.getState();
        if (args.length < 1) return { error: "Usage: /mode [#channel] <mode> [param]" };
        let ch: string, mode: string, param: string | undefined;
        if (args[0].startsWith("#")) {
          ch = args[0]; mode = args[1]; param = args[2];
        } else {
          ch = s.activeChannel || ""; mode = args[0]; param = args[1];
        }
        if (!ch) return { error: "No channel specified" };
        return { wsMessage: { type: "mode", channel: ch, mode, param } };
      }

    case "op":
      {
        const s = store.getState();
        const ch = s.activeChannel;
        if (!ch || args.length < 1) return { error: "Usage: /op <nickname> (in a channel)" };
        return { wsMessage: { type: "op", channel: ch, nickname: args[0] } };
      }

    case "deop":
      {
        const s = store.getState();
        const ch = s.activeChannel;
        if (!ch || args.length < 1) return { error: "Usage: /deop <nickname>" };
        return { wsMessage: { type: "deop", channel: ch, nickname: args[0] } };
      }

    case "voice":
      {
        const s = store.getState();
        const ch = s.activeChannel;
        if (!ch || args.length < 1) return { error: "Usage: /voice <nickname>" };
        return { wsMessage: { type: "voice", channel: ch, nickname: args[0] } };
      }

    case "devoice":
      {
        const s = store.getState();
        const ch = s.activeChannel;
        if (!ch || args.length < 1) return { error: "Usage: /devoice <nickname>" };
        return { wsMessage: { type: "devoice", channel: ch, nickname: args[0] } };
      }

    case "list":
      return { wsMessage: { type: "list" } };

    case "whois":
      if (args.length < 1) return { error: "Usage: /whois <nickname>" };
      return { wsMessage: { type: "whois", nickname: args[0] } };

    case "names":
    case "who":
      {
        const s = store.getState();
        const ch = args[0] || s.activeChannel;
        if (!ch) return { error: "Usage: /names [#channel]" };
        return { wsMessage: { type: "names", channel: ch } };
      }

    case "invite":
      {
        if (args.length < 2) return { error: "Usage: /invite <nickname> #channel" };
        return { wsMessage: { type: "invite", nickname: args[0], channel: args[1] } };
      }

    case "quit":
    case "disconnect":
      return { wsMessage: { type: "quit", reason: args.join(" ") || undefined } };

    case "query":
      // Open a PM session
      if (args.length < 1) return { error: "Usage: /query <nickname>" };
      return { localAction: () => store.openPMSession(args[0]) };

    case "close":
      // Close active PM session
      {
        const s = store.getState();
        if (s.activeView === "pm" && s.activePM) {
          return {
            wsMessage: { type: "pm_session_close", target: s.activePM },
            localAction: () => store.closePMSession(s.activePM!),
          };
        }
        return { error: "No active PM to close" };
      }

    // Server admin commands
    case "serverban":
    case "gban":
      if (args.length < 1) return { error: "Usage: /serverban <nickname> [reason]" };
      return { wsMessage: { type: "server_ban", nickname: args[0], reason: args.slice(1).join(" ") || undefined } };

    case "serverunban":
    case "gunban":
      if (args.length < 1) return { error: "Usage: /serverunban <nickname>" };
      return { wsMessage: { type: "server_unban", nickname: args[0] } };

    case "setsuperadmin":
    case "ssa":
      if (args.length < 1) return { error: "Usage: /setsuperadmin <nickname>" };
      return { wsMessage: { type: "set_superadmin", nickname: args[0] } };

    case "removesuperadmin":
    case "rsa":
      if (args.length < 1) return { error: "Usage: /removesuperadmin <nickname>" };
      return { wsMessage: { type: "remove_superadmin", nickname: args[0] } };

    case "hideme":
      {
        if (args.length < 1) return { error: "Usage: /hideme true|false" };
        const val = args[0].toLowerCase();
        if (val !== "true" && val !== "false") return { error: "Usage: /hideme true|false" };
        return { wsMessage: { type: "hideme", value: val === "true" } };
      }

    case "aboutme":
    case "bio":
      {
        const bioText = args.join(" ").trim();
        if (!bioText) return { error: "Usage: /aboutme <bio text> (max 100 chars)" };
        return { wsMessage: { type: "aboutme", bio: bioText.slice(0, 100) } };
      }

    case "clearaboutme":
    case "clearbio":
      return { wsMessage: { type: "aboutme", bio: "" } };

    case "clear":
    case "cls":
      return {
        localAction: () => {
          const s = store.getState();
          if (s.activeView === "channel" && s.activeChannel) {
            const ch = s.channels.get(s.activeChannel);
            if (ch) { ch.messages = []; store.setActiveChannel(s.activeChannel); }
          }
        },
      };

    case "help":
      return {
        localAction: () => {
          const lines = [
            "*** mIRCoin Chat Commands:",
            "*** Connection:",
            "***   /register <nick> <pass>     - Register a nickname",
            "***   /identify <nick> <pass>     - Login to registered nick",
            "***   /nick <newnick>             - Change nickname",
            "***   /quit [reason]              - Disconnect",
            "*** Channels:",
            "***   /join #channel [key]        - Join a channel",
            "***   /part [#channel] [reason]   - Leave a channel",
            "***   /list                       - List public channels",
            "***   /topic [#ch] <topic>        - Set channel topic",
            "***   /names [#channel]           - List users in channel",
            "***   /invite <nick> #channel     - Invite user to channel",
            "*** Messaging:",
            "***   /msg <target> <message>     - Send message to user/channel",
            "***   /me <action>                - Perform action",
            "***   /notice <target> <message>  - Send notice",
            "***   /query <nick>               - Open PM session",
            "***   /close                      - Close PM session",
            "*** Moderation:",
            "***   /kick [#ch] <nick> [reason] - Kick user",
            "***   /ban [#ch] <nick> [reason]  - Ban user",
            "***   /unban [#ch] <nick>         - Unban user",
            "***   /op <nick>                  - Give operator",
            "***   /deop <nick>                - Remove operator",
            "***   /voice <nick>               - Give voice",
            "***   /devoice <nick>             - Remove voice",
            "***   /mode [#ch] <mode> [param]  - Set channel mode",
            "***   /whois <nick>               - User info",
            "*** Server Admin:",
            "***   /serverban <nick> [reason]  - Server-wide ban",
            "***   /serverunban <nick>         - Remove server ban",
            "***   /setsuperadmin <nick>       - Promote to superadmin",
            "***   /removesuperadmin <nick>    - Demote superadmin",
            "***   /hideme true|false          - Hide/show your role badge",
            "*** Other:",
            "***   /aboutme <bio>              - Set your bio (shown in /whois)",
            "***   /clearaboutme               - Clear your bio",
            "***   /clear                      - Clear current view",
            "***   /help                       - Show this help",
          ];
          for (const l of lines) {
            store.addServerMessage(l, "info");
          }
        },
      };

    default:
      return { error: `Unknown command: /${cmd}. Type /help for a list of commands.` };
  }
}
