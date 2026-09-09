"use client";

import { useState } from "react";
import { parseMovementRules, type MovementRule } from "@/lib/biomechanics/risk-rules";

export function RuleConfigurationPanel({
  rules,
  onRulesChange,
  disabled = false,
}: {
  rules: MovementRule[];
  onRulesChange: (rules: MovementRule[]) => void;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file || disabled) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validated = parseMovementRules(parsed);
      onRulesChange(validated);
      setMessage(`Loaded ${validated.length} sourced movement-quality rules.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load rule configuration.");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">Movement-quality rules</p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Import literature- or protocol-sourced JSON. The loader rejects rules without a source URL and never invents cutoffs.
          </p>
        </div>
        <label className={`rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            disabled={disabled}
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-600">
        <span>{rules.length} configured rules</span>
        {rules.length > 0 && !disabled && (
          <button className="underline" onClick={() => onRulesChange([])}>Disable all</button>
        )}
        {disabled && <span>Protocol locked for current recording.</span>}
      </div>
      {message && <p className="mt-2 text-xs text-zinc-600">{message}</p>}
    </div>
  );
}
