import { useIRCStore, setActiveChannel, setActiveView, openPMSession, type IRCState } from "../lib/irc-store";
import { Hash, MessageSquare, Server, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";

export function ChannelPanel() {
  const channels = useIRCStore((s) => s.channels);
  const pmSessions = useIRCStore((s) => s.pmSessions);
  const activeChannel = useIRCStore((s) => s.activeChannel);
  const activePM = useIRCStore((s) => s.activePM);
  const activeView = useIRCStore((s) => s.activeView);
  const nickname = useIRCStore((s) => s.nickname);
  const connected = useIRCStore((s) => s.connected);
  const role = useIRCStore((s) => s.role);
  const hiddenRole = useIRCStore((s) => s.hiddenRole);

  const [channelsOpen, setChannelsOpen] = useState(true);
  const [pmsOpen, setPmsOpen] = useState(true);

  return (
    <div className="flex flex-col h-full bg-card border-r border-border stripe-border-r select-none min-w-0 overflow-hidden panel-stripe">
      {/* Server header */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 border-b border-border cursor-pointer hover:bg-accent/50 transition-colors ${activeView === "server" ? "bg-accent" : ""}`}
        onClick={() => setActiveView("server")}
      >
        <Server size={14} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold font-sans truncate">mIRCoin Chat</div>
          <div className="text-[10px] text-muted-foreground font-sans">
            {connected ? (
              <span className="text-green-500">Connected</span>
            ) : (
              <span className="text-destructive">Disconnected</span>
            )}
            {nickname && <span className="ml-1">as {nickname}</span>}
          </div>
        </div>
        {(role === "owner" || role === "superadmin") && !hiddenRole && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-sans font-semibold uppercase">
            {role === "owner" ? "owner" : "SA"}
          </span>
        )}
      </div>

      {/* Channels section */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-accent/30 transition-colors"
          onClick={() => setChannelsOpen(!channelsOpen)}
        >
          {channelsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="text-[11px] font-sans font-semibold text-muted-foreground uppercase tracking-wider">
            Channels ({channels.size})
          </span>
        </div>

        {channelsOpen && (
          <div className="space-y-0.5">
            {[...channels.entries()].map(([name, ch]) => (
              <div
                key={name}
                className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-accent/50 transition-colors text-[13px] ${
                  activeChannel === name && activeView === "channel"
                    ? "bg-accent text-accent-foreground"
                    : ""
                }`}
                onClick={() => setActiveChannel(name)}
              >
                <Hash size={12} className="text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{name.replace("#", "")}</span>
                {ch.unread > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-semibold ${
                    ch.isMentioned ? "bg-destructive text-white" : "bg-muted-foreground/20 text-muted-foreground"
                  }`}>
                    {ch.unread}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* PM Sessions */}
        <div
          className="flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-accent/30 transition-colors mt-2"
          onClick={() => setPmsOpen(!pmsOpen)}
        >
          {pmsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="text-[11px] font-sans font-semibold text-muted-foreground uppercase tracking-wider">
            Private ({pmSessions.size})
          </span>
          <Lock size={10} className="text-muted-foreground" />
        </div>

        {pmsOpen && (
          <div className="space-y-0.5">
            {[...pmSessions.entries()].map(([nick, pm]) => (
              <div
                key={nick}
                className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-accent/50 transition-colors text-[13px] ${
                  activePM === nick && activeView === "pm"
                    ? "bg-accent text-accent-foreground"
                    : ""
                }`}
                onClick={() => openPMSession(nick)}
              >
                <MessageSquare size={12} className="text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{nick}</span>
                {!pm.sessionActive && (
                  <span className="text-[9px] text-destructive">expired</span>
                )}
                {pm.unread > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-sans font-semibold">
                    {pm.unread}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground font-sans">
        <div>mIRCoin Chat v1.0.0</div>
      </div>
    </div>
  );
}
