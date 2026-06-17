"use client";

import type { ReactNode } from "react";

type ManualHandlingPanelProps = {
  moves: ReactNode;
  workbench: ReactNode;
};

export function ManualHandlingPanel({ moves, workbench }: ManualHandlingPanelProps) {
  return (
    <div className="space-y-5">
      {moves}
      <div id="radar-workbench" className="scroll-mt-24">
        {workbench}
      </div>
    </div>
  );
}
