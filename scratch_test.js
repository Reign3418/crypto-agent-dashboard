import { getPortfolioBalances } from './lib/trade.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });

async function run() {
  const b = await getPortfolioBalances();
  console.log("Balances:", b);
}
run();
