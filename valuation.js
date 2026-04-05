/* ── Formatters ── */
function fmtKr(n) {
  return Math.round(n).toLocaleString('sv-SE') + '\u00a0kr';
}

function fmtPsm(n) {
  return Math.round(n).toLocaleString('sv-SE') + '\u00a0kr/m\u00b2';
}

function fmtPct(n, d) {
  d = (d === undefined) ? 1 : d;
  return (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
}

function fmtRatio(n) {
  return n.toFixed(2) + '\u00d7';
}

/* ── DOM value readers ── */
function num(id) { return parseFloat(document.getElementById(id).value) || 0; }
function sel(id) { return parseFloat(document.getElementById(id).value); }

/* ── Pure computation helpers ── */
function ageAdj(yr) {
  var age = 2026 - yr;
  if (age <= 2)  return  0.03;
  if (age <= 5)  return  0.01;
  if (age <= 15) return  0;
  if (age <= 30) return -0.03;
  return -0.07;
}

/* ── DOM builder helpers ── */
function el(tag, props, children) {
  var e = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach(function(k) {
      if (k === 'style') {
        Object.assign(e.style, props[k]);
      } else if (k === 'className') {
        e.className = props[k];
      } else {
        e[k] = props[k];
      }
    });
  }
  if (children) {
    children.forEach(function(c) {
      if (c == null) return;
      if (typeof c === 'string') {
        e.appendChild(document.createTextNode(c));
      } else {
        e.appendChild(c);
      }
    });
  }
  return e;
}

function setChildren(parent, children) {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  children.forEach(function(c) { if (c) parent.appendChild(c); });
}

/* ── Main calculation ── */
function recalc() {
  var asking    = num('asking');
  var sqm       = num('sqm');
  var taxval    = num('taxval');
  var buildyear = num('buildyear');
  var opex      = num('opex');
  var plot      = num('plot');
  var medianpsm = num('medianpsm');
  var newbuild  = num('newbuild');
  var peakpsm   = num('peakpsm');
  var cycleidx  = sel('cycleidx');

  var adj_water   = sel('adj_water');
  var adj_infra   = sel('adj_infra');
  var adj_cond    = sel('adj_cond');
  var adj_dist    = sel('adj_dist');
  var adj_hoa     = sel('adj_hoa');
  var adj_mom     = sel('adj_mom');
  var adj_heating = sel('adj_heating');
  var adj_energy  = sel('adj_energy');

  if (!asking || !sqm) return;

  /* Peak-year warning */
  document.getElementById('taxval-warning').style.display =
    (buildyear >= 2021 && buildyear <= 2023) ? 'block' : 'none';

  /* Derived adjustments */
  var age     = ageAdj(buildyear);
  var plotBon = Math.min(plot / 10000, 0.08);

  var costRatio = opex / asking;
  var yieldAdj;
  if (costRatio > 0.008)      yieldAdj = -0.04;
  else if (costRatio > 0.005) yieldAdj = -0.01;
  else                        yieldAdj =  0.01;

  /* Signal 1 — Comparable/m² */
  var baseCompPsm = (medianpsm + newbuild) * cycleidx;
  var qualAdj = 1 + adj_water + adj_infra + adj_cond + adj_dist
                  + adj_hoa + adj_mom + age + plotBon
                  + adj_heating + adj_energy;
  var compValue = baseCompPsm * qualAdj * sqm;

  /* Signal 2 — Tax assessment with peak-year dampening */
  var taxAssessmentYear = (buildyear <= 2022) ? 2022 : buildyear;
  var cycleDelta = 1 - cycleidx;
  var peakDampening;
  if (taxAssessmentYear >= 2021 && taxAssessmentYear <= 2023 && cycleidx < 1.0) {
    peakDampening = 1 - (cycleDelta * 1.5);
  } else {
    peakDampening = 1.0;
  }
  var taxValue = taxval * (1 / 0.75) * peakDampening;
  var taxIsDampened = (peakDampening < 1.0);

  /* Signal 3 — Peak-cycle adjusted */
  var peakValue = peakpsm * cycleidx * sqm;

  /* Fixed fritidshus weights */
  var fairVal = (compValue * 0.40) + (taxValue * 0.35) + (peakValue * 0.25);
  fairVal *= (1 + yieldAdj);

  /* Verdict */
  var gap    = (asking - fairVal) / fairVal;
  var gapPct = gap * 100;

  var vLabel, vColor, vBg;
  if (gap > 0.15) {
    vLabel = t('vOver');  vColor = '#A32D2D'; vBg = '#A32D2D12';
  } else if (gap > 0.05) {
    vLabel = t('vHigh');  vColor = '#BA7517'; vBg = '#BA751712';
  } else if (gap > -0.05) {
    vLabel = t('vFair');  vColor = '#3B6D11'; vBg = '#3B6D1112';
  } else if (gap > -0.15) {
    vLabel = t('vPot');   vColor = '#185FA5'; vBg = '#185FA512';
  } else {
    vLabel = t('vUnder'); vColor = '#185FA5'; vBg = '#185FA512';
  }

  var diffKr   = asking - fairVal;
  var diffSign = diffKr >= 0 ? '+' : '';

  /* ── Verdict card ── */
  var vc = document.getElementById('verdict-card');
  vc.classList.add('verdict-ready');
  vc.style.background  = vBg;
  vc.style.borderColor = vColor + '38';
  vc.style.color       = vColor;
  var amtEl = document.getElementById('verdict-amount');
  amtEl.textContent = fmtKr(fairVal);
  amtEl.style.color = '';
  var descEl = document.getElementById('verdict-desc');
  descEl.textContent = t('vDesc')(vLabel, fmtPct(gapPct), diffSign + fmtKr(diffKr));
  descEl.style.color = '';

  /* ── Metric tiles ── */
  document.getElementById('m-asking-psm').textContent =
    sqm > 0 ? fmtPsm(asking / sqm) : '\u2014';
  document.getElementById('m-fair-psm').textContent =
    sqm > 0 ? fmtPsm(fairVal / sqm) : '\u2014';
  document.getElementById('m-tax-ratio').textContent =
    taxval > 0 ? fmtRatio(asking / taxval) : '\u2014';

  /* ── Signal bars ── */
  var taxLabel = t('sigTax') + ' \u2014 35%' +
    (taxIsDampened ? t('dampSuffix') : '');

  var signals = [
    { name: t('sigAsking'),                value: asking,    color: '#888780', weight: null },
    { name: t('sigComp') + ' \u2014 40%', value: compValue, color: '#185FA5', weight: 0.40 },
    { name: taxLabel,                      value: taxValue,  color: '#3B6D11', weight: 0.35 },
    { name: t('sigPeak') + ' \u2014 25%', value: peakValue, color: '#BA7517', weight: 0.25 }
  ];

  var maxSig = Math.max.apply(null, signals.map(function(s) { return s.value; }));

  var signalRows = signals.map(function(s) {
    var barPct = maxSig > 0 ? (s.value / maxSig * 100).toFixed(1) : '0';
    var head = el('div', { className: 'signal-head' }, [
      el('span', { className: 'signal-name' }, [s.name]),
      el('div', { className: 'signal-right' }, [
        el('span', { className: 'signal-kr' }, [fmtKr(s.value)]),
        s.weight !== null
          ? el('span', { className: 'signal-delta' }, [
              fmtPct((s.value - asking) / asking * 100)
            ])
          : null
      ])
    ]);
    var fill = el('div', { className: 'bar-fill' }, []);
    fill.style.width      = barPct + '%';
    fill.style.background = s.color;
    var track = el('div', { className: 'bar-track' }, [fill]);
    return el('div', { className: 'signal-row' }, [head, track]);
  });

  setChildren(document.getElementById('signal-list'), signalRows);

  /* ── Factor grid ── */
  var factors = [
    { name: t('fWater'),   val: adj_water,       isInfo: false },
    { name: t('fInfra'),   val: adj_infra,        isInfo: false },
    { name: t('fCond'),    val: adj_cond,         isInfo: false },
    { name: t('fDist'),    val: adj_dist,         isInfo: false },
    { name: t('fOpex'),    val: null,             isInfo: true,
      label: (costRatio * 100).toFixed(2) + '% of asking' },
    { name: t('fMom'),     val: adj_mom,          isInfo: false },
    { name: t('fAge'),     val: age,              isInfo: false },
    { name: t('fPlot'),    val: plotBon,          isInfo: false },
    { name: t('fYield'),   val: yieldAdj,         isInfo: false },
    { name: t('fCycle'),   val: cycleidx - 1.0,  isInfo: false },
    { name: t('fHeating'), val: adj_heating,      isInfo: false },
    { name: t('fEnergy'),  val: adj_energy,       isInfo: false }
  ];

  var factorTiles = factors.map(function(f) {
    var bg, color, label;
    if (f.isInfo) {
      bg    = 'var(--bg-surface)';
      color = 'var(--text-secondary)';
      label = f.label;
    } else if (f.val > 0) {
      bg    = '#3B6D1112';
      color = '#3B6D11';
      label = fmtPct(f.val * 100);
    } else if (f.val < 0) {
      bg    = '#A32D2D12';
      color = '#A32D2D';
      label = fmtPct(f.val * 100);
    } else {
      bg    = 'var(--bg-surface)';
      color = 'var(--text-tertiary)';
      label = fmtPct(0);
    }
    var nameEl = el('span', { className: 'factor-name' }, [f.name]);
    var valEl  = el('span', { className: 'factor-val'  }, [label]);
    valEl.style.color = color;
    var tile = el('div', { className: 'factor-tile' }, [nameEl, valEl]);
    tile.style.background = bg;
    return tile;
  });

  setChildren(document.getElementById('factor-grid'), factorTiles);

  /* ── Summary note ── */
  var negRoom   = -diffKr;
  var negAbs    = Math.abs(negRoom);
  var negSign   = negRoom >= 0 ? '' : '\u2212';
  var negPctAbs = Math.abs(gapPct).toFixed(1);
  document.getElementById('summary-note').textContent =
    t('summary')(
      fmtKr(fairVal),
      (costRatio * 100).toFixed(2),
      negSign + fmtKr(negAbs),
      negSign + negPctAbs + '%'
    );
}
