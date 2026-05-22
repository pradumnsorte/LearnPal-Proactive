import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dataDir = join(root, 'src', 'P3 Data');
const outputFile = join(here, 'p3-data-analysis-codex.html');

const studyFile = join(dataDir, 'P3_Study Data.xlsx');
const logFiles = {
  Intermittent: join(dataDir, 'learnpal-intermittent-2026-05-10T14-41-34.xlsx'),
  Continuous: join(dataDir, 'learnpal-continuous-2026-05-10T14-41-23.xlsx'),
  Proactive: join(dataDir, 'learnpal-proactive-2026-05-10T14-41-43.xlsx'),
};

const conditions = ['Intermittent', 'Continuous', 'Proactive'];
const colors = {
  Intermittent: '#b89214',
  Continuous: '#2563eb',
  Proactive: '#dc345d',
};
const softColors = {
  Intermittent: '#fff4cc',
  Continuous: '#e8f0ff',
  Proactive: '#ffe6ec',
};
const idKey = 'Participant ID (Ask me)';
const conditionOf = (id) =>
  id.startsWith('I') ? 'Intermittent' : id.startsWith('C') ? 'Continuous' : 'Proactive';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const score = (value) => {
  const match = String(value ?? '').match(/([0-9.]+)\s*\/\s*([0-9.]+)/);
  return match ? Number(match[1]) : num(value);
};
const finite = (values) => values.filter(Number.isFinite);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => {
  const valid = finite(values);
  return valid.length ? sum(valid) / valid.length : NaN;
};
const median = (values) => {
  const valid = finite(values).sort((a, b) => a - b);
  if (!valid.length) return NaN;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
};
const format = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'NA');
const signed = (value, digits = 1) =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}` : 'NA';
const pct = (value, digits = 0) => (Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : 'NA');
const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const rowsFrom = (workbook, sheetName) =>
  XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });

const rank = (values) => {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  for (let index = 0; index < sorted.length; ) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1;
    const average = (index + 1 + end) / 2;
    for (let tie = index; tie < end; tie += 1) ranks[sorted[tie].index] = average;
    index = end;
  }
  return ranks;
};

const spearman = (pairs) => {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (valid.length < 3) return NaN;
  const rx = rank(valid.map(([x]) => x));
  const ry = rank(valid.map(([, y]) => y));
  const mx = mean(rx);
  const my = mean(ry);
  const numerator = sum(rx.map((x, i) => (x - mx) * (ry[i] - my)));
  const denomX = Math.sqrt(sum(rx.map((x) => (x - mx) ** 2)));
  const denomY = Math.sqrt(sum(ry.map((y) => (y - my) ** 2)));
  return numerator / (denomX * denomY);
};

const wilcoxonSignedRank = (differences) => {
  const nonZero = finite(differences)
    .filter((difference) => difference !== 0)
    .map((difference) => ({ difference, abs: Math.abs(difference) }));
  const ranks = rank(nonZero.map(({ abs }) => abs));
  const totalRank = sum(ranks);
  const positive = sum(nonZero.map(({ difference }, index) => (difference > 0 ? ranks[index] : 0)));
  const observed = Math.min(positive, totalRank - positive);
  const combinations = 2 ** nonZero.length;
  let asExtreme = 0;
  for (let mask = 0; mask < combinations; mask += 1) {
    let permPositive = 0;
    for (let index = 0; index < ranks.length; index += 1) {
      if (mask & (1 << index)) permPositive += ranks[index];
    }
    if (Math.min(permPositive, totalRank - permPositive) <= observed + 1e-12) asExtreme += 1;
  }
  return {
    n: nonZero.length,
    p: asExtreme / combinations,
    rankBiserial: (positive - (totalRank - positive)) / totalRank,
  };
};

const seededRandom = (seed = 42) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};
const shuffle = (values, random) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

const kruskalPermutation = (items, key, iterations = 12000, seed = 123) => {
  const valid = items
    .map((item) => ({ group: item.condition, value: item[key] }))
    .filter(({ value }) => Number.isFinite(value));
  const values = valid.map(({ value }) => value);
  const ranks = rank(values);
  const labels = valid.map(({ group }) => group);
  const groups = [...new Set(labels)];
  const tieCounts = new Map();
  values.forEach((value) => tieCounts.set(value, (tieCounts.get(value) ?? 0) + 1));
  const n = valid.length;
  const tieCorrection = 1 - sum([...tieCounts.values()].map((count) => count ** 3 - count)) / (n ** 3 - n);

  const hFor = (groupLabels) => {
    const byGroup = new Map(groups.map((group) => [group, []]));
    groupLabels.forEach((group, index) => byGroup.get(group).push(ranks[index]));
    const raw =
      (12 / (n * (n + 1))) *
        sum(groups.map((group) => {
          const groupRanks = byGroup.get(group);
          return sum(groupRanks) ** 2 / groupRanks.length;
        })) -
      3 * (n + 1);
    return raw / tieCorrection;
  };

  const observed = hFor(labels);
  const random = seededRandom(seed);
  let atLeast = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (hFor(shuffle(labels, random)) >= observed - 1e-12) atLeast += 1;
  }
  return {
    h: observed,
    p: (atLeast + 1) / (iterations + 1),
    epsilon: Math.max(0, (observed - groups.length + 1) / (n - groups.length)),
  };
};

const study = XLSX.readFile(studyFile, { cellDates: true });
const form1 = rowsFrom(study, 'Form Responses 1');
const form2 = rowsFrom(study, 'Form Responses 2');
const form3 = rowsFrom(study, 'Form Responses 3');
const form4 = rowsFrom(study, 'Form Responses 4');
const form5 = rowsFrom(study, 'Form Responses 5');

const form1Map = Object.fromEntries(form1.map((row) => [row[idKey], row]));
const preKnowledgeMap = Object.fromEntries(form2.map((row) => [row[idKey], score(row.Score)]));
const preMap = Object.fromEntries(form3.map((row) => [row[idKey], score(row.Score)]));
const postMap = Object.fromEntries(form4.map((row) => [row[idKey], score(row.Score)]));
const form5Map = Object.fromEntries(form5.map((row) => [row[idKey], row]));

const form5Columns = Object.keys(form5[0]);
const ues = {
  interest: form5Columns[2],
  aesthetic: form5Columns[3],
  worthwhile: form5Columns[4],
  confusing: form5Columns[5],
  absorbed: form5Columns[6],
  rewarding: form5Columns[7],
  lost: form5Columns[8],
  attractive: form5Columns[9],
  frustrated: form5Columns[10],
  senses: form5Columns[11],
  taxing: form5Columns[12],
  timeSlip: form5Columns[13],
  helped: form5Columns[14],
  relevant: form5Columns[15],
  timing: form5Columns[16],
  control: form5Columns[17],
  distracted: form5Columns[18],
  overloaded: form5Columns[19],
};

const familiarityColumns = Object.keys(form1[0]).filter((header) => header.startsWith('10.'));
const comparableMap = new Map();
const eventCounts = new Map();
const messagesBySource = Object.fromEntries(conditions.map((condition) => [condition, {}]));

for (const [condition, file] of Object.entries(logFiles)) {
  const workbook = XLSX.readFile(file, { cellDates: true });
  rowsFrom(workbook, 'Comparable').forEach((row) => comparableMap.set(row.participant_id, row));
  rowsFrom(workbook, 'Events').forEach((row) => {
    if (!eventCounts.has(row.participant_id)) eventCounts.set(row.participant_id, {});
    const counts = eventCounts.get(row.participant_id);
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
  });
  rowsFrom(workbook, 'Messages')
    .filter((row) => row.role === 'user')
    .forEach((row) => {
      messagesBySource[condition][row.source] = (messagesBySource[condition][row.source] ?? 0) + 1;
    });
}

const participants = [...new Set(Object.keys(preMap))]
  .sort()
  .map((id) => {
    const condition = conditionOf(id);
    const f1 = form1Map[id] ?? {};
    const f5 = form5Map[id] ?? {};
    const comparable = comparableMap.get(id) ?? {};
    const events = eventCounts.get(id) ?? {};
    const value = (key) => num(f5[ues[key]]);
    const reverse = (key) => 6 - value(key);
    const focused = mean([value('absorbed'), value('lost'), value('timeSlip')]);
    const usability = mean([reverse('confusing'), reverse('frustrated'), reverse('taxing')]);
    const aesthetic = mean([value('aesthetic'), value('attractive'), value('senses')]);
    const reward = mean([value('interest'), value('worthwhile'), value('rewarding')]);
    const pre = preMap[id];
    const post = postMap[id];
    const gain = post - pre;
    const normalizedGain = pre < 20 ? gain / (20 - pre) : NaN;
    const numeric = (key) => {
      const parsed = num(comparable[key]);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const feedUnlocked = events.feed_question_unlocked ?? 0;
    const keywordShown = events.keyword_shown ?? 0;
    const keywordPositive =
      (events.keyword_later ?? 0) + (events.keyword_pinned ?? 0) + (events.keyword_detail ?? 0);
    const keywordNonEngagement = (events.keyword_ignored ?? 0) + (events.keyword_dismissed ?? 0);

    return {
      id,
      condition,
      preKnowledge: preKnowledgeMap[id],
      familiarity: mean(familiarityColumns.map((column) => num(f1[column]))),
      pre,
      post,
      gain,
      normalizedGain,
      focused,
      usability,
      aesthetic,
      reward,
      uesOverall: mean([focused, usability, aesthetic, reward]),
      aiHelped: value('helped'),
      aiRelevant: value('relevant'),
      aiTiming: value('timing'),
      aiControl: value('control'),
      aiDistracted: value('distracted'),
      aiOverloaded: value('overloaded'),
      duration: numeric('session_duration_seconds'),
      firstInteraction: numeric('time_to_first_interaction_seconds'),
      chatMessages: numeric('chat_messages_sent'),
      pauses: numeric('video_pauses'),
      seeks: numeric('video_seeks_total'),
      quizAttempts: numeric('quiz_attempts_total'),
      quizCorrect: numeric('quiz_correct'),
      featureEngagements: numeric('paradigm_feature_engagements'),
      suggestionsShown: numeric('ai_suggestions_shown'),
      suggestionsAccepted: numeric('ai_suggestions_accepted'),
      suggestionsRejected: numeric('ai_suggestions_rejected'),
      icapActive: numeric('icap_active_events'),
      icapConstructive: numeric('icap_constructive_events'),
      videoControlActions: numeric('video_pauses') + numeric('video_seeks_total'),
      feedAnswerRate: feedUnlocked ? (events.feed_question_answered ?? 0) / feedUnlocked : NaN,
      feedJumpPerUnlock: feedUnlocked ? (events.feed_question_jumped ?? 0) / feedUnlocked : NaN,
      keywordExplicitRate: keywordShown ? keywordPositive / keywordShown : NaN,
      keywordPositive,
      keywordNonEngagement,
      events,
    };
  });

const group = Object.fromEntries(
  conditions.map((condition) => {
    const rows = participants.filter((participant) => participant.condition === condition);
    const avg = (key) => mean(rows.map((row) => row[key]));
    return [
      condition,
      {
        n: rows.length,
        pre: avg('pre'),
        post: avg('post'),
        gain: avg('gain'),
        medianGain: median(rows.map((row) => row.gain)),
        normalizedGain: avg('normalizedGain'),
        uesOverall: avg('uesOverall'),
        focused: avg('focused'),
        usability: avg('usability'),
        aesthetic: avg('aesthetic'),
        reward: avg('reward'),
        aiHelped: avg('aiHelped'),
        aiRelevant: avg('aiRelevant'),
        aiTiming: avg('aiTiming'),
        aiControl: avg('aiControl'),
        aiDistracted: avg('aiDistracted'),
        aiOverloaded: avg('aiOverloaded'),
        duration: avg('duration'),
        firstInteraction: avg('firstInteraction'),
        chatMessages: avg('chatMessages'),
        quizAttempts: avg('quizAttempts'),
        quizCorrect: avg('quizCorrect'),
        featureEngagements: avg('featureEngagements'),
        icapActive: avg('icapActive'),
        icapConstructive: avg('icapConstructive'),
        feedAnswerRate: avg('feedAnswerRate'),
        keywordExplicitRate: avg('keywordExplicitRate'),
        keywordNonEngagement: avg('keywordNonEngagement'),
      },
    ];
  })
);

const allGain = wilcoxonSignedRank(participants.map((participant) => participant.gain));
const kwGain = kruskalPermutation(participants, 'gain', 20000, 302);
const kwControl = kruskalPermutation(participants, 'aiControl', 20000, 305);
const kwDistracted = kruskalPermutation(participants, 'aiDistracted', 20000, 306);
const kwFeature = kruskalPermutation(participants, 'featureEngagements', 20000, 308);
const rhoBaselineGain = spearman(participants.map((participant) => [participant.pre, participant.gain]));
const rhoDistractionUes = spearman(participants.map((participant) => [participant.aiDistracted, participant.uesOverall]));
const rhoControlDistraction = spearman(
  participants.map((participant) => [participant.aiControl, participant.aiDistracted])
);
const rhoFeatureGain = spearman(participants.map((participant) => [participant.featureEngagements, participant.gain]));

const svg = {
  line(x1, y1, x2, y2, attrs = '') {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
  },
  text(x, y, text, attrs = '') {
    return `<text x="${x}" y="${y}" ${attrs}>${esc(text)}</text>`;
  },
  circle(cx, cy, r, attrs = '') {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs}/>`;
  },
  rect(x, y, width, height, attrs = '') {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${attrs}/>`;
  },
};

const slopeChart = () => {
  const width = 780;
  const height = 430;
  const left = 130;
  const right = 650;
  const top = 38;
  const bottom = 358;
  const y = (value) => bottom - (value / 20) * (bottom - top);
  const ticks = [0, 5, 10, 15, 20]
    .map(
      (tick) =>
        `${svg.line(left - 20, y(tick), right + 20, y(tick), 'class="grid-line"')}${svg.text(
          left - 34,
          y(tick) + 4,
          tick,
          'class="axis-label" text-anchor="end"'
        )}`
    )
    .join('');
  const paths = participants
    .map((participant) => {
      const color = colors[participant.condition];
      const y1 = y(participant.pre);
      const y2 = y(participant.post);
      return `<g class="point-row">
        ${svg.line(left, y1, right, y2, `stroke="${color}" class="slope-line"`)}
        ${svg.circle(left, y1, 5.2, `fill="${color}" class="dot"`)}
        ${svg.circle(right, y2, 5.2, `fill="${color}" class="dot"`)}
        ${svg.text(left - 12, y1 + 4, `${participant.id} ${participant.pre}`, 'class="small-label" text-anchor="end"')}
        ${svg.text(right + 12, y2 + 4, `${participant.post} ${participant.id}`, 'class="small-label"')}
        <title>${participant.id}: ${participant.pre} to ${participant.post}, gain ${signed(participant.gain, 0)}</title>
      </g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Participant pre-test to post-test slope chart">
    ${ticks}
    ${svg.text(left, 22, 'Pre-test', 'class="axis-title" text-anchor="middle"')}
    ${svg.text(right, 22, 'Post-test', 'class="axis-title" text-anchor="middle"')}
    ${paths}
  </svg>`;
};

const barChart = (items, options = {}) => {
  const width = options.width ?? 760;
  const rowHeight = options.rowHeight ?? 38;
  const left = options.left ?? 190;
  const right = width - 48;
  const top = 28;
  const max = options.max ?? Math.max(...items.map((item) => item.value));
  const height = top + items.length * rowHeight + 28;
  const valueX = (value) => left + (value / max) * (right - left);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label ?? 'bar chart')}">
    ${items
      .map((item, index) => {
        const y = top + index * rowHeight;
        const barWidth = Math.max(2, valueX(item.value) - left);
        return `<g>
          ${svg.text(left - 12, y + 17, item.label, 'class="bar-label" text-anchor="end"')}
          ${svg.rect(left, y, right - left, 18, 'class="bar-track" rx="4"')}
          ${svg.rect(left, y, barWidth, 18, `fill="${item.color}" rx="4"`)}
          ${svg.text(left + barWidth + 8, y + 14, item.display ?? format(item.value), 'class="bar-value"')}
        </g>`;
      })
      .join('')}
  </svg>`;
};

const groupedBars = () => {
  const metrics = [
    ['Gain', 'gain', 6],
    ['Norm. gain', 'normalizedGain', 0.5],
    ['UES', 'uesOverall', 4.2],
    ['Control', 'aiControl', 5],
    ['Distract', 'aiDistracted', 5],
  ];
  const width = 820;
  const height = 340;
  const left = 78;
  const right = 786;
  const top = 28;
  const bottom = 275;
  const groupWidth = (right - left) / metrics.length;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grouped condition comparison">
    ${metrics
      .map(([label], index) =>
        svg.text(left + index * groupWidth + groupWidth / 2, bottom + 34, label, 'class="axis-label" text-anchor="middle"')
      )
      .join('')}
    ${metrics
      .flatMap(([label, key, max], metricIndex) =>
        conditions.map((condition, conditionIndex) => {
          const value = group[condition][key];
          const barWidth = 18;
          const gap = 6;
          const x =
            left +
            metricIndex * groupWidth +
            groupWidth / 2 -
            ((barWidth + gap) * conditions.length) / 2 +
            conditionIndex * (barWidth + gap);
          const h = (value / max) * (bottom - top);
          const y = bottom - h;
          return `<g>
            ${svg.rect(x, y, barWidth, h, `fill="${colors[condition]}" rx="4"`)}
            <title>${condition} ${label}: ${format(value)}</title>
          </g>`;
        })
      )
      .join('')}
    ${[0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => {
        const y = bottom - ratio * (bottom - top);
        return svg.line(left - 10, y, right, y, 'class="grid-line"');
      })
      .join('')}
    ${conditions
      .map((condition, index) => {
        const x = left + index * 145;
        return `${svg.circle(x, 318, 6, `fill="${colors[condition]}"`)}${svg.text(
          x + 12,
          322,
          condition,
          'class="legend-text"'
        )}`;
      })
      .join('')}
  </svg>`;
};

const tradeoffMap = () => {
  const width = 760;
  const height = 420;
  const left = 72;
  const right = 705;
  const top = 42;
  const bottom = 346;
  const x = (value) => left + ((value - 1) / 4) * (right - left);
  const y = (value) => bottom - ((value - 1) / 4) * (bottom - top);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="AI control and distraction trade-off map">
    ${[1, 2, 3, 4, 5]
      .map(
        (tick) =>
          `${svg.line(x(tick), top, x(tick), bottom, 'class="grid-line"')}${svg.line(
            left,
            y(tick),
            right,
            y(tick),
            'class="grid-line"'
          )}${svg.text(x(tick), bottom + 24, tick, 'class="axis-label" text-anchor="middle"')}${svg.text(
            left - 22,
            y(tick) + 4,
            tick,
            'class="axis-label" text-anchor="end"'
          )}`
      )
      .join('')}
    ${svg.text((left + right) / 2, 395, 'Felt in control of AI support', 'class="axis-title" text-anchor="middle"')}
    ${svg.text(20, (top + bottom) / 2, 'AI distraction', 'class="axis-title vertical" text-anchor="middle"')}
    ${conditions
      .map((condition) => {
        const g = group[condition];
        const radius = 12 + g.gain * 2.4;
        return `<g>
          ${svg.circle(x(g.aiControl), y(g.aiDistracted), radius, `fill="${colors[condition]}" class="bubble"`)}
          ${svg.text(x(g.aiControl), y(g.aiDistracted) + radius + 18, condition, 'class="bubble-label" text-anchor="middle"')}
          <title>${condition}: control ${format(g.aiControl)}, distraction ${format(g.aiDistracted)}, gain ${format(g.gain)}</title>
        </g>`;
      })
      .join('')}
  </svg>`;
};

const evidenceMap = () => {
  const items = [
    {
      label: 'Learning improved overall',
      stat: `Wilcoxon p = ${format(allGain.p, 4)}`,
      strength: 0.92,
      tone: '#149c68',
      text: 'The full sample moved upward from pre-test to post-test.',
    },
    {
      label: 'Learning differs by condition',
      stat: `KW p = ${format(kwGain.p, 4)}`,
      strength: 0.18,
      tone: '#9a7b12',
      text: 'Condition-level learning differences are descriptive, not inferential.',
    },
    {
      label: 'Control differs by condition',
      stat: `KW p = ${format(kwControl.p, 4)}`,
      strength: 0.72,
      tone: '#2563eb',
      text: 'Learner agency changes measurably across prototypes.',
    },
    {
      label: 'Distraction differs by condition',
      stat: `KW p = ${format(kwDistracted.p, 4)}`,
      strength: 0.78,
      tone: '#dc345d',
      text: 'The initiative trade-off is visible in burden ratings.',
    },
    {
      label: 'Behavior differs by condition',
      stat: `KW p < 0.0001`,
      strength: 0.98,
      tone: '#5b21b6',
      text: 'The prototypes clearly changed what participants did.',
    },
  ];
  return items
    .map(
      (item) => `<article class="evidence-row">
        <div>
          <h3>${item.label}</h3>
          <p>${item.text}</p>
        </div>
        <div class="evidence-stat">${item.stat}</div>
        <div class="strength" aria-hidden="true">
          <span style="width:${item.strength * 100}%; background:${item.tone};"></span>
        </div>
      </article>`
    )
    .join('');
};

const participantMatrix = () => {
  const metricCells = [
    ['Pre', 'pre', 20, false],
    ['Post', 'post', 20, false],
    ['Gain', 'gain', 12, false],
    ['UES', 'uesOverall', 5, false],
    ['Control', 'aiControl', 5, false],
    ['Distract', 'aiDistracted', 5, true],
    ['Features', 'featureEngagements', 70, false],
  ];
  const cellStyle = (value, max, inverse = false) => {
    if (!Number.isFinite(value)) return '';
    const ratio = Math.max(0, Math.min(1, value / max));
    const useful = inverse ? 1 - ratio : ratio;
    const hue = 8 + useful * 142;
    return `background:hsl(${hue} 66% 90%); color:#171717;`;
  };
  return `<table class="matrix">
    <thead>
      <tr><th>Participant</th><th>Condition</th>${metricCells.map(([label]) => `<th>${label}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${participants
        .map(
          (participant) => `<tr>
            <th>${participant.id}</th>
            <td><span class="condition-pill" style="--pill:${colors[participant.condition]}; --pill-bg:${softColors[participant.condition]}">${participant.condition}</span></td>
            ${metricCells
              .map(([label, key, max, inverse]) => {
                const value = participant[key];
                const display =
                  key === 'gain'
                    ? signed(value, 0)
                    : key === 'uesOverall' || key.startsWith('ai')
                      ? format(value, 1)
                      : format(value, 0);
                return `<td class="num" style="${cellStyle(value, max, inverse)}" title="${participant.id} ${label}: ${display}">${display}</td>`;
              })
              .join('')}
          </tr>`
        )
        .join('')}
    </tbody>
  </table>`;
};

const behaviorFunnel = () => {
  const intermittentActions =
    sum(participants.filter((p) => p.condition === 'Intermittent').map((p) => p.chatMessages)) +
    sum(participants.filter((p) => p.condition === 'Intermittent').map((p) => p.quizAttempts)) +
    sum(participants.filter((p) => p.condition === 'Intermittent').map((p) => p.events.snap_completed ?? 0));
  const continuousUnlocked = sum(participants.filter((p) => p.condition === 'Continuous').map((p) => p.events.feed_question_unlocked ?? 0));
  const continuousAnswered = sum(participants.filter((p) => p.condition === 'Continuous').map((p) => p.events.feed_question_answered ?? 0));
  const continuousJumps = sum(participants.filter((p) => p.condition === 'Continuous').map((p) => p.events.feed_question_jumped ?? 0));
  const proactiveKeywords = sum(participants.filter((p) => p.condition === 'Proactive').map((p) => p.events.keyword_shown ?? 0));
  const proactivePositive = sum(participants.filter((p) => p.condition === 'Proactive').map((p) => p.keywordPositive));
  const proactiveNon = sum(participants.filter((p) => p.condition === 'Proactive').map((p) => p.keywordNonEngagement));
  const proactiveQuizTriggered = sum(participants.filter((p) => p.condition === 'Proactive').map((p) => p.events.quiz_triggered ?? 0));
  const proactiveQuizAnswered = sum(
    participants.filter((p) => p.condition === 'Proactive').map((p) => (p.events.quiz_correct ?? 0) + (p.events.quiz_wrong ?? 0))
  );
  const blocks = [
    {
      title: 'Intermittent',
      subtitle: 'Deliberate learner-initiated actions',
      color: colors.Intermittent,
      items: [
        ['Chat messages', 17],
        ['Quiz attempts', 34],
        ['Completed snaps', 9],
        ['Self-initiated total', intermittentActions],
      ],
    },
    {
      title: 'Continuous',
      subtitle: 'Ambient feed uptake',
      color: colors.Continuous,
      items: [
        ['Feed questions unlocked', continuousUnlocked],
        ['Feed questions answered', continuousAnswered],
        ['Feed question jumps', continuousJumps],
        ['Answer rate', continuousAnswered / continuousUnlocked, 'percent'],
      ],
    },
    {
      title: 'Proactive',
      subtitle: 'Prompt exposure vs explicit uptake',
      color: colors.Proactive,
      items: [
        ['Keywords shown', proactiveKeywords],
        ['Keyword positive actions', proactivePositive],
        ['Ignored or dismissed', proactiveNon],
        ['Quiz answered / triggered', proactiveQuizAnswered / proactiveQuizTriggered, 'percent'],
      ],
    },
  ];

  return blocks
    .map((block) => {
      const max = Math.max(...block.items.filter(([, , type]) => type !== 'percent').map(([, value]) => value));
      return `<article class="prototype-block">
        <h3>${block.title}</h3>
        <p>${block.subtitle}</p>
        ${block.items
          .map(([label, value, type]) => {
            const width = type === 'percent' ? value * 100 : (value / max) * 100;
            const display = type === 'percent' ? pct(value) : format(value, 0);
            return `<div class="mini-bar">
              <div class="mini-label"><span>${label}</span><strong>${display}</strong></div>
              <div class="mini-track"><span style="width:${Math.min(100, width)}%; background:${block.color};"></span></div>
            </div>`;
          })
          .join('')}
      </article>`;
    })
    .join('');
};

const correlationGrid = () => {
  const rows = [
    ['Baseline pre-test -> raw gain', rhoBaselineGain, 'Room-to-improve effect'],
    ['Feature volume -> raw gain', rhoFeatureGain, 'More UI activity was not enough by itself'],
    ['AI distraction -> UES', rhoDistractionUes, 'Distraction is the strongest experience penalty'],
    ['AI control -> AI distraction', rhoControlDistraction, 'Lower control travels with higher distraction'],
  ];
  return rows
    .map(
      ([label, rho, note]) => `<article class="corr-card">
        <div class="rho ${rho < 0 ? 'negative' : 'positive'}">${rho >= 0 ? '+' : ''}${format(rho, 2)}</div>
        <h3>${label}</h3>
        <p>${note}</p>
      </article>`
    )
    .join('');
};

const generatedDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LearnPal P3 Study - Codex Evidence Dashboard</title>
  <link rel="icon" href="../../src/assets/LearnPal-Favicon.svg" type="image/svg+xml">
  <style>
    :root {
      --bg: #f7f7f2;
      --ink: #191a1d;
      --muted: #666b76;
      --line: #dddcd2;
      --panel: #ffffff;
      --panel-soft: #fbfbf6;
      --gold: #b89214;
      --blue: #2563eb;
      --rose: #dc345d;
      --green: #149c68;
      --purple: #5b21b6;
      --shadow: 0 1px 2px rgba(20,20,20,0.05);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--line);
      background: rgba(247,247,242,0.94);
      backdrop-filter: blur(10px);
    }
    .topbar-inner {
      max-width: 1180px;
      margin: 0 auto;
      padding: 12px 28px;
      display: flex;
      gap: 18px;
      align-items: center;
      flex-wrap: wrap;
    }
    .brand {
      font-weight: 760;
      letter-spacing: 0;
    }
    nav {
      margin-left: auto;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 0.88rem;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 6px 8px;
      border-radius: 6px;
    }
    nav a:hover { background: #ecebe2; color: var(--ink); }
    header, section, footer {
      max-width: 1180px;
      margin: 0 auto;
      padding: 42px 28px;
    }
    header {
      padding-top: 58px;
      padding-bottom: 28px;
    }
    .kicker {
      color: var(--muted);
      font-size: 0.88rem;
      font-weight: 680;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    h1 {
      max-width: 960px;
      margin: 12px 0 14px;
      font-size: clamp(2.2rem, 5vw, 5.2rem);
      line-height: 0.98;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: clamp(1.55rem, 2.4vw, 2.3rem);
      line-height: 1.12;
      letter-spacing: 0;
    }
    h3 {
      margin: 0 0 7px;
      font-size: 1rem;
      line-height: 1.25;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: #30343b;
    }
    .lede {
      max-width: 880px;
      font-size: 1.12rem;
      color: #343840;
    }
    .thesis {
      margin-top: 26px;
      max-width: 980px;
      padding: 18px 0 0;
      border-top: 2px solid var(--ink);
      font-size: clamp(1.25rem, 2vw, 1.7rem);
      line-height: 1.28;
      font-weight: 680;
    }
    .band {
      border-top: 1px solid var(--line);
    }
    .grid {
      display: grid;
      gap: 18px;
    }
    .grid.two { grid-template-columns: 1fr 1fr; }
    .grid.three { grid-template-columns: repeat(3, 1fr); }
    .grid.four { grid-template-columns: repeat(4, 1fr); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 20px;
    }
    .panel.flush { padding: 0; overflow: hidden; }
    .section-head {
      display: grid;
      grid-template-columns: minmax(0, 0.85fr) minmax(280px, 0.55fr);
      gap: 28px;
      align-items: end;
      margin-bottom: 24px;
    }
    .note {
      font-size: 0.92rem;
      color: var(--muted);
    }
    .metric-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-top: 28px;
    }
    .metric {
      border-top: 3px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 18px;
      box-shadow: var(--shadow);
    }
    .metric strong {
      display: block;
      font-size: 2rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      margin-bottom: 8px;
    }
    .metric span {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .evidence-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 160px 210px;
      gap: 18px;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
    }
    .evidence-row:last-child { border-bottom: 0; }
    .evidence-row p, .prototype-block p, .corr-card p { font-size: 0.92rem; color: var(--muted); }
    .evidence-stat {
      font-weight: 730;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .strength {
      height: 10px;
      background: #ecebe2;
      border-radius: 999px;
      overflow: hidden;
    }
    .strength span { display: block; height: 100%; border-radius: inherit; }
    svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .grid-line { stroke: #e3e2d8; stroke-width: 1; }
    .axis-label, .small-label, .legend-text, .bar-label, .bar-value {
      font-size: 12px;
      fill: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .axis-title {
      font-size: 13px;
      fill: #3b3f46;
      font-weight: 720;
    }
    .vertical {
      transform: rotate(-90deg);
      transform-origin: 20px center;
    }
    .slope-line { stroke-width: 2; opacity: 0.58; }
    .dot { stroke: #fff; stroke-width: 1.5; }
    .bar-track { fill: #eeede4; }
    .bubble { opacity: 0.82; stroke: #fff; stroke-width: 2; }
    .bubble-label {
      font-size: 13px;
      fill: #20242a;
      font-weight: 720;
    }
    .prototype-block {
      border-left: 5px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 18px;
      box-shadow: var(--shadow);
    }
    .prototype-block:nth-child(1) { border-left-color: var(--gold); }
    .prototype-block:nth-child(2) { border-left-color: var(--blue); }
    .prototype-block:nth-child(3) { border-left-color: var(--rose); }
    .mini-bar { margin-top: 14px; }
    .mini-label {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.9rem;
      margin-bottom: 5px;
    }
    .mini-label strong { font-variant-numeric: tabular-nums; }
    .mini-track {
      height: 8px;
      background: #ecebe2;
      border-radius: 999px;
      overflow: hidden;
    }
    .mini-track span { display: block; height: 100%; border-radius: inherit; }
    .corr-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      box-shadow: var(--shadow);
    }
    .rho {
      font-size: 2rem;
      line-height: 1;
      font-weight: 780;
      font-variant-numeric: tabular-nums;
      margin-bottom: 12px;
    }
    .rho.negative { color: var(--rose); }
    .rho.positive { color: var(--blue); }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 820px;
      background: var(--panel);
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      font-size: 0.9rem;
    }
    th {
      color: var(--muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .condition-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 4px 8px;
      border-radius: 999px;
      color: #16181c;
      background: var(--pill-bg);
      white-space: nowrap;
    }
    .condition-pill::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--pill);
    }
    .insight-list {
      display: grid;
      gap: 12px;
      counter-reset: insight;
    }
    .insight {
      counter-increment: insight;
      display: grid;
      grid-template-columns: 48px 1fr;
      gap: 14px;
      align-items: start;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
    }
    .insight::before {
      content: counter(insight);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--ink);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 780;
    }
    footer {
      color: var(--muted);
      font-size: 0.9rem;
      padding-bottom: 70px;
    }
    @media (max-width: 900px) {
      .grid.two, .grid.three, .grid.four, .section-head, .metric-strip {
        grid-template-columns: 1fr;
      }
      nav { margin-left: 0; }
      .evidence-row {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .evidence-stat { text-align: left; }
      header, section, footer { padding-left: 18px; padding-right: 18px; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">LearnPal P3 Evidence Dashboard</div>
      <nav aria-label="Page sections">
        <a href="#evidence">Evidence</a>
        <a href="#learning">Learning</a>
        <a href="#experience">Experience</a>
        <a href="#behavior">Behavior</a>
        <a href="#participants">Participants</a>
        <a href="#takeaways">Takeaways</a>
      </nav>
    </div>
  </div>

  <header>
    <div class="kicker">21 participants · 3 prototype conditions · exploratory analysis</div>
    <h1>AI initiative changed the experience more clearly than it changed test scores.</h1>
    <p class="lede">This page reads the P3 data as an evidence map: learning outcomes, perceived control, distraction, and logged interaction behavior are shown together so the trade-off between learner agency and AI initiative is visible.</p>
    <div class="thesis">The strongest defensible claim is not that one prototype wins. The data supports a design trade-off: Intermittent preserves control, Continuous balances support and performance, and Proactive drives activity while increasing subjective cost.</div>
    <div class="metric-strip">
      <div class="metric" style="border-top-color:var(--green)"><strong>21</strong><span>participants, balanced across I/C/P conditions</span></div>
      <div class="metric" style="border-top-color:var(--green)"><strong>${signed(mean(participants.map((p) => p.gain)), 2)}</strong><span>mean pre-post gain across all participants</span></div>
      <div class="metric" style="border-top-color:var(--blue)"><strong>${format(group.Continuous.post, 2)}</strong><span>highest mean post-test score, Continuous</span></div>
      <div class="metric" style="border-top-color:var(--rose)"><strong>${signed(group.Proactive.gain, 2)}</strong><span>largest raw gain, Proactive, from lowest baseline</span></div>
    </div>
  </header>

  <section id="evidence" class="band">
    <div class="section-head">
      <div>
        <h2>What survives statistical checking?</h2>
        <p>The sample is small, so the page emphasizes effect direction, behavioral separation, and triangulation. Learning gains are real overall; condition-level learning differences remain underpowered.</p>
      </div>
      <p class="note">Tests are exploratory: exact Wilcoxon for pre-post change and permutation Kruskal-Wallis for condition differences. P-values are evidence-strength markers, not final claims.</p>
    </div>
    <div class="panel">${evidenceMap()}</div>
  </section>

  <section id="learning" class="band">
    <div class="section-head">
      <div>
        <h2>Learning: improvement is real, but the condition winner is not settled.</h2>
        <p>Every condition improved descriptively. Proactive shows the largest raw gain, while Continuous has the highest final score and normalized gain.</p>
      </div>
      <p class="note">Baseline matters: Spearman rho between pre-test score and raw gain is ${format(rhoBaselineGain, 2)}. Lower starting scores had more room to improve.</p>
    </div>
    <div class="grid two">
      <div class="panel">
        <h3>Participant-level pre to post movement</h3>
        ${slopeChart()}
      </div>
      <div class="panel">
        <h3>Group comparison, scaled by metric</h3>
        ${groupedBars()}
      </div>
    </div>
  </section>

  <section id="experience" class="band">
    <div class="section-head">
      <div>
        <h2>Experience: the agency cost is the clearest condition-level signal.</h2>
        <p>Intermittent sits in the high-control, low-distraction region. Proactive creates more AI-mediated moments but moves leftward on control and upward on distraction.</p>
      </div>
      <p class="note">Condition checks: control p = ${format(kwControl.p, 4)}, distraction p = ${format(kwDistracted.p, 4)}. UES relates strongly to distraction: rho = ${format(rhoDistractionUes, 2)}.</p>
    </div>
    <div class="grid two">
      <div class="panel">
        <h3>Control vs distraction, bubble size = raw gain</h3>
        ${tradeoffMap()}
      </div>
      <div class="grid">
        <div class="panel">
          <h3>Condition means</h3>
          ${barChart(
            [
              { label: 'Intermittent UES', value: group.Intermittent.uesOverall, color: colors.Intermittent },
              { label: 'Continuous UES', value: group.Continuous.uesOverall, color: colors.Continuous },
              { label: 'Proactive UES', value: group.Proactive.uesOverall, color: colors.Proactive },
              { label: 'Intermittent control', value: group.Intermittent.aiControl, color: colors.Intermittent },
              { label: 'Continuous control', value: group.Continuous.aiControl, color: colors.Continuous },
              { label: 'Proactive control', value: group.Proactive.aiControl, color: colors.Proactive },
            ],
            { max: 5, rowHeight: 34, label: 'UES and control means' }
          )}
        </div>
        <div class="panel">
          <h3>Correlation checks</h3>
          <div class="grid two">${correlationGrid()}</div>
        </div>
      </div>
    </div>
  </section>

  <section id="behavior" class="band">
    <div class="section-head">
      <div>
        <h2>Behavior: the manipulation worked.</h2>
        <p>The clearest behavioral result is not subtle: the prototypes produced very different forms of interaction. Feature-engagement differences are large and statistically visible even with the small sample.</p>
      </div>
      <p class="note">Feature engagements: Intermittent ${format(group.Intermittent.featureEngagements, 1)}, Continuous ${format(group.Continuous.featureEngagements, 1)}, Proactive ${format(group.Proactive.featureEngagements, 1)} per participant on average; KW p &lt; 0.0001.</p>
    </div>
    <div class="grid three">${behaviorFunnel()}</div>
    <div class="grid two" style="margin-top:18px;">
      <div class="panel">
        <h3>Mean behavior counts per participant</h3>
        ${barChart(
          conditions.flatMap((condition) => [
            { label: `${condition} quizzes`, value: group[condition].quizAttempts, color: colors[condition] },
            { label: `${condition} chats`, value: group[condition].chatMessages, color: colors[condition] },
            { label: `${condition} features`, value: group[condition].featureEngagements, color: colors[condition] },
          ]),
          { max: 60, rowHeight: 30, label: 'Mean behavior counts' }
        )}
      </div>
      <div class="panel">
        <h3>Chat sources across conditions</h3>
        ${barChart(
          conditions.flatMap((condition) =>
            Object.entries(messagesBySource[condition]).map(([source, value]) => ({
              label: `${condition} · ${source.replaceAll('_', ' ')}`,
              value,
              color: colors[condition],
            }))
          ),
          { max: 14, rowHeight: 29, label: 'Chat message sources' }
        )}
      </div>
    </div>
  </section>

  <section id="participants" class="band">
    <div class="section-head">
      <div>
        <h2>Participant matrix: where the averages come from.</h2>
        <p>The condition story is shaped by a few visible cases: C07 and P02 have very large gains, while I04, C06, and P04 move downward on the post-test.</p>
      </div>
      <p class="note">The feature column is intentionally not colored as "good" or "bad" in interpretation. High feature volume can mean support uptake, system pressure, or struggling behavior.</p>
    </div>
    <div class="table-wrap">${participantMatrix()}</div>
  </section>

  <section id="takeaways" class="band">
    <div class="section-head">
      <div>
        <h2>Interpretations worth carrying into the thesis.</h2>
        <p>These are the higher-level claims that the numbers can support without overstating the sample.</p>
      </div>
      <p class="note">The missing interview data is the main next layer. It can explain whether ignored prompts were unread, quickly understood, or actively rejected.</p>
    </div>
    <div class="panel insight-list">
      <div class="insight"><div><h3>The prototypes changed behavior before they clearly separated learning outcomes.</h3><p>Feature engagement differs strongly by condition, while raw gain and normalized gain do not. This validates the design manipulation without overstating learning effects.</p></div></div>
      <div class="insight"><div><h3>Agency is an outcome variable.</h3><p>Intermittent's subjective advantage is not just preference language; it appears in control and low distraction ratings.</p></div></div>
      <div class="insight"><div><h3>Interaction quality matters more than interaction quantity.</h3><p>Raw feature volume relates weakly to gain. Feed answering and explicit keyword action are more meaningful signals than exposure count.</p></div></div>
      <div class="insight"><div><h3>Continuous is the balanced condition.</h3><p>It has the strongest final performance and a high level of constructive activity without the same interruption profile as Proactive.</p></div></div>
      <div class="insight"><div><h3>Proactive is powerful but expensive.</h3><p>It creates the fastest first interactions and largest raw gains from low baseline, but it also carries a control and distraction cost.</p></div></div>
      <div class="insight"><div><h3>Interviews are needed for passive cognitive uptake.</h3><p>The logs know what was clicked, skipped, or dismissed. They do not know what was read, understood, or mentally used.</p></div></div>
    </div>
  </section>

  <section class="band">
    <div class="section-head">
      <div>
        <h2>Caveats that should stay visible.</h2>
        <p>Several exported fields are useful but imperfect. The dashboard avoids relying on known-problem metrics as decisive evidence.</p>
      </div>
    </div>
    <div class="grid three">
      <div class="panel"><h3>Low N</h3><p>With seven participants per condition, tests are exploratory and outliers matter.</p></div>
      <div class="panel"><h3>Logging gaps</h3><p>Proactive active-video seconds and pauses are zero in export, and Proactive quiz sheet rows are incomplete.</p></div>
      <div class="panel"><h3>Acceptance-rate ambiguity</h3><p>Some exported acceptance rates exceed 100%, so uptake is reconstructed from concrete event counts instead.</p></div>
    </div>
  </section>

  <footer>
    Generated from <code>src/P3 Data</code> on ${generatedDate}. This page is standalone and does not load external chart libraries. Build script: <code>report/combined/build-p3-codex-analysis.mjs</code>.
  </footer>
</body>
</html>`;

writeFileSync(outputFile, page);
console.log(`Wrote ${outputFile}`);
