import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AIDefinition, DefinitionSource } from "@lightway/core";

export interface JsonDefinitionSourceOptions {
  directory: string;
}

export class JsonDefinitionSource implements DefinitionSource {
  private readonly directory: string;

  constructor(options: JsonDefinitionSourceOptions) {
    this.directory = options.directory;
  }

  async list(): Promise<AIDefinition[]> {
    const entries = await readdir(this.directory, {
      withFileTypes: true
    });

    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const definitions: AIDefinition[] = [];
    for (const file of files) {
      const definition = await this.readDefinitionFile(join(this.directory, file));
      definitions.push(definition);
    }

    return definitions;
  }

  async get(name: string): Promise<AIDefinition | undefined> {
    const definitions = await this.list();
    return definitions.find((definition) => definition.name === name);
  }

  private async readDefinitionFile(path: string): Promise<AIDefinition> {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as AIDefinition;
  }
}
