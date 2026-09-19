import type { PluginItem } from "@babel/core";

/**
 * Shared between vite.config.ts and vitest.config.ts so dev/build and the
 * test suite can never drift onto different compiler configs.
 */
export function reactCompilerBabelPlugin(): PluginItem {
  let successCount = 0;
  let bailoutCount = 0;
  let pipelineErrorCount = 0;
  const seenBailoutKeys = new Set<string>();

  process.on("exit", () => {
    if (successCount + bailoutCount + pipelineErrorCount === 0) return;
    const total = successCount + bailoutCount;
    const pipelineNote = pipelineErrorCount > 0 ? `, ${pipelineErrorCount} pipeline error(s)` : "";
    console.log(
      `react-compiler: ${successCount}/${total} compiled, ${bailoutCount} bailed out${pipelineNote}`,
    );
  });

  return [
    "babel-plugin-react-compiler",
    {
      target: "19",
      panicThreshold: "none",
      logger: {
        logEvent(filename: string, event: { kind: string; fnLoc?: unknown }) {
          if (event.kind === "CompileSuccess") {
            successCount += 1;
            return;
          }
          if (event.kind === "CompileError") {
            const key = `${filename}:${JSON.stringify(event.fnLoc ?? null)}`;
            if (!seenBailoutKeys.has(key)) {
              seenBailoutKeys.add(key);
              bailoutCount += 1;
            }
            return;
          }
          if (event.kind === "CompileSkip") {
            bailoutCount += 1;
            return;
          }
          if (event.kind === "PipelineError") {
            pipelineErrorCount += 1;
          }
        },
      },
    },
  ];
}
