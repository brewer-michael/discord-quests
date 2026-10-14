"use client";

import { useState, useTransition } from "react";
import type { TestResult } from "@/server/providers";

export function TestButton({ test, kind }: { test: () => Promise<TestResult>; kind: "llm" | "image" }) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => start(async () => setResult(await test()))}
      >
        {pending ? (kind === "image" ? "Painting a test picture…" : "Testing…") : "Test connection"}
      </button>
      {result ? (
        <div
          role="status"
          className={`status ${result.ok ? "status-ok" : "status-error"}`}
          style={{ marginTop: 8 }}
        >
          {result.ok ? "✅ " : "⚠️ "}
          {result.message}
          {result.ms > 0 ? (
            <span className="muted small" style={{ fontWeight: 400 }}>
              {" "}
              ({result.model ? `${result.model}, ` : ""}
              {(result.ms / 1000).toFixed(1)}s)
            </span>
          ) : null}
          {result.image ? (
            <img className="test-image" src={result.image} alt="Test result: a lantern on a table" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
