import { useState } from "react";
import { createMockOutage, createScenario, injectDeadDeviceNoise, injectFeederFault, injectFault, seedSyntheticGrid } from "../api/apiClient";

export default function SimulatorPanel({ onMessage, onRefresh }) {
  const [activeAction, setActiveAction] = useState(null);

  async function runAction(actionName, apiCall, fallbackMessage) {
    if (activeAction) return; // Prevent concurrent simulator clicks

    try {
      setActiveAction(actionName);
      onMessage(`Running ${actionName}...`);
      
      const res = await apiCall();
      const successText = res?.message || fallbackMessage;
      
      // Slight delay ensures Postgres transaction is fully committed before we re-fetch
      await new Promise(resolve => setTimeout(resolve, 300));
      await onRefresh();
      
      onMessage(successText);
    } catch (error) {
      onMessage(error.message || `${actionName} failed`);
    } finally {
      setActiveAction(null);
    }
  }

  // Helper to render the button with a spinner if it's the active action
  const renderButton = (name, actionName, onClick, baseColorClass) => {
    const isProcessing = activeAction === actionName;
    const disabled = activeAction !== null;

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs sm:text-sm font-semibold transition ${baseColorClass} ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125'
        }`}
      >
        {isProcessing && (
          <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {name}
      </button>
    );
  };

  return (
    <div className="mt-auto border-t border-white/10 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
        Fault Simulator &amp; Testing Controls
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {renderButton(
          "1. Seed Grid Data",
          "Seed Grid",
          () => runAction("Seed Grid", seedSyntheticGrid, "Synthetic grid seeded successfully!"),
          "border-indigo-400/20 bg-indigo-500/15 text-indigo-100"
        )}

        {renderButton(
          "2. Inject Span Break",
          "Inject Span Fault",
          () => runAction("Inject Span Fault", injectFault, "Span fault injected!"),
          "border-rose-400/20 bg-rose-500/15 text-rose-100"
        )}

        {renderButton(
          "3. Feeder Fault (11 kV)",
          "Feeder Fault",
          () => runAction("Feeder Fault", injectFeederFault, "11 kV feeder fault injected!"),
          "border-violet-400/20 bg-violet-500/15 text-violet-100"
        )}

        {renderButton(
          "4. Monsoon Scenario",
          "Scenario",
          () => runAction("Scenario", () => createScenario({ name: "Monsoon Storm Outages" }), "Monsoon scenario created!"),
          "border-cyan-400/20 bg-cyan-500/15 text-cyan-100"
        )}

        {renderButton(
          "5. Load Shedding",
          "Load Shedding",
          () => runAction("Load Shedding", createMockOutage, "Scheduled load shedding active!"),
          "border-amber-400/20 bg-amber-500/10 text-amber-100"
        )}

        {renderButton(
          "6. Dead Device (Fw1.2)",
          "Dead Device Noise",
          () => runAction("Dead Device Noise", injectDeadDeviceNoise, "Dead device noise injected!"),
          "border-orange-400/20 bg-orange-500/10 text-orange-100"
        )}
      </div>
    </div>
  );
}
