import { runEvalSuite } from "./run";
import { metricsList } from "./metrics";

const suite = runEvalSuite();

for (const sample of suite.samples) {
  const mark = sample.ok ? "PASS" : "FAIL";
  console.log(`${mark}  sample:${sample.id}  score ${sample.score}${sample.errors.length ? `  ${sample.errors.join(",")}` : ""}`);
}

console.log("METRICS");
for (const row of metricsList(suite.metrics)) {
  const value = row.score == null ? row.display : `${row.display}`.padStart(3);
  console.log(`  ${row.label.padEnd(28)} ${value}  ${row.detail}`);
}

for (const result of suite.scenarios) {
  const mark = result.ok ? "PASS" : "FAIL";
  const attackFail = result.attacks.filter((item) => !item.ok).length;
  console.log(
    `${mark}  ${result.id}  gold ${result.gold.score.score}${result.gold.ok ? "" : " !"}  attacks ${result.attacks.length - attackFail}/${result.attacks.length}  expected ${result.expected}`,
  );
  if (!result.gold.ok) {
    for (const row of result.gold.score.assertions.filter((item) => !item.pass)) {
      console.log(`    gold  [${row.dimension}] ${row.id}: ${row.detail}`);
    }
    for (const row of result.gold.gate.checks.filter((item) => !item.pass)) {
      console.log(`    gate  ${row.id}: ${row.detail}`);
    }
  }
  for (const attack of result.attacks) {
    if (attack.ok) continue;
    console.log(
      `    attack still looking healthy: ${attack.label}  score ${attack.score.score}  gate errors ${attack.gate.errorCount}`,
    );
    for (const row of attack.score.assertions.filter((item) => item.pass).slice(0, 6)) {
      console.log(`      still passes ${row.id}`);
    }
  }
}

if (!suite.passed) {
  process.exitCode = 1;
} else {
  console.log(`PASS  suite  ${suite.scenarios.length} scenarios`);
}
