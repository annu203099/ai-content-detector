import fs from 'node:fs';
import path from 'node:path';
import { AIDetector } from '../dist/index.js';

async function verify() {
  const detector = new AIDetector({
    runtime: 'node-cpu',
    provenance: true
  });

  const testImages = [
    {
      label: 'User Phone Camera Photo (realme 8i)',
      path: path.join(process.env.USERPROFILE, 'Downloads', '1000313211.jpg'),
      expectedVerdictNot: 'likely_ai'
    },
    {
      label: 'Real Reddit User Photo',
      path: path.join('scripts', 'samples', 'unsure_ft44s_reddit_031.jpg'),
      expectedVerdict: 'likely_human'
    },
    {
      label: 'Real COCO Photo (000000578093.jpg)',
      path: path.join('scripts', 'samples', '000000578093.jpg'),
      expectedVerdict: 'likely_human'
    },
    {
      label: 'Known AI-Generated Image (fake_r1f1178cet.png)',
      path: path.join('scripts', 'samples', 'fake_r1f1178cet.png'),
      expectedVerdict: 'likely_ai'
    },
    {
      label: 'Known AI-Generated Image (fake_r1f1a3258t.png)',
      path: path.join('scripts', 'samples', 'fake_r1f1a3258t.png'),
      expectedVerdict: 'likely_ai'
    }
  ];

  console.log('='.repeat(70));
  console.log('LIVE END-TO-END IMAGE DETECTOR VERIFICATION');
  console.log('='.repeat(70));

  for (const item of testImages) {
    if (!fs.existsSync(item.path)) {
      console.log(`[SKIP] File not found: ${item.path}`);
      continue;
    }

    const buffer = fs.readFileSync(item.path);
    const result = await detector.detectImage(buffer);

    console.log(`\nTest: ${item.label}`);
    console.log(`  File: ${path.basename(item.path)} (${(buffer.length / 1024).toFixed(1)} KB)`);
    console.log(`  Raw Score (Logit): ${result.score.toFixed(3)}`);
    console.log(`  Calibrated Probability: ${(result.probability * 100).toFixed(2)}%`);
    console.log(`  Verdict: ${result.verdict.toUpperCase()}`);
    console.log(`  Threshold Used: ${result.thresholdUsed}`);
    console.log(`  Latency: ${result.timing.totalMs.toFixed(1)} ms (Inference: ${result.timing.inferenceMs.toFixed(1)} ms)`);

    if (item.expectedVerdict) {
      if (result.verdict === item.expectedVerdict) {
        console.log(`  ✓ SUCCESS: Matches expected verdict [${item.expectedVerdict}]`);
      } else {
        console.error(`  ✗ FAIL: Expected [${item.expectedVerdict}], got [${result.verdict}]`);
      }
    } else if (item.expectedVerdictNot) {
      if (result.verdict !== item.expectedVerdictNot) {
        console.log(`  ✓ SUCCESS: Not falsely classified as [${item.expectedVerdictNot}] (Verdict: ${result.verdict})`);
      } else {
        console.error(`  ✗ FAIL: Falsely classified as [${item.expectedVerdictNot}]`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
}

verify().catch(console.error);
