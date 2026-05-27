import { useIRC } from "../hooks/use-irc";
import { useIRCStore } from "../lib/irc-store";
import { ChannelPanel } from "../components/ChannelPanel";
import { ChatArea } from "../components/ChatArea";
import { UserPanel } from "../components/UserPanel";
import { CommandInput } from "../components/CommandInput";
import { ThemeToggle } from "../components/ThemeToggle";
import { useEffect, useState } from "react";
import { Wifi, WifiOff, Menu, X } from "lucide-react";

export default function Index() {
  const { send } = useIRC();
  const theme = useIRCStore((s) => s.theme);
  const connected = useIRCStore((s) => s.connected);
  const nickname = useIRCStore((s) => s.nickname);
  const role = useIRCStore((s) => s.role);
  const ip = useIRCStore((s) => s.ip);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setShowLeftPanel(false);
        setShowRightPanel(false);
      } else {
        setShowLeftPanel(true);
        setShowRightPanel(true);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${theme}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isMobile && (
            <button
              onClick={() => { setShowLeftPanel(!showLeftPanel); setShowRightPanel(false); }}
              className="p-1 rounded hover:bg-accent transition-colors"
            >
              {showLeftPanel ? <X size={16} /> : <Menu size={16} />}
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <img src="/coin-icon-trimmed.png" alt="mIRCoin" className="w-6 h-6 object-contain drop-shadow-[0_0_4px_rgba(59,130,246,0.5)]" />
            <span className="text-[15px] font-bold font-sans tracking-tight bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent">mIRCoin</span>
            <span className="text-[11px] text-slate-400 font-sans">Chat</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-[11px] font-sans">
            {connected ? (
              <>
                <Wifi size={12} className="text-green-500" />
                <span className="text-muted-foreground hidden sm:inline">
                  {nickname}
                  {role !== "user" && (
                    <span className={`ml-1 ${role === "owner" ? "text-yellow-500" : "text-red-400"}`}>
                      [{role}]
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-destructive" />
                <span className="text-destructive hidden sm:inline">Disconnected</span>
              </>
            )}
          </div>

          {ip && (
            <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">
              {ip}
            </span>
          )}

          <ThemeToggle />

          {isMobile && (
            <button
              onClick={() => { setShowRightPanel(!showRightPanel); setShowLeftPanel(false); }}
              className="p-1 rounded hover:bg-accent transition-colors text-[11px] font-sans text-muted-foreground"
            >
              Users
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left panel - Channels */}
        {showLeftPanel && (
          <div className={`${isMobile ? "absolute inset-y-0 left-0 z-20 w-[240px] shadow-xl" : "w-[220px] shrink-0"}`}>
            <ChannelPanel />
          </div>
        )}

        {/* Center - Chat */}
        <div className="flex flex-col flex-1 min-w-0">
          <ChatArea />
          <CommandInput />
        </div>

        {/* Right panel - Users */}
        {showRightPanel && (
          <div className={`${isMobile ? "absolute inset-y-0 right-0 z-20 w-[200px] shadow-xl" : "w-[180px] shrink-0"}`}>
            <UserPanel />
          </div>
        )}
      </div>

      {/* Mobile overlay backdrop */}
      {isMobile && (showLeftPanel || showRightPanel) && (
        <div
          className="fixed inset-0 bg-black/40 z-10"
          onClick={() => { setShowLeftPanel(false); setShowRightPanel(false); }}
        />
      )}
    </div>
  );
}
