import { useEffect, useState } from "react";

const THEME_KEY = "cat-breeds-theme";

type Theme = "light" | "dark";

export const Navbar = () => {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        // Load theme from localStorage or system preference
        const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

        const shouldBeDark = savedTheme === "dark" || (!savedTheme && prefersDark);

        if (shouldBeDark) {
            document.documentElement.classList.add("dark");
            setIsDark(true);
        } else {
            document.documentElement.classList.remove("dark");
            setIsDark(false);
        }
    }, []);

    const toggleDarkMode = () => {
        if (isDark) {
            document.documentElement.classList.remove("dark");
            localStorage.setItem(THEME_KEY, "light");
            setIsDark(false);
        } else {
            document.documentElement.classList.add("dark");
            localStorage.setItem(THEME_KEY, "dark");
            setIsDark(true);
        }
    };

    return (
        <>
            <header className="fixed top-0 left-0 right-0 py-3 sm:py-0 z-50 w-full glass-card border-b border-white/20 dark:border-white/10">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
                        <div>
                            <h1 className="font-semibold text-lg leading-tight text-slate-900 dark:text-white">Image Classification Platform (ONNX Format)</h1>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Computer and Information Sciences, KMUTNB
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={toggleDarkMode}
                        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200"
                    >
                        {isDark ? (
                            <span className="material-symbols-rounded block">light_mode</span>
                        ) : (
                            <span className="material-symbols-rounded block">dark_mode</span>
                        )}
                    </button>
                </div>
            </header>
            {/* Spacer to prevent content from going under the fixed navbar */}
            <div className="h-16 w-full" aria-hidden="true"></div>
        </>
    );
};
