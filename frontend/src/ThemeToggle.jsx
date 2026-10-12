import { useEffect, useState } from "react";

const getSavedTheme = () => {
  try {
    return window.localStorage.getItem("linkdrop-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

function ThemeToggle() {
  const [theme, setTheme] = useState(getSavedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("linkdrop-theme", theme);
    } catch {
      return;
    }
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => setTheme((currentTheme) => currentTheme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      aria-pressed={theme === "dark"}
    >
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}

export default ThemeToggle;
