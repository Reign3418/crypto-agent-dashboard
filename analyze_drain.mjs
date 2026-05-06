import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import fs from 'fs';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const ddbDocClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "CryptoAgentLogs";

async function analyzeLogs() {
  console.log("Fetching all AGENT_LOGs from DynamoDB...");
  
  let allLogs = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const response = await ddbDocClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "AGENT_LOG" },
        ExclusiveStartKey: lastEvaluatedKey
      })
    );
    allLogs = allLogs.concat(response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  allLogs.sort((a, b) => parseInt(a.sk) - parseInt(b.sk));

  console.log(`Found ${allLogs.length} total logs.`);
  
  let totalTrades = 0;
  let totalBuys = 0;
  let totalSells = 0;
  let buyVolumeUsd = 0;
  let sellVolumeUsd = 0;
  let totalFees = 0;
  
  const coinStats = {};

  allLogs.forEach(log => {
    const text = log.action;
    
    if (text.includes("✅ Trade Executed:")) {
      totalTrades++;
      
      const isBuy = text.includes("BUY ");
      const isSell = text.includes("SELL ");
      
      const usdMatch = text.match(/for ~\$(.*?)\s/);
      const usdAmount = usdMatch ? parseFloat(usdMatch[1]) : 0;
      
      const coinMatch = text.match(/(?:BUY|SELL)\s+[\d.]+\s+([A-Z]+)\s+for/);
      const coin = coinMatch ? coinMatch[1] : 'UNKNOWN';
      
      const feeMatch = text.match(/Fee:\s+([\d.]+)/);
      const feeAmount = feeMatch ? parseFloat(feeMatch[1]) : 0;
      
      totalFees += feeAmount;
      
      if (!coinStats[coin]) coinStats[coin] = { buys: 0, sells: 0, buyVol: 0, sellVol: 0, fees: 0 };
      coinStats[coin].fees += feeAmount;

      if (isBuy) {
        totalBuys++;
        buyVolumeUsd += usdAmount;
        coinStats[coin].buys++;
        coinStats[coin].buyVol += usdAmount;
      }
      if (isSell) {
        totalSells++;
        sellVolumeUsd += usdAmount;
        coinStats[coin].sells++;
        coinStats[coin].sellVol += usdAmount;
      }
    }
  });

  const report = `
=========================================
      DEEP DIVE: PORTFOLIO DRAIN ANALYSIS
=========================================
Total Logs Analyzed: ${allLogs.length}
Total Trades Executed: ${totalTrades} (Buys: ${totalBuys}, Sells: ${totalSells})
Total Buy Volume (USD): $${buyVolumeUsd.toFixed(2)}
Total Sell Volume (USD): $${sellVolumeUsd.toFixed(2)}
Total Fees Extracted from Logs: $${totalFees.toFixed(4)}

Coin Breakdown:
${Object.entries(coinStats).map(([coin, stat]) => 
  `- ${coin}: ${stat.buys} Buys ($${stat.buyVol.toFixed(2)}), ${stat.sells} Sells ($${stat.sellVol.toFixed(2)}), Fees: $${stat.fees.toFixed(4)}`
).join('\n')}
`;
  
  console.log(report);
}

analyzeLogs().catch(console.error);
