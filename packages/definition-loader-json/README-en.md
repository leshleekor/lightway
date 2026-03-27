# @lightway/definition-loader-json

`@lightway/definition-loader-json` loads JSON definitions from the filesystem and feeds them into the `DefinitionRegistry`. In a template-repository workflow, this is the default definition loader used by most projects.

## What it provides

- loading top-level `*.json` files from a configured directory
- a `DefinitionSource` implementation
- `JsonDefinitionSource`, ready to connect to the definition registry

## Main export

```ts
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
```

## Basic usage

```ts
import { createDefinitionRegistry, createLightwayRegistry } from "@lightway/core";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { OpenAIProvider } from "@lightway/provider-openai";

const registry = createLightwayRegistry();
registry.registerProvider(new OpenAIProvider());

const definitionRegistry = createDefinitionRegistry();
await definitionRegistry.load(
  new JsonDefinitionSource({
    directory: "./definitions"
  }),
  registry
);
```

## `JsonDefinitionSource`

Constructor:

```ts
new JsonDefinitionSource({
  directory: "./definitions"
});
```

Options:

- `directory`: absolute or relative path to the definition JSON directory

Methods:

- `list()`: reads all JSON definitions from the directory
- `get(name)`: returns the definition with the matching name

## Example directory layout

```text
definitions/
  animal-pedia.json
  animal-profile.json
  customer-support.json
```

Example definition:

```json
{
  "name": "animal-pedia",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  }
}
```

## Behavior notes

- It does not recurse into subdirectories.
- Definition names come from the JSON `name` field, not the filename.
- Files are read in sorted order.
- If a definition references an unregistered provider, `definitionRegistry.load()` fails.

## Environment variables

This package does not use package-level environment variables.

If you want an app-level configuration for the definition directory, inject it from your bootstrap code or from an app environment variable. For example, the gateway app may use an app-specific setting such as `LIGHTWAY_DEFINITIONS_DIR`.
