import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "crypto";

// Do not crash the app if keys are missing during UI testing, just fail silently or mock.
const hasKeys = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

const client = hasKeys ? new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}) : null;

const ddbDocClient = client ? DynamoDBDocumentClient.from(client) : null;

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CryptoAgentLogs";

export async function logAction(actionText, isHighlight = false) {
  if (!ddbDocClient) {
    console.warn("[DynamoDB Offline] Missing AWS Keys. Would have logged:", actionText);
    return;
  }

  try {
    const timestamp = Date.now();
    const ttlSeconds = Math.floor(timestamp / 1000) + (7 * 24 * 60 * 60); // Expire in 7 days
    await ddbDocClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: "AGENT_LOG",
          sk: timestamp.toString(),
          time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: actionText,
          highlight: isHighlight,
          ttl: ttlSeconds, // DynamoDB auto-deletes this item after 7 days
        },
      })
    );
    console.log("[DynamoDB Logged]:", actionText);
  } catch (err) {
    console.error("DynamoDB Log Error:", err);
  }
}

export async function getRecentLogs() {
  if (!ddbDocClient) {
    return [
      { sk: 1, time: "System", action: "AWS credentials missing. Logs are offline.", highlight: true }
    ];
  }

  try {
    // We now use Query instead of Scan because it is significantly faster and cheaper.
    const response = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": "AGENT_LOG"
        },
        ScanIndexForward: false, // Return newest items first
        Limit: 20 // Only fetch the exact 20 logs we need
      })
    );
    
    return response.Items || [];
  } catch (err) {
    console.error("DynamoDB Fetch Error:", err);
    return [{ sk: 2, time: "Error", action: "Failed to connect to DynamoDB Table.", highlight: true }];
  }
}

export async function getDeepDiveAnalysis() {
  if (!ddbDocClient) return { error: 'No DB client' };
  
  let allLogs = [];
  let lastEvaluatedKey = undefined;
  
  try {
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

    return {
      totalLogsAnalyzed: allLogs.length,
      totalTrades,
      totalBuys,
      totalSells,
      buyVolumeUsd,
      sellVolumeUsd,
      totalFees,
      coinStats
    };
  } catch (err) {
    console.error("DynamoDB Deep Dive Error:", err);
    return { error: err.message };
  }
}

// ─── Scout Report Persistence ──────────────────────────────────────────────

export async function saveScoutReport(report, generatedAt) {
  if (!ddbDocClient) {
    console.warn("[DynamoDB Offline] Cannot save Scout report — missing AWS keys.");
    return;
  }

  try {
    const timestamp = Date.now();
    const ttlSeconds = Math.floor(timestamp / 1000) + (90 * 24 * 60 * 60); // Expire in 90 days
    await ddbDocClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: "SCOUT_REPORT",
          sk: timestamp.toString(),
          generatedAt: generatedAt || new Date(timestamp).toISOString(),
          assetCount: report.length,
          report: JSON.stringify(report),
          ttl: ttlSeconds, // DynamoDB auto-deletes this item after 90 days
        },
      })
    );
    console.log(`[DynamoDB] Scout report saved — ${report.length} assets.`);
  } catch (err) {
    console.error("DynamoDB Save Scout Error:", err);
  }
}

export async function getScoutReports(limit = 10) {
  if (!ddbDocClient) {
    return [];
  }

  try {
    const response = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": "SCOUT_REPORT"
        },
        ScanIndexForward: false, // Newest first
        Limit: limit,
      })
    );

    // Parse the JSON report string back into an array before returning
    return (response.Items || []).map(item => ({
      ...item,
      report: (() => {
        try { return JSON.parse(item.report); }
        catch { return []; }
      })()
    }));
  } catch (err) {
    console.error("DynamoDB Fetch Scout Error:", err);
    return [];
  }
}

export async function getLastScoutReport() {
  const reports = await getScoutReports(1);
  return reports.length > 0 ? reports[0].report : [];
}

// ─── Strategy CRUD ──────────────────────────────────────────────────────────

function generateId() {
  // crypto.randomUUID() available in Node 14.17+ and all modern Vercel runtimes
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : createHash('sha256').update(Date.now().toString() + Math.random()).digest('hex').slice(0, 16);
}

export async function saveStrategy(strategy) {
  if (!ddbDocClient) return null;
  const id = strategy.id || generateId();
  const now = new Date().toISOString();
  const item = {
    pk: "STRATEGY",
    sk: id,
    id,
    name: strategy.name,
    asset: strategy.asset,
    enabled: strategy.enabled ?? true,
    conditions: JSON.stringify(strategy.conditions || []),
    conditionLogic: strategy.conditionLogic || "ALL",
    action: JSON.stringify(strategy.action || { type: "alert", amount: 0, amountType: "fixed" }),
    notes: strategy.notes || "",
    createdAt: strategy.createdAt || now,
    updatedAt: now,
    lastTriggered: strategy.lastTriggered || null,
    triggerCount: strategy.triggerCount || 0,
    deleted: false,
  };
  await ddbDocClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

export async function getStrategies() {
  if (!ddbDocClient) return [];
  try {
    const res = await ddbDocClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "STRATEGY" },
      ScanIndexForward: false,
    }));
    return (res.Items || [])
      .filter(i => !i.deleted)
      .map(i => ({
        ...i,
        conditions: (() => { try { return JSON.parse(i.conditions); } catch { return []; } })(),
        action: (() => { try { return JSON.parse(i.action); } catch { return { type: "alert" }; } })(),
      }));
  } catch (err) {
    console.error("DynamoDB getStrategies Error:", err);
    return [];
  }
}

export async function toggleStrategy(id, enabled) {
  // Load existing, flip enabled, re-save
  if (!ddbDocClient) return;
  const all = await getStrategies();
  const existing = all.find(s => s.sk === id || s.id === id);
  if (!existing) return;
  await saveStrategy({ ...existing, id, enabled });
}

export async function deleteStrategy(id) {
  // Soft delete — sets deleted: true. No DeleteItem permission required.
  if (!ddbDocClient) return;
  const all = await getStrategies();
  const existing = all.find(s => s.sk === id || s.id === id);
  if (!existing) return;
  const item = {
    ...existing,
    conditions: JSON.stringify(existing.conditions),
    action: JSON.stringify(existing.action),
    deleted: true,
    updatedAt: new Date().toISOString(),
  };
  await ddbDocClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

export async function markStrategyTriggered(id, currentCount) {
  if (!ddbDocClient) return;
  const all = await getStrategies();
  const existing = all.find(s => s.sk === id || s.id === id);
  if (!existing) return;
  await saveStrategy({
    ...existing,
    id,
    lastTriggered: new Date().toISOString(),
    triggerCount: (currentCount || existing.triggerCount || 0) + 1,
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────
export async function getSettings() {
  if (!ddbDocClient) return { autopilotEnabled: false };
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND sk = :sk",
    ExpressionAttributeValues: {
      ":pk": "SETTINGS",
      ":sk": "GLOBAL",
    },
  };
  try {
    const data = await ddbDocClient.send(new QueryCommand(params));
    return data.Items && data.Items.length > 0 ? data.Items[0].settings : { autopilotEnabled: false, liquidatableAssets: [] };
  } catch (error) {
    console.error("Error fetching settings:", error);
    return { autopilotEnabled: false, liquidatableAssets: [] };
  }
}

export async function updateSettings(settingsPatch) {
  if (!ddbDocClient) return console.warn("No DB Client: Mock update settings", settingsPatch);
  
  const current = await getSettings();
  const newSettings = { ...current, ...settingsPatch };
  
  const params = {
    TableName: TABLE_NAME,
    Item: {
      pk: "SETTINGS",
      sk: "GLOBAL",
      settings: newSettings,
      updatedAt: new Date().toISOString(),
    },
  };
  try {
    await ddbDocClient.send(new PutCommand(params));
    return newSettings;
  } catch (error) {
    console.error("Error saving settings:", error);
    throw error;
  }
}
