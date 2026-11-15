#!/usr/bin/env bash
set -e

# Proof-of-Compute local full-stack startup script
# Starts all services in the correct dependency order using separate terminals (no Docker required)

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

echo "==> Starting local Proof-of-Compute stack"
echo "Repository root: $REPO_ROOT"
echo ""

# Function to start a service in a new terminal-like process
# On macOS/Linux this uses 'open -a Terminal' or 'gnome-terminal'; on Windows it uses 'start' in git bash
start_service() {
  local name="$1"
  local cmd="$2"
  local cwd="${3:-.}"
  
  echo "[${name}] Starting: $cmd"
  
  # Try different terminal methods
  if command -v open &>/dev/null && [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open -a Terminal "$cmd"
  elif command -v gnome-terminal &>/dev/null; then
    # Linux
    gnome-terminal -- bash -c "cd '$cwd' && $cmd; read -p 'Press enter to close...'"
  elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows (git bash)
    start bash -c "cd '$cwd' && $cmd; read -p 'Press enter to close...'"
  else
    # Fallback: just run in background
    (cd "$cwd" && eval "$cmd" &)
  fi
}

echo "[1/6] Starting Hardhat node..."
start_service "Hardhat" "npx hardhat node --network hardhat" "contracts"
sleep 3

echo "[2/6] Deploying contracts..."
(cd contracts && npx hardhat run scripts/deploy.ts --network localhost)

echo "[3/6] Starting backend..."
start_service "Backend" "npm run dev" "backend"
sleep 2

echo "[4/6] Starting provider agent..."
start_service "Provider Agent" "npm run provider" "agents"

echo "[5/6] Starting verifier service..."
start_service "Verifier Service" "npm run verifier" "agents"

echo "[6/6] Starting frontend..."
cd frontend
VITE_USE_MOCK=false npm run dev

echo ""
echo "==> Full stack started!"
echo ""
echo "Access the app at: http://localhost:5173"
echo "Backend at: http://localhost:3001"
echo "Hardhat RPC at: http://localhost:8545"
echo ""
echo "To stop all services, close each terminal window."
