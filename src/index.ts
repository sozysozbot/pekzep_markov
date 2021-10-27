import Discord from "discord.js";
import fetch from "node-fetch";
const client = new Discord.Client();
type Vec = Map<string, number>;

function mult(scalar: number, vec: Vec): Vec {
  const new_vec: Vec = new Map();
  for (const [key, val] of vec) {
    new_vec.set(key, val * scalar);
  }
  return new_vec;
}

function add(v1: Vec, v2: Vec): Vec {
  const new_vec: Vec = new Map();

  // merge both keys
  for (const [key, _] of v1) { new_vec.set(key, 0); }
  for (const [key, _] of v2) { new_vec.set(key, 0); }
  for (const [key, val] of v1) { new_vec.set(key, val + (v2.get(key) ?? 0)); }
  return new_vec;
}

function transition_matrix(o: { corpus: string[], delta: number }): Map<string, Vec> {
  const charset = new Set([...o.corpus.join(""), "☆"]);

  const matrix: Map<string, Vec> = new Map();

  // initialize the matrix
  charset.forEach(char => {
    const vec: Vec = new Map();
    charset.forEach(next => vec.set(next, 0));
    vec.set("FINAL", 0);
    matrix.set(char, vec);
  });

  {
    const vec: Vec = new Map();
    charset.forEach(next => vec.set(next, 0));
    // to avoid generating an empty string, "FINAL" is not set
    matrix.set("INITIAL", vec);
  }

  // fill the matrix
  o.corpus.forEach(text => {
    // to safely handle surrogate pair
    const txt = [...text];
    for (let i = -o.delta; i < txt.length + o.delta; i++) {
      const before_transition = txt[i] ?? "INITIAL";
      const after_transition = txt[i + o.delta] ?? "FINAL";
      if (before_transition === "INITIAL" && after_transition === "FINAL") { continue; }
      const vec = matrix.get(before_transition)!;
      vec.set(after_transition, vec.get(after_transition)! + 1);
    }
  });

  for (const [_, vec] of matrix) {
    let sum = 0;
    // additive smoothing
    // see https://en.wikipedia.org/wiki/Additive_smoothing for details
    // I will choose α = 0.01; since there is 300 characters available, it seems reasonable to have 300α = 3 samples that we do not know
    const alpha = 0.01
    for (const [aft, count] of vec) {
      vec.set(aft, count + alpha);
      sum += count + alpha;
    }

    // normalize
    for (const [aft, count] of vec) {
      vec.set(aft, count / sum);
    }
  }
  return matrix;
}

function random_choice(v: Vec): string {
  let r = Math.random();
  for (const [key, val] of v) {
    if (r < val) { return key; }
    r -= val;
  }
  console.log("input given", v);
  throw new Error("random choice failed. Maybe the vector was not normalized?")
}

async function generate() {
  const raw = await fetch("https://raw.githubusercontent.com/jurliyuuri/spoonfed_pekzep/master/docs/raw.tsv").then(response => response.text());
  const pekzep_sentences: string[] = raw.split("\n").filter(a => a.trim() !== "").map(row => row.split("\t")[2]);

  const markov1 = transition_matrix({ corpus: pekzep_sentences, delta: 1 });
  const markov2 = transition_matrix({ corpus: pekzep_sentences, delta: 2 });
  const markov3 = transition_matrix({ corpus: pekzep_sentences, delta: 3 });
  const markov4 = transition_matrix({ corpus: pekzep_sentences, delta: 4 });

  const buffer = ["INITIAL", "INITIAL", "INITIAL", "INITIAL"];

  for (let i = 4; ; i++) {
    const vec1 = markov1.get(buffer[i - 1])!;
    const vec2 = markov2.get(buffer[i - 2])!;
    const vec3 = markov3.get(buffer[i - 3])!;
    const vec4 = markov4.get(buffer[i - 4])!;
    console.log(buffer);
    console.log(vec1);
    console.log(vec2);
    console.log(vec3);
    console.log(vec4);
    const vec = add(add(mult(0.9, vec1), mult(0.06, vec2)), add(mult(0.03, vec3), mult(0.01, vec4)));

    buffer[i] = random_choice(vec);
    if (buffer[i] === "FINAL") { break; }
  }
  return buffer.filter(a => a !== "INITIAL" && a !== "FINAL").join("");
}

client.once('ready', async () => {
  const msg = `解釈せよ：\n${await generate()}`;
  console.log(msg);

  // #毎日機文
  (client.channels.cache.get('902991802116739103')! as Discord.TextChannel).send(msg);
});

client.login(process.env.DISCORD_NOTIFIER_TOKEN);

