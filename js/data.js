// Static reference data: muscles, equipment, exercise library.

export const MUSCLES = [
  { id: 'chest', name: 'Chest', target: 12, big: true },
  { id: 'back', name: 'Back', target: 14, big: true },
  { id: 'shoulders', name: 'Shoulders', target: 12, big: true },
  { id: 'biceps', name: 'Biceps', target: 8 },
  { id: 'triceps', name: 'Triceps', target: 8 },
  { id: 'quads', name: 'Quads', target: 12, big: true },
  { id: 'hamstrings', name: 'Hamstrings', target: 10, big: true },
  { id: 'glutes', name: 'Glutes', target: 6 },
  { id: 'calves', name: 'Calves', target: 8 },
  { id: 'abs', name: 'Abs', target: 6 },
];
export const MUSCLE_NAME = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));

export const EQUIPMENT = [
  { id: 'barbell', name: 'Barbell + plates', on: true },
  { id: 'rack', name: 'Squat rack / stands', on: true },
  { id: 'bench', name: 'Adjustable bench', on: true },
  { id: 'dumbbells', name: 'Dumbbells', on: true },
  { id: 'pullup', name: 'Pull-up bar', on: true },
  { id: 'cable_high', name: 'High cable / lat pulldown', on: true },
  { id: 'cable_low', name: 'Low cable / seated row', on: true },
  { id: 'leg_dev', name: 'Leg extension / curl', on: false },
  { id: 'leg_press', name: 'Leg press', on: false },
  { id: 'pec_deck', name: 'Pec deck / chest press arms', on: false },
  { id: 'dip', name: 'Dip bars', on: false },
  { id: 'ez_bar', name: 'EZ curl bar', on: false },
  { id: 'bands', name: 'Resistance bands', on: false },
  { id: 'treadmill', name: 'Treadmill', on: true },
  { id: 'rower', name: 'Rower', on: true },
];

export const SESSION_TYPES = {
  full: { name: 'Full body', m: ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'calves', 'glutes', 'abs'] },
  upper: { name: 'Upper', m: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
  lower: { name: 'Lower', m: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
  push: { name: 'Push', m: ['chest', 'shoulders', 'triceps'] },
  pull: { name: 'Pull', m: ['back', 'biceps', 'abs'] },
  legs: { name: 'Legs', m: ['quads', 'hamstrings', 'glutes', 'calves'] },
};

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// [name, primary, secondary, equipment, kind (c=compound, i=isolation), pattern, load]
// Order within a muscle = preference order for the quick builder.
const RAW = [
  ['Bench Press (Barbell)', 'chest', ['triceps', 'shoulders'], ['barbell', 'rack', 'bench'], 'c', 'hpush', 'bb'],
  ['Incline Bench Press (Dumbbell)', 'chest', ['shoulders', 'triceps'], ['dumbbells', 'bench'], 'c', 'ipush', 'db'],
  ['Bench Press (Dumbbell)', 'chest', ['triceps', 'shoulders'], ['dumbbells', 'bench'], 'c', 'hpush', 'db'],
  ['Incline Bench Press (Barbell)', 'chest', ['shoulders', 'triceps'], ['barbell', 'rack', 'bench'], 'c', 'ipush', 'bb'],
  ['Chest Dip', 'chest', ['triceps', 'shoulders'], ['dip'], 'c', 'dip', 'bw'],
  ['Chest Fly (Dumbbell)', 'chest', [], ['dumbbells', 'bench'], 'i', 'fly', 'db'],
  ['Pec Deck (Machine)', 'chest', [], ['pec_deck'], 'i', 'fly', 'machine'],
  ['Push Up', 'chest', ['triceps', 'shoulders'], [], 'c', 'pushup', 'bw'],

  ['Pull Up', 'back', ['biceps'], ['pullup'], 'c', 'vpull', 'bw'],
  ['Rows (Dumbbell)', 'back', ['biceps'], ['dumbbells', 'bench'], 'c', 'hpull', 'db'],
  ['Lat Pulldown (Cable)', 'back', ['biceps'], ['cable_high'], 'c', 'vpull', 'machine'],
  ['Bent Over Row (Barbell)', 'back', ['biceps', 'hamstrings'], ['barbell'], 'c', 'hpull', 'bb'],
  ['Seated Row (Cable)', 'back', ['biceps'], ['cable_low'], 'c', 'hpull', 'machine'],
  ['Lat Pulldown - Wide Grip (Cable)', 'back', ['biceps'], ['cable_high'], 'c', 'vpull', 'machine'],
  ['Chin Up', 'back', ['biceps'], ['pullup'], 'c', 'vpull', 'bw'],
  ['Incline Row (Dumbbell)', 'back', ['biceps', 'shoulders'], ['dumbbells', 'bench'], 'c', 'hpull', 'db'],
  ['Inverted Row', 'back', ['biceps'], ['barbell', 'rack'], 'c', 'hpull', 'bw'],
  ['Straight Arm Pulldown (Cable)', 'back', [], ['cable_high'], 'i', 'pullover', 'machine'],
  ['Pullover (Dumbbell)', 'back', ['chest'], ['dumbbells', 'bench'], 'i', 'pullover', 'db'],
  ['Shrug (Dumbbell)', 'back', [], ['dumbbells'], 'i', 'shrug', 'db'],
  ['Shrug (Barbell)', 'back', [], ['barbell'], 'i', 'shrug', 'bb'],

  ['Overhead Press (Barbell)', 'shoulders', ['triceps'], ['barbell', 'rack'], 'c', 'vpush', 'bb'],
  ['Seated Overhead Press (Dumbbell)', 'shoulders', ['triceps'], ['dumbbells', 'bench'], 'c', 'vpush', 'db'],
  ['Arnold Press (Dumbbell)', 'shoulders', ['triceps'], ['dumbbells', 'bench'], 'c', 'vpush', 'db'],
  ['Lateral Raise (Dumbbell)', 'shoulders', [], ['dumbbells'], 'i', 'lateral', 'db'],
  ['Lateral Raise (Cable)', 'shoulders', [], ['cable_low'], 'i', 'lateral', 'machine'],
  ['Reverse Fly (Dumbbell)', 'shoulders', ['back'], ['dumbbells'], 'i', 'rear', 'db'],
  ['Face Pull (Cable)', 'shoulders', ['back'], ['cable_high'], 'i', 'rear', 'machine'],

  ['Incline Curl (Dumbbell)', 'biceps', [], ['dumbbells', 'bench'], 'i', 'curl-stretch', 'db'],
  ['Bicep Curl (Barbell)', 'biceps', [], ['barbell'], 'i', 'curl', 'bb'],
  ['Bicep Curl (Dumbbell)', 'biceps', [], ['dumbbells'], 'i', 'curl', 'db'],
  ['Hammer Curl (Dumbbell)', 'biceps', [], ['dumbbells'], 'i', 'hammer', 'db'],
  ['Bicep Curl (EZ Bar)', 'biceps', [], ['ez_bar'], 'i', 'curl', 'bb'],
  ['Bicep Curl (Cable)', 'biceps', [], ['cable_low'], 'i', 'curl', 'machine'],

  ['Triceps Extension (Dumbbell)', 'triceps', [], ['dumbbells'], 'i', 'oh-ext', 'db'],
  ['Triceps Pushdown (Cable)', 'triceps', [], ['cable_high'], 'i', 'pushdown', 'machine'],
  ['Skullcrusher (Barbell)', 'triceps', [], ['barbell', 'bench'], 'i', 'skull', 'bb'],
  ['Overhead Triceps Extension (Cable)', 'triceps', [], ['cable_low'], 'i', 'oh-ext', 'machine'],
  ['Bench Press - Close Grip (Barbell)', 'triceps', ['chest', 'shoulders'], ['barbell', 'rack', 'bench'], 'c', 'hpush', 'bb'],
  ['Triceps Dip', 'triceps', ['chest', 'shoulders'], ['dip'], 'c', 'dip', 'bw'],

  ['Squat (Barbell)', 'quads', ['glutes'], ['barbell', 'rack'], 'c', 'squat', 'bb'],
  ['Bulgarian Split Squat (Dumbbell)', 'quads', ['glutes'], ['dumbbells', 'bench'], 'c', 'split', 'db'],
  ['Leg Press', 'quads', ['glutes'], ['leg_press'], 'c', 'press', 'machine'],
  ['Front Squat (Barbell)', 'quads', ['glutes'], ['barbell', 'rack'], 'c', 'squat', 'bb'],
  ['Box Squat (Barbell)', 'quads', ['glutes'], ['barbell', 'rack', 'bench'], 'c', 'squat', 'bb'],
  ['Goblet Squat (Dumbbell)', 'quads', ['glutes'], ['dumbbells'], 'c', 'goblet', 'db'],
  ['Lunge (Dumbbell)', 'quads', ['glutes', 'hamstrings'], ['dumbbells'], 'c', 'lunge', 'db'],
  ['Leg Extension (Machine)', 'quads', [], ['leg_dev'], 'i', 'legext', 'machine'],

  ['Romanian Deadlift (Barbell)', 'hamstrings', ['glutes', 'back'], ['barbell'], 'c', 'hinge', 'bb'],
  ['Romanian Deadlift (Dumbbell)', 'hamstrings', ['glutes', 'back'], ['dumbbells'], 'c', 'hinge', 'db'],
  ['Lying Leg Curl (Machine)', 'hamstrings', [], ['leg_dev'], 'i', 'legcurl', 'machine'],
  ['Deadlift (Barbell)', 'hamstrings', ['glutes', 'back'], ['barbell'], 'c', 'hinge', 'bb'],
  ['Good Morning (Barbell)', 'hamstrings', ['glutes', 'back'], ['barbell', 'rack'], 'c', 'hinge', 'bb'],
  ['Single Leg Romanian Deadlift (Dumbbell)', 'hamstrings', ['glutes'], ['dumbbells'], 'i', 'sl-hinge', 'db'],

  ['Hip Thrust (Barbell)', 'glutes', ['hamstrings'], ['barbell', 'bench'], 'c', 'thrust', 'bb'],
  ['Reverse Lunge (Dumbbell)', 'glutes', ['quads', 'hamstrings'], ['dumbbells'], 'c', 'lunge', 'db'],
  ['Glute Bridge (Barbell)', 'glutes', ['hamstrings'], ['barbell'], 'c', 'thrust', 'bb'],

  ['Standing Calf Raise (Dumbbell)', 'calves', [], ['dumbbells'], 'i', 'calf', 'db'],
  ['Standing Calf Raise (Barbell)', 'calves', [], ['barbell', 'rack'], 'i', 'calf', 'bb'],
  ['Calf Press (Leg Press)', 'calves', [], ['leg_press'], 'i', 'calf', 'machine'],
  ['Seated Calf Raise (Dumbbell)', 'calves', [], ['dumbbells', 'bench'], 'i', 'calf-seated', 'db'],

  ['Hanging Leg Raise', 'abs', [], ['pullup'], 'i', 'legraise', 'bw'],
  ['Cable Crunch', 'abs', [], ['cable_high'], 'i', 'crunch', 'machine'],
  ['Reverse Crunch', 'abs', [], [], 'i', 'legraise', 'bw'],
  ['Crunch', 'abs', [], [], 'i', 'crunch', 'bw'],
  ['Side Bend (Dumbbell)', 'abs', [], ['dumbbells'], 'i', 'sidebend', 'db'],
  ['Plank', 'abs', [], [], 'i', 'plank', 'bw'],
];

export const EXERCISES = RAW.map(([name, primary, secondary, equip, kind, pattern, load]) =>
  ({ id: slug(name), name, primary, secondary, equip, kind, pattern, load }));

// Keyword → muscle, for imported or AI-invented exercises we have never seen.
const GUESS = [
  [/calf/, 'calves'], [/crunch|plank|leg raise|ab |abs|sit.?up|side bend|rollout/, 'abs'],
  [/curl/, 'biceps'], [/tricep|pushdown|skull|close grip|dip/, 'triceps'],
  [/leg curl|deadlift|rdl|good morning|hamstring|nordic/, 'hamstrings'],
  [/squat|lunge|leg press|leg ext|step.?up/, 'quads'], [/thrust|glute|bridge/, 'glutes'],
  [/lateral|overhead|shoulder|arnold|face pull|reverse fly|rear delt|upright/, 'shoulders'],
  [/row|pull|chin|lat |pulldown|shrug|pullover/, 'back'], [/bench|press|fly|push.?up|chest|pec/, 'chest'],
];
export function guessMuscle(name) {
  const n = name.toLowerCase();
  if (/leg curl/.test(n)) return 'hamstrings';
  for (const [re, m] of GUESS) if (re.test(n)) return m;
  return 'back';
}
export function guessLoad(name) {
  const n = name.toLowerCase();
  if (/barbell|ez/.test(n)) return 'bb';
  if (/dumbbell|kettlebell/.test(n)) return 'db';
  if (/cable|machine|press\b.*leg|leg press/.test(n)) return 'machine';
  if (/pull.?up|chin.?up|push.?up|dip|plank|crunch|raise$/.test(n)) return 'bw';
  return 'machine';
}

// The split from the Strong screenshots, kept as starting templates.
export const SEED_TEMPLATES = [
  { name: 'Scoliosis - Upper Body', ex: [['Bench Press (Barbell)', 5], ['Bench Press (Dumbbell)', 4], ['Rows (Dumbbell)', 4], ['Seated Overhead Press (Dumbbell)', 3]] },
  { name: 'Scoliosis Lower', ex: [['Romanian Deadlift (Barbell)', 5], ['Romanian Deadlift (Dumbbell)', 5], ['Standing Calf Raise (Barbell)', 3]] },
  { name: 'SSS - Wednesday', ex: [['Overhead Press (Barbell)', 8], ['Lat Pulldown - Wide Grip (Cable)', 3], ['Triceps Extension (Dumbbell)', 3], ['Bicep Curl (Barbell)', 3]] },
];
