import { createMockOutage, createScenario } from "../api/apiClient";

export default function SimulatorPanel({ onMessage, onRefresh }) {
  async function runScenario() {
    try {
      onMessage("");
      await createScenario({
        name: "Control Room Demo",
        code: "DEMO-001",
        pin_code: "560001",
        latitude: 12.9716,
        longitude: 77.5946,
        poleCount: 10,
        break_after_seq: 4,
      });
      onMessage("Synthetic scenario created and seeded");
      await onRefresh();
    } catch (error) {
      onMessage(error.message || "Scenario creation failed");
    }
  }

  async function runOutage() {
    try {
      onMessage("");
      await createMockOutage({
        transformer_id: 1,
        reason: "Scheduled load shedding",
      });
      onMessage("Mock scheduled outage created");
      await onRefresh();
    } catch (error) {
      onMessage(error.message || "Outage creation failed");
    }
  }

  return (
    <div className="mt-auto border-t border-white/10 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
        Fault Simulator
      </h3>
      <div className="mt-3 grid gap-2">
        <button
          type="button"
          onClick={runScenario}
          className="rounded-2xl border border-cyan-400/20 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
        >
          Create Full Scenario
        </button>
        <button
          type="button"
          onClick={runOutage}
          className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
        >
          Create Scheduled Outage
        </button>
      </div>
    </div>
  );
}
