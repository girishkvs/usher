---
title: Usher
subtitle: Markdown and Mermaid, everywhere
author: girishkvs
tags: [markdown, mermaid, viewer]
---

# Deployment runbook

A worked example of the kind of document Usher is built for: headings, tables,
diagrams, code, and callouts, in one long page you actually have to read.

> [!NOTE]
> Every stage below is gated. A stage only begins once the previous one has
> finished its bake time with no new failure signature in telemetry.

## Rollout flow

:::mermaid
flowchart LR
    A["Build"] -->|"artifacts"| B["Validation"]
    B -->|"pass"| C["Canary"]
    C -->|"soak 2h"| D["Ring 1"]
    D --> E["Ring 2"]
    B -->|"fail"| F["Rollback"]
    C -->|"regression"| F
:::

## Stages

| Stage | Regions | Bake time | Gate |
| --- | --- | --- | --- |
| Canary | `westus2` | 2 hours | Automatic |
| Ring 1 | `eastus`, `westeurope` | 12 hours | Automatic |
| Ring 2 | All remaining | 24 hours | Manual approval |
| Broad | Sovereign clouds | 48 hours | Manual approval |

> [!WARNING]
> A failed canary blocks every downstream ring. Do not override the gate without
> an approved exception.

## Checks before promotion

- [x] Build succeeded and artifacts published
- [x] Integration suite green
- [x] Telemetry dashboards show no new failure signature
- [ ] On-call engineer acknowledged the rollout

## Commands

```powershell
$stages = Get-DeploymentStage -Rollout $RolloutId
foreach ($stage in $stages) {
    Write-Host "$($stage.Name): $($stage.Status)"
}
```

```sql
SELECT TOP 10 CapacityId, State, UpdatedAt
FROM dbo.Capacities
WHERE State <> 'Active'
ORDER BY UpdatedAt DESC;
```

```csharp
public sealed class RolloutGate
{
    public bool CanPromote(StageResult result) =>
        result.Succeeded && result.SoakElapsed >= result.RequiredSoak;
}
```

## Sequence on failure

:::mermaid
sequenceDiagram
    participant M as Monitor
    participant G as Gate
    participant R as Rollout
    participant O as On-call
    M->>G: regression detected
    G->>R: halt promotion
    R-->>O: page with context
    O->>R: approve rollback
    R-->>M: previous build restored
:::

> [!TIP]
> Press `t` to toggle the contents panel and `r` to see the original Markdown
> source at any time.

## Definitions

Soak time
:   How long a stage runs before the next one is allowed to begin.

Gate
:   An automatic or manual decision point between two stages.

## Notes

Rollback restores the previous build but not the previous configuration[^1].

[^1]: Configuration is versioned separately and has its own rollback path.
