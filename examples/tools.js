// tools.js — Example tool handlers for SLANG CLI
// Usage: slang run examples/research.slang --adapter openrouter --tools examples/tools.js
//
// Each export is a tool handler: an async function that receives
// an object of arguments and returns a string result.
// Only tools declared in the agent's `tools: [...]` AND present in
// this file will be available during execution.

export default {
  /**
   * web_search — search the web and return results.
   * Replace this stub with a real search API call.
   */
  async web_search(args) {
    const query = args.query ?? args.q ?? Object.values(args).join(" ");
    console.log(`  [web_search] Searching for: ${query}`);

    // Stub: return mock results. Replace with a real API:
    // const res = await fetch(`https://api.search.com?q=${encodeURIComponent(query)}`);
    // return await res.text();
    return JSON.stringify({
      query,
      results: [
        { title: `Result 1 for "${query}"`, url: "https://example.com/1", snippet: "Relevant information about " + query },
        { title: `Result 2 for "${query}"`, url: "https://example.com/2", snippet: "More details on " + query },
        { title: `Result 3 for "${query}"`, url: "https://example.com/3", snippet: "Additional data about " + query },
      ],
    });
  },

  /**
   * code_exec — execute code in a sandboxed environment.
   * This is a minimal stub. Replace with a real sandbox.
   */
  async code_exec(args) {
    const code = args.code ?? "";
    console.log(`  [code_exec] Executing code (${String(code).length} chars)`);

    // Stub: return a placeholder result.
    // In production, use a sandboxed environment (e.g. Docker, VM, WebAssembly).
    return JSON.stringify({
      status: "success",
      output: `Executed ${String(code).length} chars of code`,
    });
  },
};
