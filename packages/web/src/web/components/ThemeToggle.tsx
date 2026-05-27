import { useIRCStore, setTheme } from "../lib/irc-store";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const theme = useIRCStore((s) => s.theme);

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
