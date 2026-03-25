import { ConfigurationError } from "./errors.js";
import type {
  ContextStore,
  LightwayRegistry,
  ModelProvider,
  Postprocessor,
  Preprocessor,
  RagRetriever
} from "./types.js";

class LightwayRegistryImpl implements LightwayRegistry {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly preprocessors = new Map<string, Preprocessor>();
  private readonly postprocessors = new Map<string, Postprocessor>();
  private readonly ragRetrievers = new Map<string, RagRetriever>();
  private readonly contextStores = new Map<string, ContextStore>();
  private defaultContextStoreName?: string;

  registerProvider(provider: ModelProvider): void {
    this.registerUnique(this.providers, provider.name, provider, "provider");
  }

  registerPreprocessor(preprocessor: Preprocessor): void {
    this.registerUnique(
      this.preprocessors,
      preprocessor.name,
      preprocessor,
      "preprocessor"
    );
  }

  registerPostprocessor(postprocessor: Postprocessor): void {
    this.registerUnique(
      this.postprocessors,
      postprocessor.name,
      postprocessor,
      "postprocessor"
    );
  }

  registerRagRetriever(retriever: RagRetriever): void {
    this.registerUnique(
      this.ragRetrievers,
      retriever.name,
      retriever,
      "rag retriever"
    );
  }

  registerContextStore(name: string, store: ContextStore): void {
    this.registerUnique(this.contextStores, name, store, "context store");
  }

  setDefaultContextStore(name: string): void {
    if (!this.contextStores.has(name)) {
      throw new ConfigurationError(
        `Cannot set unknown context store "${name}" as default`
      );
    }

    this.defaultContextStoreName = name;
  }

  getProvider(name: string): ModelProvider | undefined {
    return this.providers.get(name);
  }

  getPreprocessor(name: string): Preprocessor | undefined {
    return this.preprocessors.get(name);
  }

  getPostprocessor(name: string): Postprocessor | undefined {
    return this.postprocessors.get(name);
  }

  getRagRetriever(name: string): RagRetriever | undefined {
    return this.ragRetrievers.get(name);
  }

  getContextStore(name: string): ContextStore | undefined {
    return this.contextStores.get(name);
  }

  getDefaultContextStore(): ContextStore | undefined {
    return this.defaultContextStoreName
      ? this.contextStores.get(this.defaultContextStoreName)
      : undefined;
  }

  getDefaultContextStoreName(): string | undefined {
    return this.defaultContextStoreName;
  }

  listProviders(): ModelProvider[] {
    return [...this.providers.values()];
  }

  listPreprocessors(): Preprocessor[] {
    return [...this.preprocessors.values()];
  }

  listPostprocessors(): Postprocessor[] {
    return [...this.postprocessors.values()];
  }

  listRagRetrievers(): RagRetriever[] {
    return [...this.ragRetrievers.values()];
  }

  listContextStores(): Array<{ name: string; store: ContextStore }> {
    return [...this.contextStores.entries()].map(([name, store]) => ({
      name,
      store
    }));
  }

  private registerUnique<T>(
    store: Map<string, T>,
    name: string,
    value: T,
    kind: string
  ): void {
    if (store.has(name)) {
      throw new ConfigurationError(
        `Duplicate ${kind} registration is not allowed: "${name}"`
      );
    }

    store.set(name, value);
  }
}

export function createLightwayRegistry(): LightwayRegistry {
  return new LightwayRegistryImpl();
}
