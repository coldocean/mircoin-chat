import { useEffect, useRef, useCallback } from "react";

export interface CommandDef {
  command: string;
  aliases?: string[];
  usage: string;
  description: string;
  category: "connection" | "channels" | "messaging" | "moderation" | "admin" | "other";
}

export const COMMANDS: CommandDef[] = [
  // Connection
  { command: "register", usage: "/register <nick> <password>", description: "Register a nickname", category: "connection" },
  { command: "identify", aliases: ["id"], usage: "/identify <nick> <password>", description: "Login to registered nick", category: "connection" },
  { command: "nick", usage: "/nick <newnick>", description: "Change nickname", category: "connection" },
  { command: "quit", aliases: ["disconnect"], usage: "/quit [reason]", description: "Disconnect from server", category: "connection" },
  // Channels
  { command: "join", aliases: ["j"], usage: "/join #channel [key]", description: "Join a channel", category: "channels" },
  { command: "part", aliases: ["leave"], usage: "/part [#channel] [reason]", description: "Leave a channel", category: "channels" },
  { command: "list", usage: "/list", description: "List public channels", category: "channels" },
  { command: "topic", usage: "/topic [#channel] <topic>", description: "Set/view channel topic", category: "channels" },
  { command: "names", aliases: ["who"], usage: "/names [#channel]", description: "List users in channel", category: "channels" },
  { command: "invite", usage: "/invite <nick> #channel", description: "Invite user to channel", category: "channels" },
  // Messaging
  { command: "msg", aliases: ["privmsg", "pm"], usage: "/msg <target> <message>", description: "Send message to user/channel", category: "messaging" },
  { command: "me", usage: "/me <action>", description: "Perform an action", category: "messaging" },
  { command: "notice", usage: "/notice <target> <message>", description: "Send a notice", category: "messaging" },
  { command: "query", usage: "/query <nick>", description: "Open PM session", category: "messaging" },
  { command: "close", usage: "/close", description: "Close active PM session", category: "messaging" },
  // Moderation
  { command: "kick", usage: "/kick [#ch] <nick> [reason]", description: "Kick user from channel", category: "moderation" },
  { command: "ban", usage: "/ban [#ch] <nick> [reason]", description: "Ban user from channel", category: "moderation" },
  { command: "unban", usage: "/unban [#ch] <nick>", description: "Unban user from channel", category: "moderation" },
  { command: "op", usage: "/op <nick>", description: "Give operator status", category: "moderation" },
  { command: "deop", usage: "/deop <nick>", description: "Remove operator status", category: "moderation" },
  { command: "voice", usage: "/voice <nick>", description: "Give voice status", category: "moderation" },
  { command: "devoice", usage: "/devoice <nick>", description: "Remove voice status", category: "moderation" },
  { command: "mode", usage: "/mode [#ch] <mode> [param]", description: "Set channel mode", category: "moderation" },
  { command: "whois", usage: "/whois <nick>", description: "Show user info", category: "moderation" },
  // Admin
  { command: "serverban", aliases: ["gban"], usage: "/serverban <nick> [reason]", description: "Server-wide ban", category: "admin" },
  { command: "serverunban", aliases: ["gunban"], usage: "/serverunban <nick>", description: "Remove server ban", category: "admin" },
  { command: "setsuperadmin", aliases: ["ssa"], usage: "/setsuperadmin <nick>", description: "Promote to superadmin", category: "admin" },
  { command: "removesuperadmin", aliases: ["rsa"], usage: "/removesuperadmin <nick>", description: "Demote superadmin", category: "admin" },
  // Other
  { command: "clear", aliases: ["cls"], usage: "/clear", description: "Clear current view", category: "other" },
  { command: "help", usage: "/help", description: "Show all commands", category: "other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  connection: "text-green-400",
  channels: "text-blue-400",
  messaging: "text-purple-400",
  moderation: "text-yellow-400",
  admin: "text-red-400",
  other: "text-muted-foreground",
};

interface CommandPaletteProps {
  input: string;
  selectedIndex: number;
  onSelect: (command: string) => void;
  visible: boolean;
}

export function getFilteredCommands(input: string): CommandDef[] {
  if (!input.startsWith("/") || input.includes(" ")) return [];
  const query = input.slice(1).toLowerCase();
  if (!query) return COMMANDS;
  return COMMANDS.filter(
    (cmd) =>
      cmd.command.startsWith(query) ||
      cmd.aliases?.some((a) => a.startsWith(query))
  );
}

export function CommandPalette({ input, selectedIndex, onSelect, visible }: CommandPaletteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const filtered = getFilteredCommands(input);

  // Scroll selected into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-2 max-h-[280px] overflow-y-auto bg-card border border-border rounded-lg shadow-2xl backdrop-blur-sm z-50 scrollbar-thin"
    >
      <div className="py-1">
        {filtered.map((cmd, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={cmd.command}
              ref={isSelected ? selectedRef : undefined}
              className={`flex items-center gap-3 px-3 py-1.5 cursor-pointer transition-colors ${
                isSelected
                  ? "bg-primary/15 text-foreground"
                  : "hover:bg-secondary/50 text-muted-foreground"
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // Don't blur input
                onSelect(cmd.command);
              }}
            >
              <span className={`font-mono text-[13px] font-semibold min-w-[140px] ${isSelected ? "text-primary" : CATEGORY_COLORS[cmd.category]}`}>
                /{cmd.command}
              </span>
              <span className="text-[12px] text-muted-foreground truncate flex-1">
                {cmd.description}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground/50 hidden sm:block">
                {cmd.usage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
