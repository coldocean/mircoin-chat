import { useState, useRef, useCallback, useEffect } from "react";
import { parseCommand } from "../lib/commands";
import { sendWs } from "../hooks/use-irc";
import { useIRCStore, addServerMessage, addPMMessage, openPMSession, closePMSession } from "../lib/irc-store";
import { compressImage } from "../lib/crypto";
import { Send, ImagePlus } from "lucide-react";
import { CommandPalette, getFilteredCommands } from "./CommandPalette";

export function CommandInput() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeView = useIRCStore((s) => s.activeView);
  const activePM = useIRCStore((s) => s.activePM);
  const activeChannel = useIRCStore((s) => s.activeChannel);
  const nickname = useIRCStore((s) => s.nickname);

  // Show palette when typing a slash command (no space yet)
  const showPalette = input.startsWith("/") && !input.includes(" ");
  const filtered = showPalette ? getFilteredCommands(input) : [];
  const isPaletteVisible = showPalette && filtered.length > 0;

  // Reset palette index when filtered list changes
  useEffect(() => {
    setPaletteIndex(0);
  }, [input]);

  const selectCommand = useCallback((cmd: string) => {
    setInput("/" + cmd + " ");
    setPaletteOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Add to history
    setHistory((h) => [trimmed, ...h.slice(0, 99)]);
    setHistoryIndex(-1);

    const parsed = parseCommand(trimmed);

    if (parsed.error) {
      addServerMessage(`*** ${parsed.error}`, "error");
    }

    if (parsed.localAction) {
      parsed.localAction();
    }

    if (parsed.wsMessage) {
      // For PM messages, also add to local PM session
      if (parsed.wsMessage.type === "pm_encrypted" && "target" in parsed.wsMessage) {
        const target = parsed.wsMessage.target;
        openPMSession(target);
        addPMMessage(target, {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          nickname: nickname,
          message: (parsed.wsMessage as any).encrypted,
          type: "pm",
          timestamp: new Date().toISOString(),
        });
      }
      sendWs(parsed.wsMessage);
    }

    setInput("");
  }, [input, nickname]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Palette navigation
    if (isPaletteVisible) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPaletteIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPaletteIndex((prev) => (prev >= filtered.length - 1 ? 0 : prev + 1));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && filtered.length > 0)) {
        e.preventDefault();
        const selected = filtered[paletteIndex];
        if (selected) {
          selectCommand(selected.command);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPaletteOpen(false);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleTabComplete();
    }
  };

  const handleTabComplete = () => {
    const state = useIRCStore.getState();
    if (!input || state.activeView !== "channel" || !state.activeChannel) return;
    const channel = state.channels.get(state.activeChannel);
    if (!channel) return;
    const partial = input.split(/\s+/).pop()?.toLowerCase() || "";
    if (!partial) return;
    const match = channel.users.find((u) => u.toLowerCase().startsWith(partial));
    if (match) {
      const parts = input.split(/\s+/);
      parts[parts.length - 1] = match;
      setInput(parts.join(" ") + (parts.length === 1 ? ": " : " "));
    }
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePM) return;

    try {
      const compressed = await compressImage(file);
      sendWs({ type: "pm_photo", target: activePM, data: compressed, iv: "" });
      addPMMessage(activePM, {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        nickname: nickname,
        message: compressed,
        type: "pm_photo",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      addServerMessage("*** Failed to compress image", "error");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Focus input on any key press when not already focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        document.activeElement !== inputRef.current &&
        !e.ctrlKey && !e.altKey && !e.metaKey &&
        e.key.length === 1
      ) {
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const placeholder = activeView === "channel" && activeChannel
    ? `Message ${activeChannel} or type /command`
    : activeView === "pm" && activePM
    ? `Message ${activePM} (ephemeral)`
    : "Type /help for commands...";

  return (
    <div className="relative shrink-0">
      {/* Command autocomplete palette */}
      <CommandPalette
        input={input}
        selectedIndex={paletteIndex}
        onSelect={selectCommand}
        visible={isPaletteVisible}
      />

      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-card/50">
        {/* Photo button for PMs only */}
        {activeView === "pm" && activePM && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="Send photo (compressed JPG)"
            >
              <ImagePlus size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhoto}
            />
          </>
        )}

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-secondary/50 border border-border rounded px-3 py-1.5 text-[13px] font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors placeholder:text-muted-foreground"
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />

        <button
          onClick={handleSubmit}
          className="p-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          title="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
