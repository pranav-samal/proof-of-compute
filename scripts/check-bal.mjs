import { ethers } from 'ethers';
const p = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
// Derive addresses from private keys
const keys = [
  ['4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', '#7'],
  ['dbda1821b80551c9d65939329250132c0de68a8df4c26568cc54d4f26bc88cad', '#8'],
  ['2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', '#9'],
];
for (const [key, name] of keys) {
  const w = new ethers.Wallet('0x' + key);
  const bal = await p.getBalance(w.address);
  console.log(name, w.address.slice(0, 12), 'ETH:', ethers.formatEther(bal));
}
