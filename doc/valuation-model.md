# Valuation Model — Bovärdare

Bovärdare estimates the fair market value of a Swedish fritidshus (vacation property) using three independent price signals blended with fixed weights, then adjusted by a yield modifier.

---

## Formula

```
fairValue = (compValue × 0.40) + (taxValue × 0.35) + (peakValue × 0.25)
fairValue ×= (1 + yieldAdj)
```

---

## Signal 1 — Comparable/m² (40%)

Derives a price per sqm from recent comparable sales in the area, corrected for market cycle and property-specific quality.

```
baseCompPsm = (medianPsm + newbuildPremium) × cycleIndex
qualAdj     = 1 + Σ(all qualitative adjustments)
compValue   = baseCompPsm × qualAdj × sqm
```

**Inputs:**

| Input | Description |
|---|---|
| `medianPsm` | Median price/m² for recent comparable sales in the municipality |
| `newbuildPremium` | Extra kr/m² for newly built properties; set to 0 for older stock |
| `cycleIndex` | Market cycle scalar relative to the 2021–2022 peak (see below) |
| `sqm` | Living area in m² |

The `qualAdj` multiplier bundles all qualitative adjustments (waterfront, infrastructure, condition, distance, HOA, momentum, age, plot, heating, energy class). A neutral property scores 1.0; each factor adds or subtracts a percentage of the base price.

---

## Signal 2 — Tax assessment (35%)

Swedish tax assessments target 75% of estimated market value at the time of assessment. Inverting this gives an implied market value.

```
taxValue = taxAssessment × (1 / 0.75) × peakDampening
```

**Peak-year dampening:**

Properties built or assessed in 2021–2023 likely have taxable values reflecting the market peak. When the current cycle index is below 1.0, a dampening factor is applied:

```
cycleDelta    = 1 − cycleIndex
peakDampening = 1 − (cycleDelta × 1.5)   # only if assessmentYear ∈ [2021, 2023] and cycleIndex < 1.0
peakDampening = 1.0                       # otherwise (no dampening)
```

The 1.5× multiplier means the tax signal is corrected 50% more aggressively than the raw cycle drop — reflecting that tax rolls lag the actual market and tend to stay high longer.

---

## Signal 3 — Peak-cycle adjusted (25%)

Anchors the estimate to the area's historical price ceiling, scaled down by the current market cycle.

```
peakValue = peakPsm × cycleIndex × sqm
```

**Inputs:**

| Input | Description |
|---|---|
| `peakPsm` | Highest observed price/m² in the area near the 2021–2022 peak |
| `cycleIndex` | Market cycle scalar (e.g. 0.88 = market is 12% below peak) |

---

## Yield adjustment

A multiplicative modifier based on operating cost efficiency. High annual costs relative to asking price reduce fair value; low costs add a small premium.

```
costRatio = annualOpex / askingPrice

yieldAdj = +0.01   if costRatio ≤ 0.5%
yieldAdj = −0.01   if costRatio ≤ 0.8%
yieldAdj = −0.04   if costRatio > 0.8%
```

---

## Qualitative adjustments

Each factor below adds or subtracts a fraction of the comparable base price via `qualAdj`. They are additive (not multiplicative with each other).

### Waterfront proximity (`adj_water`)
| Option | Adjustment |
|---|---|
| None | 0% |
| Shared / walking distance | +5% |
| Direct waterfront plot | +12% |

### Infrastructure — water/sewage + fibre (`adj_infra`)
| Option | Adjustment |
|---|---|
| Neither | −3% |
| Partial | 0% |
| Complete | +3% |

### Condition (`adj_cond`)
| Option | Adjustment |
|---|---|
| Needs full renovation | −10% |
| Some renovation needed | −4% |
| Move-in ready / new condition | +2% |

### Distance to major city (`adj_dist`)
| Option | Adjustment |
|---|---|
| < 1 hour | +4% |
| 1–2 hours | +1% |
| 2–3 hours | −3% |
| > 3 hours | −7% |

### HOA / road association fee (`adj_hoa`)
| Option | Adjustment |
|---|---|
| < 5 000 kr/year | +2% |
| 5 000–10 000 kr/year | 0% |
| 10 000–15 000 kr/year | −2% |
| > 15 000 kr/year | −4% |

### Local market momentum (`adj_mom`)
| Option | Adjustment |
|---|---|
| Rising > +5%/year | +3% |
| Flat ±5% | +1% |
| Weak / post-peak | −2% |
| Falling | −5% |

### Heating system (`adj_heating`)
| Option | Adjustment |
|---|---|
| Direct electric heating | −5% |
| Oil / pellets | −3% |
| Air/air heat pump | +2% |
| Air/water heat pump | +4% |
| Ground source (bergvärme) | +6% |
| District heating (fjärrvärme) | +3% |

### Energy class (`adj_energy`)
| Class | Threshold | Adjustment |
|---|---|---|
| A | ≤ 50 kWh/m²/year | +6% |
| B | 51–75 kWh/m²/year | +4% |
| C | 76–100 kWh/m²/year | +2% |
| D | 101–125 kWh/m²/year | 0% |
| E | 126–150 kWh/m²/year | −2% |
| F | 151–200 kWh/m²/year | −4% |
| G | > 200 kWh/m²/year | −6% |

### Age (`adj_age`) — derived from build year
| Age | Adjustment |
|---|---|
| ≤ 2 years | +3% |
| 3–5 years | +1% |
| 6–15 years | 0% |
| 16–30 years | −3% |
| > 30 years | −7% |

### Plot size bonus (`adj_plot`) — derived from plot area
```
plotBonus = min(plotArea / 10 000, 0.08)   # capped at +8%
```
A 2 500 m² plot adds 2.5%; a 10 000 m² or larger plot adds 8%.

---

## Cycle index

The cycle index is a scalar that expresses the current market level as a fraction of the 2021–2022 peak:

| Option | Index | Interpretation |
|---|---|---|
| −12% — post-peak, weak | 0.88 | Market ~12% below peak |
| −8% — weak recovery | 0.92 | |
| −4% — recovering | 0.96 | |
| 0% — at peak | 1.00 | |
| +5% — above peak | 1.05 | |

It affects Signal 1 (comparable base price), Signal 2 (peak dampening trigger), and Signal 3 (peak scaling).

---

## Verdict thresholds

The verdict compares asking price to estimated fair value:

| Gap (asking vs fair) | Verdict |
|---|---|
| > +15% | Overpriced |
| +5% to +15% | High |
| ±5% | Fair |
| −5% to −15% | Potential |
| < −15% | Undervalued |
