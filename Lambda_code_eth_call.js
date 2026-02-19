//script works on aws lambda code console
// Compares eth_call response times from 2 RPC providers

const https = require("https");

const handler = async (event, context) => {
  // Configuration - Load both RPC providers
  const RPC_PROVIDERS = {
    QN_ORD: process.env.qn_eth_mainnet,
    QN_2: process.env.qn_eth_mainnet_2,
  };

  // Sample eth_call payloads (from real traffic)
  const SAMPLE_ETH_CALLS = [
    {
      name: "Uniswap V3 Pool getReserves",
      to: "0xd3d2e2692501a5c9ca623199d38826e513033a17",
      data: "0x0902f1ac",
    },
    {
      name: "Uniswap V3 Quoter",
      to: "0xbc708b192552e19a088b4c4b8772aeea83bcf760",
      data: "0xaa3ad4e40000000000000000000000005ac34c53a04b9aaa0bf047e7291fb4e8a48f2a18000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000186a0",
      gas: "0xf4240",
    },
    {
      name: "Pool Token0",
      to: "0x8026a88657a21f28c9f3d1db96c43303fca0cf58",
      data: "0x3850c7bd",
    },
    {
      name: "Pool Token1",
      to: "0x8026a88657a21f28c9f3d1db96c43303fca0cf58",
      data: "0x1a686502",
    },
    {
      name: "Pool Token1 Alt",
      to: "0x1d42064fc4beb5f8aaf85f4617ae8b3b5b8bd801",
      data: "0x1a686502",
    },
    {
      name: "Oracle Observation 1",
      to: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
      data: "0xfa6793d53280a24edf87978fd7a9123b10089e973d6fd9197d88f98386ec2ce089e3b6fb",
    },
    {
      name: "Oracle Observation 2",
      to: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
      data: "0xc815641c3280a24edf87978fd7a9123b10089e973d6fd9197d88f98386ec2ce089e3b6fb",
    },
    {
      name: "Oracle Observation 3",
      to: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
      data: "0xfa6793d5395f91b34aa34a477ce3bc6505639a821b286a62b1a164fc1887fa3a5ef713a5",
    },
  ];

  // Number of iterations to run for statistical significance
  const ITERATIONS = parseInt(event.iterations || "10", 10);
  const REQUEST_TIMEOUT_MS = parseInt(event.timeoutMs || "10000", 10);
  const AGENT_MAX_SOCKETS = parseInt(event.maxSockets || "16", 10);

  try {
    console.log("Starting RPC comparison test...");
    console.log(
      `Testing ${Object.keys(RPC_PROVIDERS).length} providers with ${SAMPLE_ETH_CALLS.length} calls, ${ITERATIONS} iterations each`,
    );

    const providerResults = {};
    const providerAgents = Object.fromEntries(
      Object.keys(RPC_PROVIDERS).map((providerName) => [
        providerName,
        new https.Agent({
          keepAlive: true,
          maxSockets: AGENT_MAX_SOCKETS,
          timeout: REQUEST_TIMEOUT_MS,
        }),
      ]),
    );

    // Test each RPC provider
    for (const [providerName, rpcUrl] of Object.entries(RPC_PROVIDERS)) {
      console.log(`\nTesting provider: ${providerName}`);
      const responseTimes = [];
      const successfulDetails = [];
      let failedCalls = 0;
      const failureByCall = {};
      const sampleErrors = [];

      // Run multiple iterations for statistical significance
      for (let i = 0; i < ITERATIONS; i++) {
        console.log(`  Iteration ${i + 1}/${ITERATIONS}`);

        // Execute all eth_calls simultaneously
        const callPromises = SAMPLE_ETH_CALLS.map((call) =>
          makeTimedEthCall(
            rpcUrl,
            call,
            providerName,
            providerAgents[providerName],
            REQUEST_TIMEOUT_MS,
          ),
        );

        const iterationResults = await Promise.all(callPromises);

        // Collect response times
        iterationResults.forEach((result) => {
          if (result.success) {
            responseTimes.push(result.responseTime);
            successfulDetails.push(result);
          } else {
            failedCalls += 1;
            failureByCall[result.callName] =
              (failureByCall[result.callName] || 0) + 1;
            if (sampleErrors.length < 10) {
              sampleErrors.push({
                callName: result.callName,
                error: result.error,
              });
            }
          }
        });
      }

      // Calculate statistics
      const stats = calculateStats(responseTimes);
      providerResults[providerName] = {
        totalCalls: ITERATIONS * SAMPLE_ETH_CALLS.length,
        successfulCalls: responseTimes.length,
        failedCalls: failedCalls,
        successRate:
          (responseTimes.length / (ITERATIONS * SAMPLE_ETH_CALLS.length)) * 100,
        failureByCall: failureByCall,
        sampleErrors: sampleErrors,
        stats: stats,
        phaseStats: calculatePhaseStats(successfulDetails),
        rawTimes: responseTimes.slice(0, 20), // Include first 20 for inspection
        slowestCalls: successfulDetails
          .sort((a, b) => b.responseTime - a.responseTime)
          .slice(0, 10)
          .map((item) => ({
            provider: item.provider,
            callName: item.callName,
            responseTime: item.responseTime,
            reusedSocket: item.connection.reusedSocket,
            socketId: item.connection.socketId,
            timingsMs: item.timingsMs,
          })),
      };

      console.log(`${providerName} results:`, stats);
      console.log(`${providerName} failureByCall:`, failureByCall);
      if (sampleErrors.length > 0) {
        console.log(`${providerName} sampleErrors:`, sampleErrors);
      }
    }

    // Determine winner
    const comparison = compareProviders(providerResults);

    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          success: true,
          testConfig: {
            iterations: ITERATIONS,
            callsPerIteration: SAMPLE_ETH_CALLS.length,
            totalCallsPerProvider: ITERATIONS * SAMPLE_ETH_CALLS.length,
          },
          results: providerResults,
          comparison: comparison,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
    };
  }
};

// Make timed eth_call and return response time
async function makeTimedEthCall(
  rpcUrl,
  callConfig,
  providerName,
  agent,
  timeoutMs,
) {
  const params = [
    {
      to: callConfig.to,
      data: callConfig.data,
      ...(callConfig.gas && { gas: callConfig.gas }),
    },
    "latest",
  ];

  try {
    const rpcResult = await makeEthCallDetailed(
      rpcUrl,
      "eth_call",
      params,
      agent,
      timeoutMs,
    );
    const responseTime = rpcResult.timingsMs.total;

    return {
      success: true,
      provider: providerName,
      responseTime: responseTime,
      callName: callConfig.name,
      timingsMs: rpcResult.timingsMs,
      connection: rpcResult.connection,
    };
  } catch (error) {
    return {
      success: false,
      provider: providerName,
      responseTime: 0,
      callName: callConfig.name,
      error: error.message,
    };
  }
}

// Make JSON-RPC call to Ethereum node
async function makeEthCall(rpcUrl, method, params) {
  const result = await makeEthCallDetailed(rpcUrl, method, params);
  return result.rpcResult;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1000000;
}

function elapsedMs(start, end) {
  if (start == null || end == null) return null;
  return Math.round((end - start) * 1000) / 1000;
}

async function makeEthCallDetailed(
  rpcUrl,
  method,
  params,
  agent = undefined,
  timeoutMs = 10000,
) {
  const payload = {
    jsonrpc: "2.0",
    method: method,
    params: params,
    id: Math.floor(Math.random() * 10000),
  };

  return new Promise((resolve, reject) => {
    const url = new URL(rpcUrl);
    const postData = JSON.stringify(payload);
    const marks = {
      start: nowMs(),
      socketAssigned: null,
      dnsDone: null,
      tcpConnected: null,
      tlsDone: null,
      firstByte: null,
      end: null,
    };
    let socketId = null;
    let reusedSocket = false;

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      marks.firstByte = nowMs();

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          marks.end = nowMs();
          const result = JSON.parse(data);
          if (result.error) {
            reject(new Error(`RPC Error: ${JSON.stringify(result.error)}`));
          } else {
            resolve({
              rpcResult: result.result,
              timingsMs: {
                dns: elapsedMs(marks.socketAssigned, marks.dnsDone),
                tcp: elapsedMs(
                  marks.dnsDone ?? marks.socketAssigned,
                  marks.tcpConnected,
                ),
                tls: elapsedMs(marks.tcpConnected, marks.tlsDone),
                ttfb: elapsedMs(marks.start, marks.firstByte),
                total: elapsedMs(marks.start, marks.end),
              },
              connection: {
                reusedSocket: reusedSocket,
                socketId: socketId,
              },
            });
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on("socket", (socket) => {
      marks.socketAssigned = nowMs();
      reusedSocket = req.reusedSocket === true;

      if (socket.connecting === false) {
        marks.tcpConnected = marks.socketAssigned;
        marks.tlsDone = marks.socketAssigned;
      }

      socket.once("lookup", () => {
        marks.dnsDone = nowMs();
      });

      socket.once("connect", () => {
        marks.tcpConnected = nowMs();
      });

      socket.once("secureConnect", () => {
        marks.tlsDone = nowMs();
        socketId = `${socket.localAddress}:${socket.localPort}->${socket.remoteAddress}:${socket.remotePort}`;
      });

      if (
        !socketId &&
        socket.localAddress &&
        socket.localPort &&
        socket.remoteAddress &&
        socket.remotePort
      ) {
        socketId = `${socket.localAddress}:${socket.localPort}->${socket.remoteAddress}:${socket.remotePort}`;
      }
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });

    req.on("error", (e) => {
      marks.end = nowMs();
      reject(new Error(`Request failed: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

function calculatePhaseStats(successfulDetails) {
  const phaseNames = ["dns", "tcp", "tls", "ttfb", "total"];
  const result = {};

  phaseNames.forEach((phase) => {
    const values = successfulDetails
      .map((item) => item.timingsMs?.[phase])
      .filter((value) => Number.isFinite(value));

    result[phase] = calculateStats(values);
  });

  return result;
}

// Calculate p50, p95, p99 and other statistics
function calculateStats(responseTimes) {
  if (responseTimes.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const sorted = [...responseTimes].sort((a, b) => a - b);
  const count = sorted.length;

  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;

  const min = sorted[0];
  const max = sorted[count - 1];

  const p50 = getPercentile(sorted, 0.5);
  const p95 = getPercentile(sorted, 0.95);
  const p99 = getPercentile(sorted, 0.99);
  const median = p50;

  return {
    count: count,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    p50: Math.round(p50 * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    p99: Math.round(p99 * 100) / 100,
  };
}

// Get percentile from sorted array
function getPercentile(sortedArray, percentile) {
  const index = (sortedArray.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sortedArray[lower];
  }

  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

// Compare providers and determine winner
function compareProviders(providerResults) {
  const providers = Object.keys(providerResults);

  if (providers.length < 2) {
    return { message: "Need at least 2 providers to compare" };
  }

  const comparisons = {};
  const metrics = ["p50", "p95", "p99", "mean"];

  metrics.forEach((metric) => {
    const values = providers.map((p) => ({
      provider: p,
      value: providerResults[p].stats[metric],
    }));

    values.sort((a, b) => a.value - b.value);

    comparisons[metric] = {
      fastest: values[0].provider,
      fastestTime: values[0].value,
      slowest: values[values.length - 1].provider,
      slowestTime: values[values.length - 1].value,
      difference:
        Math.round((values[values.length - 1].value - values[0].value) * 100) /
        100,
      percentImprovement:
        Math.round(
          ((values[values.length - 1].value - values[0].value) /
            values[values.length - 1].value) *
            10000,
        ) / 100,
    };
  });

  // Determine overall winner
  const p50Winner = comparisons.p50.fastest;
  const p95Winner = comparisons.p95.fastest;
  const p99Winner = comparisons.p99.fastest;

  const winCounts = {};
  [p50Winner, p95Winner, p99Winner].forEach((winner) => {
    winCounts[winner] = (winCounts[winner] || 0) + 1;
  });

  const overallWinner = Object.entries(winCounts).sort(
    (a, b) => b[1] - a[1],
  )[0][0];

  return {
    metricComparisons: comparisons,
    overallWinner: overallWinner,
    summary: `${overallWinner} is faster on ${winCounts[overallWinner]}/3 key metrics (p50, p95, p99)`,
  };
}

// Get ETH balance for a wallet address
async function getEthBalance(rpcUrl, walletAddress) {
  const balanceHex = await makeEthCall(rpcUrl, "eth_getBalance", [
    walletAddress,
    "latest",
  ]);
  const balanceWei = BigInt(balanceHex);
  const balanceEth = Number(balanceWei) / Math.pow(10, 18);
  return balanceEth.toString();
}

// Get ERC-20 token balance using eth_call to balanceOf function
async function getTokenBalance(rpcUrl, contractAddress, walletAddress) {
  // ERC-20 balanceOf function signature: balanceOf(address)
  // Function selector: 0x70a08231
  // Parameter: wallet address (32 bytes, padded)

  const functionSelector = "0x70a08231";
  const paddedAddress = walletAddress.slice(2).padStart(64, "0"); // Remove 0x and pad to 64 chars
  const callData = functionSelector + paddedAddress;

  const callParams = {
    to: contractAddress,
    data: callData,
  };

  const resultHex = await makeEthCall(rpcUrl, "eth_call", [
    callParams,
    "latest",
  ]);

  if (!resultHex || resultHex === "0x") {
    return "0";
  }

  // Convert hex result to decimal
  const balanceWei = BigInt(resultHex);

  // Most tokens use 18 decimals, but you might want to get decimals dynamically
  const balanceTokens = Number(balanceWei) / Math.pow(10, 18);
  return balanceTokens.toString();
}

// Get token decimals using eth_call to decimals() function
async function getTokenDecimals(rpcUrl, contractAddress) {
  // decimals() function selector: 0x313ce567
  const callData = "0x313ce567";

  const callParams = {
    to: contractAddress,
    data: callData,
  };

  const resultHex = await makeEthCall(rpcUrl, "eth_call", [
    callParams,
    "latest",
  ]);
  return parseInt(resultHex, 16);
}

// Get the latest block number
async function getLatestBlockNumber(rpcUrl) {
  const blockHex = await makeEthCall(rpcUrl, "eth_blockNumber", []);
  return parseInt(blockHex, 16);
}

// Get token symbol using eth_call to symbol() function
async function getTokenSymbol(rpcUrl, contractAddress) {
  // symbol() function selector: 0x95d89b41
  const callData = "0x95d89b41";

  const callParams = {
    to: contractAddress,
    data: callData,
  };

  const resultHex = await makeEthCall(rpcUrl, "eth_call", [
    callParams,
    "latest",
  ]);

  // Decode the hex string result (skip first 64 chars for offset, then decode)
  if (resultHex && resultHex.length > 66) {
    // 0x + 64 chars offset + data
    const symbolHex = resultHex.slice(66); // Skip 0x and offset
    const symbolBytes = Buffer.from(symbolHex, "hex");
    return symbolBytes.toString("utf8").replace(/\0/g, "");
  }

  return "UNKNOWN";
}

module.exports = {
  handler,
};
