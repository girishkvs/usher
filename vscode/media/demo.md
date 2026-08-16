# Release checklist

A worked example of the things Usher renders.

## Rollout flow

:::mermaid
flowchart LR
    A["Author change"] -->|"1. Review"| B["Pull request"];
    B -->|"2. Verify"| C["CI: tests, lint, licences"];
    C -->|"3. Tag"| D["Release build"];
    D -->|"4. Sign"| E["Signed artefact"];
    E -->|"5. Stage"| F["Canary region"];
    F -->|"6. Watch"| G["Health signals"];
    G -->|"7. Promote"| H["All regions"];
:::

:::note
Wide diagrams stop shrinking at a readability floor and scroll sideways instead,
so the labels stay legible.
:::

## States

:::mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> InReview
    InReview --> Approved
    Approved --> Released
    Released --> [*]
:::

:::warning Check the blast radius
Rollouts are regional. Promote one region at a time and watch the health signals
before continuing.
:::

## Checks

| Gate | Owner | Blocking |
|---|---|---|
| Unit tests | author | yes |
| Licence allowlist | author | yes |
| Canary soak | on-call | yes |
| Docs updated | author | no |

- [x] Tests green
- [x] Licences within the allowlist
- [ ] Canary soak complete

## Code

```ts
export function fitDiagram(natural: number, available: number, floor: number) {
  if (natural <= available) {
    return { width: natural, scrolls: false };
  }
  const fitted = available / natural;
  return fitted >= floor
    ? { width: available, scrolls: false }
    : { width: natural * floor, scrolls: true };
}
```

:::tip
Footnotes[^1], definition lists, task lists and emoji :rocket: all work.
:::

Inline maths such as $E = mc^2$ renders too.

[^1]: Like this one.
