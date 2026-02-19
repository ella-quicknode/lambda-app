# lambda-app

# Lambda RPC Comparison Test

Benchmarks `eth_call` response times between two endpoints (pointing 2 different clusters), running multiple iterations to produce p50/p95/p99 latency stats.

## Setup

**1. Install Node.js**

```bash
# Amazon Linux / EC2
sudo dnf install -y nodejs
```

**2. Install dependencies**

```bash
# Clone the repo (creates the folder automatically)
git clone https://github.com/ella-quicknode/lambda-app.git
cd lambda-app

# Install dotenv (npm doesn't need init first for a single package)
npm install dotenv
```

**3. Configure environment**

Create a `.env` file in this directory:

```
nano .env
# Add below variables
# qn_eth_mainnet=https://... 
# qn_eth_mainnet_2=https://...
```

## Run

```bash
node local_test.js
```

Results are printed as ASCII bar charts and saved to `results/test-<timestamp>.json`.
