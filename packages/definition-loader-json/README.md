# @lightway/definition-loader-json

JSON file-based definition source for Lightway.

## Exports

- `JsonDefinitionSource`

## Workspace Path

- `packages/definition-loader-json`

## Usage

```ts
import { JsonDefinitionSource } from "@lightway/definition-loader-json";

const source = new JsonDefinitionSource({
  directory: "./definitions"
});
```

## Environment Variables

- Not required by the package itself

Definition directory selection is usually controlled by the app through `LIGHTWAY_DEFINITIONS_DIR`.

## Notes

This loader reads top-level `*.json` files in the configured directory and returns them as `DefinitionSource` items.
