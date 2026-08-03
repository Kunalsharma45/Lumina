export default function Layout({ children, sidebar, topbar }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col bg-[radial-gradient(circle_at_top_left,rgba(255,188,0,0.20),transparent_30%),radial-gradient(circle_at_top_right,rgba(72,95,199,0.18),transparent_28%),linear-gradient(180deg,#08111f_0%,#0b1324_40%,#121c31_100%)] px-4 py-4 lg:px-6">
        <header className="mb-4 rounded-[28px] border border-white/10 bg-white/10 px-5 py-4 shadow-[0_20px_80px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          {topbar}
        </header>
        <main className="grid flex-1 gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="flex min-h-120 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1729]/90 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            {sidebar}
          </aside>
          <section className="min-h-160 overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1729]/90 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
