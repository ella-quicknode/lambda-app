// Local test script for RPC comparison
// Run with: node local_test.js

const { config } = require("dotenv");
const { handler } = require("./Lambda_code_eth_call.js");
const fs = require("fs");

// Load environment variables
config();

// ─── Visualization ────────────────────────────────────────────────────────────

function createBarChart(label, value, maxValue, width = 50) {
  const barLength = Math.round((value / maxValue) * width);
  const bar = "█".repeat(barLength) + "░".repeat(width - barLength);
  return `${label.padEnd(15)} ${bar} ${value.toFixed(2)}ms`;
}

function visualize(body) {
  console.log("\n" + "═".repeat(80));
  console.log("RPC PROVIDER COMPARISON - VISUAL RESULTS".padStart(50));
  console.log("═".repeat(80) + "\n");

  console.log("📊 TEST CONFIGURATION\n");
  console.log(`   Iterations:           ${body.testConfig.iterations}`);
  console.log(`   Calls per iteration:  ${body.testConfig.callsPerIteration}`);
  console.log(`   Total calls/provider: ${body.testConfig.totalCallsPerProvider}`);
  console.log(`   Timestamp:            ${body.timestamp}\n`);

  const providers = Object.keys(body.results);
  const results = body.results;

  const allValues = providers.flatMap((p) => [
    results[p].stats.min,
    results[p].stats.max,
    results[p].stats.mean,
    results[p].stats.p50,
    results[p].stats.p95,
    results[p].stats.p99,
  ]);
  const maxValue = Math.max(...allValues) * 1.1;

  providers.forEach((provider) => {
    const stats = results[provider].stats;
    const isWinner = body.comparison.overallWinner === provider;

    console.log("─".repeat(80));
    console.log(
      `\n${isWinner ? "🏆 " : "   "}${provider.toUpperCase()}${isWinner ? " (Winner)" : ""}\n`,
    );

    console.log(createBarChart("Min", stats.min, maxValue));
    console.log(createBarChart("Mean", stats.mean, maxValue));
    console.log(createBarChart("p50 (median)", stats.p50, maxValue));
    console.log(createBarChart("p95", stats.p95, maxValue));
    console.log(createBarChart("p99", stats.p99, maxValue));
    console.log(createBarChart("Max", stats.max, maxValue));

    console.log(
      `\n   Total calls: ${stats.count} | Success rate: ${((results[provider].successfulCalls / results[provider].totalCalls) * 100).toFixed(1)}%\n`,
    );
  });

  console.log("─".repeat(80));

  console.log("\n📈 METRIC-BY-METRIC COMPARISON\n");
  const metrics = ["p50", "p95", "p99", "mean"];
  metrics.forEach((metric) => {
    const comp = body.comparison.metricComparisons[metric];
    console.log(
      `   ${metric.toUpperCase().padEnd(6)} | ${comp.fastest.padEnd(10)} ${comp.fastestTime.toString().padStart(7)}ms | ${comp.slowest.padEnd(10)} ${comp.slowestTime.toString().padStart(7)}ms | Δ ${comp.difference.toString().padStart(6)}ms (${comp.percentImprovement.toString().padStart(5)}%)`,
    );
  });

  console.log("\n" + "═".repeat(80));
  console.log("\n🏆 FINAL VERDICT\n");
  console.log(`   ${body.comparison.summary}`);
  console.log(`   Winner: ${body.comparison.overallWinner.toUpperCase()}\n`);

  console.log("💡 RECOMMENDATIONS\n");

  const p50Improvement = body.comparison.metricComparisons.p50.percentImprovement;
  const p99Improvement = body.comparison.metricComparisons.p99.percentImprovement;

  if (p50Improvement > 20) {
    console.log(
      `   ✓ ${body.comparison.overallWinner} shows significant improvement (>20%) at p50`,
    );
    console.log("     → Strong recommendation for typical workloads");
  } else if (p50Improvement > 10) {
    console.log(
      `   ✓ ${body.comparison.overallWinner} shows moderate improvement (10-20%) at p50`,
    );
    console.log("     → Recommended for performance-sensitive applications");
  } else {
    console.log("   ~ Marginal difference (<10%) at p50");
    console.log("     → Consider cost and other factors");
  }

  if (p99Improvement > 20) {
    console.log(
      `   ✓ ${body.comparison.overallWinner} shows significant improvement (>20%) at p99`,
    );
    console.log("     → Excellent for applications requiring consistent SLAs");
  }

  providers.forEach((provider) => {
    const ratio = results[provider].stats.p99 / results[provider].stats.p50;
    if (ratio < 2) {
      console.log(
        `   ✓ ${provider} shows excellent consistency (p99/p50 ratio: ${ratio.toFixed(2)})`,
      );
    } else if (ratio > 3) {
      console.log(
        `   ⚠ ${provider} shows high variability (p99/p50 ratio: ${ratio.toFixed(2)})`,
      );
    }
  });

  console.log("\n" + "═".repeat(80) + "\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runLocalTest() {
  console.log('🚀 Starting local RPC comparison test...\n');
  console.log('🔎 RPC method under test: eth_call\n');

  const event = {
    iterations: "10",
  };

  const context = {
    functionName: 'local-test',
    requestId: 'local-test-' + Date.now(),
  };

  try {
    const result = await handler(event, context);

    if (result.statusCode === 200) {
      const body = JSON.parse(result.body);

      // Save results
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `results/test-${timestamp}.json`;
      fs.mkdirSync('results', { recursive: true });
      fs.writeFileSync(filename, result.body);
      console.log(`\n📁 Results saved to: ${filename}`);

      // Render visualization inline
      visualize(body);

    } else {
      console.error('❌ Test failed:', result.body);
    }

  } catch (error) {
    console.error('❌ Error running test:', error);
    process.exit(1);
  }
}

runLocalTest();
