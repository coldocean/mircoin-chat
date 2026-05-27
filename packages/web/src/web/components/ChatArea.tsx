import { useIRCStore, type ChatMessage } from "../lib/irc-store";
import { useEffect, useRef } from "react";

function nickColor(nickname: string): string {
  if (!nickname || nickname === "*") return "";
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `nick-${Math.abs(hash) % 12}`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function MessageLine({ msg, selfNick }: { msg: ChatMessage; selfNick: string }) {
  const time = formatTime(msg.timestamp);
  const isSelf = msg.nickname === selfNick;

  switch (msg.type) {
    case "message":
      return (
        <div className={`flex gap-0 leading-[1.6] min-w-0 ${msg.isHistory ? "opacity-70" : ""}`}>
          <span className="msg-timestamp mr-2 shrink-0">[{time}]</span>
          <span className={`font-semibold mr-1 shrink-0 ${isSelf ? "nick-self" : nickColor(msg.nickname)}`}>
            &lt;{msg.nickname}&gt;
          </span>
          <span className="break-all min-w-0" style={{ overflowWrap: "anywhere" }}>{msg.message}</span>
        </div>
      );

    case "action":
      return (
        <div className="msg-action leading-[1.6] min-w-0" style={{ overflowWrap: "anywhere" }}>
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span className="break-all">* {msg.nickname} {msg.message}</span>
        </div>
      );

    case "join":
      return (
        <div className="msg-join leading-[1.6]">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>--&gt; {msg.message}</span>
        </div>
      );

    case "part":
    case "quit":
      return (
        <div className="msg-part leading-[1.6]">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>&lt;-- {msg.message}</span>
        </div>
      );

    case "kick":
      return (
        <div className="msg-kick leading-[1.6]">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>*** {msg.message}</span>
        </div>
      );

    case "topic":
    case "mode":
      return (
        <div className="msg-topic leading-[1.6]">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>*** {msg.message}</span>
        </div>
      );

    case "notice":
      return (
        <div className="msg-notice leading-[1.6]">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>-{msg.nickname}- {msg.message}</span>
        </div>
      );

    case "server":
      return (
        <div className="msg-server leading-[1.6] min-w-0 whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>
          <span>{msg.message}</span>
        </div>
      );

    case "error":
      return (
        <div className="msg-error leading-[1.6]">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>{msg.message}</span>
        </div>
      );

    case "info":
      return (
        <div className="msg-info leading-[1.6]">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>{msg.message}</span>
        </div>
      );

    case "pm":
      return (
        <div className="leading-[1.6] min-w-0">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span className={`font-semibold mr-1 ${isSelf ? "nick-self" : nickColor(msg.nickname)}`}>
            &lt;{msg.nickname}&gt;
          </span>
          <span className="break-all min-w-0" style={{ overflowWrap: "anywhere" }}>{msg.message}</span>
        </div>
      );

    case "pm_photo":
      return (
        <div className="leading-[1.6] min-w-0">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span className={`font-semibold mr-1 ${isSelf ? "nick-self" : nickColor(msg.nickname)}`}>
            &lt;{msg.nickname}&gt;
          </span>
          <img
            src={`data:image/jpeg;base64,${msg.message}`}
            alt="photo"
            className="mt-1 max-w-[min(300px,100%)] max-h-[200px] rounded border border-border"
          />
        </div>
      );

    default:
      return (
        <div className="leading-[1.6] text-muted-foreground">
          <span className="msg-timestamp mr-2">[{time}]</span>
          <span>{msg.message}</span>
        </div>
      );
  }
}

export function ChatArea() {
  const activeView = useIRCStore((s) => s.activeView);
  const activeChannel = useIRCStore((s) => s.activeChannel);
  const activePM = useIRCStore((s) => s.activePM);
  const channels = useIRCStore((s) => s.channels);
  const pmSessions = useIRCStore((s) => s.pmSessions);
  const serverMessages = useIRCStore((s) => s.serverMessages);
  const nickname = useIRCStore((s) => s.nickname);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  let messages: ChatMessage[] = [];
  let title = "Server";
  let subtitle = "";

  if (activeView === "server") {
    messages = serverMessages;
    title = "mIRCoin Chat Server";
    subtitle = "Connection log";
  } else if (activeView === "channel" && activeChannel) {
    const ch = channels.get(activeChannel);
    if (ch) {
      messages = ch.messages;
      title = activeChannel;
      subtitle = ch.topic || "No topic set";
    }
  } else if (activeView === "pm" && activePM) {
    const pm = pmSessions.get(activePM);
    if (pm) {
      messages = pm.messages;
      title = `Private: ${activePM}`;
      subtitle = pm.sessionActive ? "Ephemeral session active" : "Session expired";
    }
  }

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) {
      isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Topic bar */}
      <div className="px-3 py-1.5 border-b border-border stripe-border-b bg-card/50 shrink-0">
        <div className="text-[13px] font-semibold font-sans truncate">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-1 text-[13px] leading-relaxed bg-background/80 dark:bg-background/70"
      >
        {messages.map((msg) => (
          <MessageLine key={msg.id} msg={msg} selfNick={nickname} />
        ))}
      </div>
    </div>
  );
}
