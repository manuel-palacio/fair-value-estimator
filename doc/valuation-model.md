# Valuation Model — Bovärdare

Estimates fair market value for Swedish fritidshus using three price signals blended with fixed weights, then scaled by a yield modifier.

## Formula

```
fairValue = (compValue × 0.40) + (taxValue × 0.35) + (peakValue × 0.25)
fairValue ×= (1 + yieldAdj)
```

---

## Signal 1 — Comparable/m² (40%)

Market price per sqm based on a user-supplied median for the area, adjusted for cycle and property quality. The median is entered manually — typically sourced from recent sales in Hemnet or municipal statistics.

```
compValue = (medianPsm + newbuildPremium) × cycleIndex × qualAdj × sqm
```

`qualAdj = 1 + Σ(all qualitative adjustments)` — a neutral property scores 1.0.

## Signal 2 — Tax assessment (35%)

Swedish assessments target 75% of market value, so inverting gives an implied price. Properties assessed during the 2021–2023 peak are dampened more aggressively than the raw cycle drop.

```
taxValue = taxAssessment × (1 / 0.75) × peakDampening

peakDampening = 1 − ((1 − cycleIndex) × 1.5)   # if assessed 2021–2023 and cycleIndex < 1.0
peakDampening = 1.0                              # otherwise
```

## Signal 3 — Peak-cycle adjusted (25%)

Anchors to the area's historical price ceiling, scaled to the current market level.

```
peakValue = peakPsm × cycleIndex × sqm
```

## Yield adjustment

Scales the blended result based on annual operating cost efficiency.

| `opex / asking` | Adjustment |
|---|---|
| ≤ 0.5% | +1% |
| ≤ 0.8% | −1% |
| > 0.8% | −4% |

---

## Qualitative adjustments

All factors enter Signal 1 via `qualAdj` as additive percentage adjustments.

| Factor | Range | Notes |
|---|---|---|
| Waterfront | 0% to +12% | Shared access +5%, direct plot +12% |
| Infrastructure | −3% to +3% | Water/sewage + fibre |
| Condition | −10% to +2% | |
| Distance to city | −7% to +4% | |
| HOA fee | −4% to +2% | Based on kr/year |
| Market momentum | −5% to +3% | Local price trend |
| Heating system | −5% to +6% | Direct electric worst, bergvärme best |
| Energy class | −6% to +6% | G worst, A best |
| Age | −7% to +3% | Derived from build year |
| Plot size | 0% to +8% | `min(m² / 10 000, 0.08)` |

### Heating
| System | Adj |
|---|---|
| Direct electric | −5% |
| Oil / pellets | −3% |
| Air/air heat pump | +2% |
| District heating | +3% |
| Air/water heat pump | +4% |
| Ground source | +6% |

### Energy class
A (+6%), B (+4%), C (+2%), D (0%), E (−2%), F (−4%), G (−6%)

### Age
≤ 2 yr (+3%), 3–5 yr (+1%), 6–15 yr (0%), 16–30 yr (−3%), > 30 yr (−7%)

---

## Cycle index

Expresses the current market as a fraction of the 2021–2022 peak. Affects all three signals.

| Index | Interpretation |
|---|---|
| 0.88 | −12% — post-peak, weak |
| 0.92 | −8% — weak recovery |
| 0.96 | −4% — recovering |
| 1.00 | At peak |
| 1.05 | +5% — above peak |

---

## Verdict thresholds

| Asking vs fair value | Verdict |
|---|---|
| > +15% | Overpriced |
| +5% to +15% | High |
| ±5% | Fair |
| −5% to −15% | Potential |
| < −15% | Undervalued |
