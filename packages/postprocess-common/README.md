# @lightway/postprocess-common

Built-in postprocessors for Lightway.

## Exports

- `TrimTextOutputPostprocessor`

## Workspace Path

- `packages/postprocess-common`

## Usage

```ts
import { TrimTextOutputPostprocessor } from "@lightway/postprocess-common";

registry.registerPostprocessor(new TrimTextOutputPostprocessor());
```

## Environment Variables

- Not required

## Definition Example

```json
{
  "postprocess": ["trim-text-output"]
}
```
