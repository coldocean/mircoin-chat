import { useIRCStore } from "../lib/irc-store";
import { openPMSession } from "../lib/irc-store";
import { sendWs } from "../hooks/use-irc";
import { Crown, Shield, Mic, User, Circle } from "lucide-react";
import { useState } from "react";

function getRoleIcon(role: string) {
  switch (role) {
    case "owner": return <Crown size={10} className="text-yellow-500" />;
    case "op": return <Shield size={10} className="text-green-500" />;
    case "halfop": return <Shield size={10} className="text-blue-400" />;
    case "voice": return <Mic size={10} className="text-purple-400" />;
    default: return null;
  }
}

function getRolePrefix(role: string) {
  switch (role) {
    case "owner": return "~";
    case "op": return "@";
    case "halfop": return "%";
    case "voice": return "+";
    default: return "";
  }
}

export function UserPanel() {
  const activeChannel = useIRCStore((s) => s.activeChannel);
  const activeView = useIRCStore((s) => s.activeView);
  const channels = useIRCStore((s) => s.channels);
  const activePM = useIRCStore((s) => s.activePM);
  const onlineUsers = useIRCStore((s) => s.onlineUsers);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nick: string } | null>(null);

  if (activeView === "pm") {
    return (
      <div className="flex flex-col h-full bg-card border-l border-border">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-[11px] font-sans font-semibold text-muted-foreground uppercase tracking-wider">
            Private Message
          </div>
        </div>
        <div className="p-3 text-xs text-muted-foreground font-sans">
          <div className="flex items-center gap-2 mb-2">
            <Circle size={8} className={onlineUsers.has(activePM || "") ? "fill-green-500 text-green-500" : "fill-gray-500 text-gray-500"} />
            <span className="font-semibold text-foreground">{activePM}</span>
          </div>
          <div className="text-[10px] mt-2">
            {onlineUsers.has(activePM || "") ? "Online" : "Offline"}
          </div>
          <div className="text-[10px] mt-3 p-2 bg-accent/50 rounded border border-border">
            Messages are ephemeral. When you close this chat, all messages expire.
          </div>
        </div>
      </div>
    );
  }

  if (activeView !== "channel" || !activeChannel) {
    return (
      <div className="flex flex-col h-full bg-card border-l border-border">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-[11px] font-sans font-semibold text-muted-foreground uppercase tracking-wider">
            Users
          </div>
        </div>
        <div className="p-3 text-xs text-muted-foreground font-sans">
          Join a channel to see users
        </div>
      </div>
    );
  }

  const channel = channels.get(activeChannel);
  if (!channel) return null;

  // Sort users: owners, ops, halfops, voiced, then regular. Online first.
  const roleOrder: Record<string, number> = { owner: 0, op: 1, halfop: 2, voice: 3, regular: 4 };
  const sorted = [...channel.users].sort((a, b) => {
    // Online first
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    const ra = roleOrder[a.role] ?? 4;
    const rb = roleOrder[b.role] ?? 4;
    if (ra !== rb) return ra - rb;
    return a.nickname.localeCompare(b.nickname);
  });

  const grouped = {
    ops: sorted.filter(u => u.role === "owner" || u.role === "op" || u.role === "halfop"),
    voiced: sorted.filter(u => u.role === "voice"),
    regular: sorted.filter(u => u.role === "regular"),
  };

  const handleContextMenu = (e: React.MouseEvent, nick: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nick });
  };

  const closeContext = () => setContextMenu(null);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border" onClick={closeContext}>
      <div className="px-3 py-2 border-b border-border">
        <div className="text-[11px] font-sans font-semibold text-muted-foreground uppercase tracking-wider">
          Users ({channel.users.length})
        </div>
      </div>

      <div className="flex-1 overflow-y-auto text-[12px]">
        {grouped.ops.length > 0 && (
          <UserGroup label="Operators" users={grouped.ops} onContextMenu={handleContextMenu} onlineUsers={onlineUsers} />
        )}
        {grouped.voiced.length > 0 && (
          <UserGroup label="Voiced" users={grouped.voiced} onContextMenu={handleContextMenu} onlineUsers={onlineUsers} />
        )}
        {grouped.regular.length > 0 && (
          <UserGroup label="Users" users={grouped.regular} onContextMenu={handleContextMenu} onlineUsers={onlineUsers} />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-card border border-border rounded shadow-lg py-1 z-50 text-[12px] font-sans"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="px-3 py-1 hover:bg-accent cursor-pointer"
            onClick={() => { openPMSession(contextMenu.nick); closeContext(); }}
          >
            Message
          </div>
          <div
            className="px-3 py-1 hover:bg-accent cursor-pointer"
            onClick={() => { sendWs({ type: "whois", nickname: contextMenu.nick }); closeContext(); }}
          >
            Whois
          </div>
        </div>
      )}
    </div>
  );
}

function UserGroup({ label, users, onContextMenu, onlineUsers }: {
  label: string;
  users: { nickname: string; role: string; isOnline: boolean }[];
  onContextMenu: (e: React.MouseEvent, nick: string) => void;
  onlineUsers: Set<string>;
}) {
  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[10px] text-muted-foreground font-sans font-semibold uppercase tracking-wider">
        {label} ({users.length})
      </div>
      {users.map((u) => (
        <div
          key={u.nickname}
          className="flex items-center gap-1 px-3 py-0.5 hover:bg-accent/50 cursor-pointer transition-colors"
          onContextMenu={(e) => onContextMenu(e, u.nickname)}
          onDoubleClick={() => openPMSession(u.nickname)}
        >
          <Circle
            size={6}
            className={`shrink-0 ${u.isOnline || onlineUsers.has(u.nickname) ? "fill-green-500 text-green-500" : "fill-gray-600 text-gray-600"}`}
          />
          {getRoleIcon(u.role)}
          <span className={`truncate ${!u.isOnline && !onlineUsers.has(u.nickname) ? "opacity-50" : ""}`}>
            {getRolePrefix(u.role)}{u.nickname}
          </span>
        </div>
      ))}
    </div>
  );
}
