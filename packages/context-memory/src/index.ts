import { randomUUID } from "node:crypto";
import type {
  ContextLoadOptions,
  ContextStoreWithTtl,
  LightwayMessage
} from "@lightway/core";

interface StoredConversation {
  messages: LightwayMessage[];
  expiresAt?: number;
}

export class InMemoryContextStore implements ContextStoreWithTtl {
  private readonly conversations = new Map<string, StoredConversation>();

  async get(
    contextId: string,
    options?: ContextLoadOptions
  ): Promise<LightwayMessage[]> {
    const entry = this.conversations.get(contextId);
    if (!entry) {
      return [];
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.conversations.delete(contextId);
      return [];
    }

    const messages = [...entry.messages];
    if (!options?.limit || messages.length <= options.limit) {
      return messages;
    }

    return messages.slice(-options.limit);
  }

  async append(contextId: string, messages: LightwayMessage[]): Promise<void> {
    const existing = this.conversations.get(contextId);
    const expiresAt = existing?.expiresAt;
    const nextMessages = [...(existing?.messages ?? []), ...messages];

    this.conversations.set(contextId, {
      messages: nextMessages,
      expiresAt
    });
  }

  async create(): Promise<string> {
    const contextId = randomUUID();
    this.conversations.set(contextId, {
      messages: []
    });
    return contextId;
  }

  setTtl(contextId: string, ttlSeconds: number): void {
    const entry = this.conversations.get(contextId) ?? { messages: [] };
    this.conversations.set(contextId, {
      messages: entry.messages,
      expiresAt: Date.now() + ttlSeconds * 1_000
    });
  }
}
