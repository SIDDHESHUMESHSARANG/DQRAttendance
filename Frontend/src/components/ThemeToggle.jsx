import { Moon, Sun } from "lucide-react";

function ThemeToggle({ theme, onToggle }) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      <span>{theme === "dark" ? "Light" : "Dark"} mode</span>
    </button>
  );
}

export default ThemeToggle;
