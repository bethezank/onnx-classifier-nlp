import { Navbar } from "@/components/Navbar";
import { HeroCard } from "@/components/HeroCard";
import { CustomModelCard } from "@/components/CustomModelCard";
import Ourteam from "@/components/Ourteam";

const Index = () => {
    return (
        <div className="relative min-h-screen overflow-hidden">
            {/* Background Layer */}
            <div className="fixed inset-0 z-[-2] lab-bg opacity-20" />

            {/* Content Layer */}
            <div className="relative z-[0]">
                <Navbar />

                <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-12">

                    <div className="relative mb-40 sm:mb-24 flex flex-col md:flex-row items-center justify-between gap-8 min-h-[220px]">
                        <div className="space-y-4 relative z-10 max-w-2xl">
                            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
                                Accurate cat breed classification powered by AI in your browser</h2>
                            <p className="text-slate-600 dark:text-slate-400 text-2xl tracking-tight max-w-md">
                                Upload an image and let the AI analyze your cat's breed instantly.
                            </p>
                        </div>

                        {/* Mascot */}
                        <div className="absolute -right-10 lg:right-10 -bottom-80 md:-bottom-60 lg:-bottom-80 -z-10 mascot-float pointer-events-none">
                            <img
                                src="/cat-classify_transparent.webp"
                                alt="Cat Mascot"
                                className="w-[400px] md:w-[500px] lg:w-[600px] h-auto drop-shadow-2xl opacity-90"
                            />
                        </div>
                    </div>

                    {/* Built-in Model Section - Independent */}
                    <HeroCard />

                    {/* Custom/User's Model Section - Independent */}
                    <CustomModelCard />

                    <Ourteam />
                </main>

                <footer className="mt-20 py-12 px-6 glass-card border-t border-white/20 dark:border-white/10 text-center">
                    <div className="max-w-2xl mx-auto space-y-6">
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-loose max-w-sm mx-auto">
                            Department of Computer and Information Sciences, KMUTNB.
                        </p>
                        <div className="inline-block px-4 py-1.5 rounded-full bg-slate-200/50 dark:bg-white/5 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                            Bethezank Lab &copy; 2026
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default Index;
