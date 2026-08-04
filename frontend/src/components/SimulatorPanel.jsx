import { createMockOutage, createScenario, injectFault, seedSyntheticGrid } from "../api/apiClient";

export default function SimulatorPanel({ onMessage, onRefresh }) {
  async function runAction(actionName, apiCall, successMessage) {
    try {
      onMessage(`Running ${actionName}...`);
      await apiCall();
      onMessage(successMessage);
      await onRefresh();
    } catch (error) {
      onMessage(error.message || `${actionName} failed`);
    }
  }

  return (
    <div className="mt-auto border-t border-white/10 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400 font-semibold">
        Fault Simulator & Testing Controls
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
          onClick={() => runAction("Inject Fault", injectFault, "Span fault injected!")}
          className="rounded-2xl border border-rose-400/20 bg-rose-500/15 px-3 py-2.5 text-xs sm:text-sm font-semibold text-rose-100 transition hover:bg-rose-500/25"
        >
          2. Inject Span Break
        </button>

        {/* BUTTON 3: MONSOON SCENARIO */}
        <button
          type="button"
          onClick={() => runAction("Scenario", () => createScenario({ poleCount: 10, break_after_seq: 4 }), "Monsoon scenario created!")}
          className="rounded-2xl border border-cyan-400/20 bg-cyan-500/15 px-3 py-2.5 text-xs sm:text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
        >
          3. Monsoon Scenario
        </button>

        {/* BUTTON 4: SCHEDULED OUTAGE */}
        <button
          type="button"
          onClick={() => runAction("Mock Outage", () => createMockOutage({ transformer_id: 1 }), "Mock scheduled outage active!")}
          className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs sm:text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
        >
          4. Load Shedding
        </button>
      </div>
    </div>
  );
}
