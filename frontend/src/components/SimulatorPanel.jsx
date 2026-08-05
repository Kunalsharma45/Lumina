import { createMockOutage, createScenario, injectDeadDeviceNoise, injectFeederFault, injectFault, seedSyntheticGrid } from "../api/apiClient";

export default function SimulatorPanel({ onMessage, onRefresh }) {
  async function runAction(actionName, apiCall, fallbackMessage) {
    try {
      onMessage(`Running ${actionName}...`);
      const res = await apiCall();
      const successText = res?.message || fallbackMessage;
      onMessage(successText);
      await onRefresh();
    } catch (error) {
      onMessage(error.message || `${actionName} failed`);
    }
  }

  return (
    <div className="mt-auto border-t border-white/10 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
        Fault Simulator &amp; Testing Controls
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {/* BUTTON 1: SEED DATA */}
        <button
          type="button"
          onClick={() => runAction("Seed Grid", seedSyntheticGrid, "Synthetic grid seeded successfully!")}
          className="rounded-2xl border border-indigo-400/20 bg-indigo-500/15 px-3 py-2.5 text-xs sm:text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/25"
        >
          1. Seed Grid Data
        </button>

        {/* BUTTON 2: INJECT SPAN FAULT */}
        <button
          type="button"
          onClick={() => runAction("Inject Span Fault", injectFault, "Span fault injected!")}
          className="rounded-2xl border border-rose-400/20 bg-rose-500/15 px-3 py-2.5 text-xs sm:text-sm font-semibold text-rose-100 transition hover:bg-rose-500/25"
        >
          2. Inject Span Break
        </button>

        {/* BUTTON 3: FEEDER FAULT (11 kV) */}
        <button
          type="button"
          onClick={() => runAction("Feeder Fault", () => injectFeederFault(), "11 kV feeder fault injected — single FEEDER_FAULT ticket created!")}
          className="rounded-2xl border border-violet-400/20 bg-violet-500/15 px-3 py-2.5 text-xs sm:text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25"
        >
          3. Feeder Fault (11 kV)
        </button>

        {/* BUTTON 4: MONSOON SCENARIO */}
        <button
          type="button"
          onClick={() => runAction("Scenario", () => createScenario({ name: "Monsoon Storm Outages" }), "Monsoon scenario created!")}
          className="rounded-2xl border border-cyan-400/20 bg-cyan-500/15 px-3 py-2.5 text-xs sm:text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
        >
          4. Monsoon Scenario
        </button>

        {/* BUTTON 5: SCHEDULED OUTAGE (load shedding suppression) */}
        <button
          type="button"
          onClick={() => runAction("Load Shedding", () => createMockOutage(), "Scheduled load shedding active — tickets suppressed!")}
          className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs sm:text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
        >
          5. Load Shedding
        </button>

        {/* BUTTON 6: DEAD DEVICE NOISE (fw1.2 / dead modem — should NOT ticket) */}
        <button
          type="button"
          onClick={() => runAction("Dead Device Noise", injectDeadDeviceNoise, "Dead device noise injected — dead-sensor filter should suppress ticket.")}
          className="rounded-2xl border border-orange-400/20 bg-orange-500/10 px-3 py-2.5 text-xs sm:text-sm font-semibold text-orange-100 transition hover:bg-orange-500/20"
        >
          6. Dead Device (Fw1.2)
        </button>
      </div>
    </div>
  );
}
