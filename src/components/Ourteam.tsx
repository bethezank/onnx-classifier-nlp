export default function Ourteam() {
    return (
        <section className="text-center space-y-12 py-12">
            <h3 className="text-3xl font-semibold text-slate-900 dark:text-white">Our Team</h3>
            <div className="flex flex-wrap justify-center gap-16">

                {/* Team Member 1 */}
                <div className="space-y-6 group">
                    <div className="relative w-40 h-40 mx-auto">
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl group-hover:bg-primary/40 transition-colors"></div>
                        <img
                            src="/profile/bank.png"
                            alt="Satienpong Yiengvanichchakul"
                            className="relative w-full h-full rounded-full object-cover shadow-xl"
                        />
                    </div>
                    <div>
                        <h4 className="text-xl font-semibold text-slate-900 dark:text-white">Satienpong Yiengvanichchakul</h4>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">68-040628-5606-1</p>
                    </div>
                </div>

                {/* Team Member 2 */}
                <div className="space-y-6 group">
                    <div className="relative w-40 h-40 mx-auto">
                        <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl group-hover:bg-blue-500/40 transition-colors"></div>
                        <img
                            src="/profile/mig.png"
                            alt="Jirapas Jatejaroungkit"
                            className="relative w-full h-full rounded-full object-cover shadow-xl"
                        />
                    </div>
                    <div>
                        <h4 className="text-xl font-semibold text-slate-900 dark:text-white">Jirapas Jatejaroungkit</h4>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">68-040628-5601-0</p>
                    </div>
                </div>

            </div>
        </section>
    );
}