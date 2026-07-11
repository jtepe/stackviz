// Example programs offered in the samples dropdown. Each is a complete
// program that parses, checks, and runs against the engine.

export const SEED_PROGRAM = `fn helper(a: i32, p: &i32) -> i32 {
    let local: i32 = a;
    return local;
}

fn outer(n: i32) {
    let x = 42;
    let px: &i32 = &x;
    let r = helper(x, px);
    helper(n, px);
}

fn main() {
    outer(7);
}
`;

export interface Sample {
  id: string;
  name: string;
  source: string;
  outcome: 'finished' | 'overflow';
}

export const SAMPLES: readonly Sample[] = [
  {
    id: 'basic-calls',
    name: 'Basic calls',
    source: SEED_PROGRAM,
    outcome: 'finished',
  },
  {
    id: 'references-padding',
    name: 'References & padding',
    source: `fn probe(a: i32, p: &i32, b: i32) {
    let first: i32 = a;
    let alias: &i32 = p;
    let second: i32 = b;
    let inner: &i32 = &second;
}

fn main() {
    let x: i32 = 10;
    let y: i32 = 20;
    probe(x, &x, y);
}
`,
    outcome: 'finished',
  },
  {
    id: 'return-values',
    name: 'Return values',
    source: `fn pick(a: i32) -> i32 {
    let kept: i32 = a;
    kept
}

fn answer() -> i32 {
    return 42;
}

fn main() {
    let chosen = pick(5);
    answer();
    let final_value = answer();
}
`,
    outcome: 'finished',
  },
  {
    id: 'dangling-reference',
    name: 'Dangling reference',
    source: `fn escape() -> &i32 {
    let doomed: i32 = 7;
    return &doomed;
}

fn main() {
    let dangling = escape();
    let after: i32 = 1;
}
`,
    outcome: 'finished',
  },
  {
    id: 'deep-call-chain',
    name: 'Deepest call chain (8 frames)',
    source: `fn depth_8(n: i32) {
    let floor: i32 = n;
}

fn depth_7(n: i32) {
    depth_8(n);
}

fn depth_6(n: i32) {
    depth_7(n);
}

fn depth_5(n: i32) {
    depth_6(n);
}

fn depth_4(n: i32) {
    depth_5(n);
}

fn depth_3(n: i32) {
    depth_4(n);
}

fn depth_2(n: i32) {
    depth_3(n);
}

fn main() {
    depth_2(8);
}
`,
    outcome: 'finished',
  },
  {
    id: 'overflow-demo',
    name: 'Stack overflow demo',
    source: `fn spiral(depth: i32) {
    spiral(depth);
}

fn main() {
    spiral(1);
}
`,
    outcome: 'overflow',
  },
];
