// Visualize comparison results with ASCII charts
// Usage: node visualize-results.js results-2026-02-03T10-30-00-000Z.json

const fs = require("fs");

function createBarChart(label, value, maxValue, width = 50) {
  const barLength = Math.round((value / maxValue) * width);
  const bar = "█".repeat(barLength) + "░".repeat(width - barLength);
  return `${label.padEnd(15)} ${bar} ${value.toFixed(2)}ms`;
}

function visualizeResults(filename) {
  console.log("\n" + "═".repeat(80));
  console.log("RPC PROVIDER COMPARISON - VISUAL RESULTS".padStart(50));
  console.log("═".repeat(80) + "\n");

  // Read results file
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));

  // Handle both Lambda response format (with statusCode) and direct format (with success)
  let body;
  if (data.statusCode) {
    // Lambda response format
    if (data.statusCode !== 200) {
      console.error("❌ Test failed:", data);
      return;
    }
    body = typeof data.body === "string" ? JSON.parse(data.body) : data.body;
  } else if (data.success === false) {
    // Direct format with failure
    console.error("❌ Test failed:", data);
    return;
  } else {
    // Direct format with success
    body = data;
  }

  // Show test configuration
  console.log("📊 TEST CONFIGURATION\n");
  console.log(`   Iterations:           ${body.testConfig.iterations}`);
  console.log(`   Calls per iteration:  ${body.testConfig.callsPerIteration}`);
  console.log(`   Total calls/provider: ${body.testConfig.totalCallsPerProvider}`);
  console.log(`   Timestamp:            ${body.timestamp}\n`);

  // Get provider names and results
  const providers = Object.keys(body.results);
  const results = body.results;

  // Find max value for scaling
  const allValues = providers.flatMap((p) => [
    results[p].stats.min,
    results[p].stats.max,
    results[p].stats.mean,
    results[p].stats.p50,
    results[p].stats.p95,
    results[p].stats.p99,
  ]);
  const maxValue = Math.max(...allValues) * 1.1; // Add 10% padding

  // Show metrics for each provider
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

  // Detailed comparison
  console.log("\n📈 METRIC-BY-METRIC COMPARISON\n");

  const metrics = ["p50", "p95", "p99", "mean"];
  metrics.forEach((metric) => {
    const comp = body.comparison.metricComparisons[metric];
    console.log(
      `   ${metric.toUpperCase().padEnd(6)} | ${comp.fastest.padEnd(10)} ${comp.fastestTime.toString().padStart(7)}ms | ${comp.slowest.padEnd(10)} ${comp.slowestTime.toString().padStart(7)}ms | Δ ${comp.difference.toString().padStart(6)}ms (${comp.percentImprovement.toString().padStart(5)}%)`,
    );
  });

  // Summary
  console.log("\n" + "═".repeat(80));
  console.log("\n🏆 FINAL VERDICT\n");
  console.log(`   ${body.comparison.summary}`);
  console.log(`   Winner: ${body.comparison.overallWinner.toUpperCase()}\n`);

  // Recommendations
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

  // Check consistency (p99/p50 ratio)
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

// Main
const filename = process.argv[2];

if (!filename) {
  console.log("Usage: node visualize-results.js <results-file.json>\n");
  console.log("Example: node visualize-results.js results/test-2026-02-03T10-30-00-000Z.json\n");

  // Look for recent results files
  if (fs.existsSync("results")) {
    const files = fs
      .readdirSync("results")
      .filter((f) => f.endsWith(".json"))
      .map((f) => `results/${f}`)
      .sort()
      .reverse();

    if (files.length > 0) {
      console.log("Recent results files found:");
      files.slice(0, 5).forEach((f) => console.log(`  - ${f}`));
      console.log("\nUsing most recent:", files[0]);
      visualizeResults(files[0]);
    } else {
      console.log('No results files found. Run "npm test" first.');
    }
  } else {
    console.log('No results directory found. Run "npm test" first.');
  }
} else {
  visualizeResults(filename);
}
