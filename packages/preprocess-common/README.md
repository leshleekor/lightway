# @lightway/preprocess-common

Built-in preprocessors for Lightway.

## Exports

- `TrimStringInputPreprocessor`

## Workspace Path

- `packages/preprocess-common`

## Usage

```ts
import { TrimStringInputPreprocessor } from "@lightway/preprocess-common";

registry.registerPreprocessor(new TrimStringInputPreprocessor());
```

## Environment Variables

- Not required

## Definition Example

```json
{
  "preprocess": ["trim-string-input"]
}
```
