# lambda-app

# Lambda RPC Comparison Test

Benchmarks `eth_call` response times between two RPC providers (QuickNode vs Alchemy) across 8 Uniswap V3 call patterns, running multiple iterations to produce p50/p95/p99 latency stats.

## Setup

**1. Install Node.js**

```bash
# Amazon Linux / EC2
sudo dnf install -y nodejs
```

**2. Install dependencies**

```bash
npm install dotenv
```

**3. Configure environment**

Create a `.env` file in this directory:

```
qn_eth_mainnet=https://your-quicknode-endpoint
alchemy_eth_mainnet=https://your-alchemy-endpoint
```

## Run

```bash
node local_test.js
```

Results are printed as ASCII bar charts and saved to `results/test-<timestamp>.json`.
