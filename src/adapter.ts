// ─── SLANG LLM Adapter ───

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

export interface LLMAdapter {
  name: string;
  call(messages: LLMMessage[], model?: string): Promise<LLMResponse>;
}

// ─── OpenAI-Compatible Adapter ───

export interface OpenAIAdapterConfig {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
}

export function createOpenAIAdapter(config: OpenAIAdapterConfig): LLMAdapter {
  const defaultModel = config.defaultModel ?? "gpt-4o";
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");

  return {
    name: `openai/${defaultModel}`,
    async call(messages: LLMMessage[], model?: string): Promise<LLMResponse> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: model ?? defaultModel,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as any;
      return {
        content: data.choices[0].message.content ?? "",
        tokensUsed: data.usage?.total_tokens ?? 0,
      };
    },
  };
}

// ─── Anthropic Adapter ───

export interface AnthropicAdapterConfig {
  apiKey: string;
  defaultModel?: string;
}

export function createAnthropicAdapter(config: AnthropicAdapterConfig): LLMAdapter {
  const defaultModel = config.defaultModel ?? "claude-sonnet-4-20250514";

  return {
    name: `anthropic/${defaultModel}`,
    async call(messages: LLMMessage[], model?: string): Promise<LLMResponse> {
      const systemMsg = messages.find((m) => m.role === "system");
      const conversationMsgs = messages.filter((m) => m.role !== "system");

      const body: Record<string, unknown> = {
        model: model ?? defaultModel,
        max_tokens: 4096,
        messages: conversationMsgs.map((m) => ({ role: m.role, content: m.content })),
      };
      if (systemMsg) {
        body.system = systemMsg.content;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as any;
      const content = data.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");

      return {
        content,
        tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      };
    },
  };
}

// ─── MCP Sampling Adapter ───
// Delegates LLM calls back to the MCP host (e.g. Claude Code, Claude Desktop)
// via the sampling/createMessage protocol request.
// No API key required — uses the subscription the user already has.

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";

export function createSamplingAdapter(server: Server, defaultModel?: string): LLMAdapter {
  return {
    name: `sampling/${defaultModel ?? "host"}`,
    async call(messages: LLMMessage[], model?: string): Promise<LLMResponse> {
      const systemMsg = messages.find((m) => m.role === "system");
      const conversationMsgs = messages.filter((m) => m.role !== "system");

      const result = await server.request(
        {
          method: "sampling/createMessage",
          params: {
            messages: conversationMsgs.map((m) => ({
              role: m.role as "user" | "assistant",
              content: { type: "text" as const, text: m.content },
            })),
            ...(systemMsg ? { systemPrompt: systemMsg.content } : {}),
            ...(model ?? defaultModel ? { modelPreferences: { hints: [{ name: model ?? defaultModel }] } } : {}),
            maxTokens: 4096,
          },
        },
        CreateMessageResultSchema,
      );

      const content =
        result.content.type === "text" ? result.content.text : "";

      return { content, tokensUsed: 0 };
    },
  };
}

// ─── Echo Adapter (for testing) ───

export function createEchoAdapter(): LLMAdapter {
  return {
    name: "echo/test",
    async call(messages: LLMMessage[]): Promise<LLMResponse> {
      const lastUser = messages.filter((m) => m.role === "user").pop();
      return {
        content: `[ECHO] Received task: ${lastUser?.content.slice(0, 200) ?? "(empty)"}`,
        tokensUsed: 0,
      };
    },
  };
}

// ─── Router Adapter ───
// Routes LLM calls to different adapters based on model name patterns.
// Enables multi-endpoint / multi-provider flows where each agent can
// use a different LLM backend.

export interface RouterRule {
  /** Glob-like pattern matched against the model string (e.g. "claude-*", "gpt-*", "local/*") */
  pattern: string;
  /** Adapter to use when the pattern matches */
  adapter: LLMAdapter;
}

export interface RouterAdapterConfig {
  /** Ordered list of pattern→adapter rules. First match wins. */
  routes: RouterRule[];
  /** Fallback adapter when no pattern matches */
  fallback: LLMAdapter;
}

export function createRouterAdapter(config: RouterAdapterConfig): LLMAdapter {
  const compiled = config.routes.map(({ pattern, adapter }) => ({
    regex: patternToRegex(pattern),
    adapter,
  }));

  return {
    name: "router",
    async call(messages: LLMMessage[], model?: string): Promise<LLMResponse> {
      const adapter = resolveAdapter(compiled, config.fallback, model);
      return adapter.call(messages, model);
    },
  };
}

function resolveAdapter(
  routes: { regex: RegExp; adapter: LLMAdapter }[],
  fallback: LLMAdapter,
  model?: string,
): LLMAdapter {
  if (!model) return fallback;
  for (const { regex, adapter } of routes) {
    if (regex.test(model)) return adapter;
  }
  return fallback;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}
