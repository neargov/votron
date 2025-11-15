import { Hono } from "hono";

interface DebugInfo {
  lastWebSocketMessage: string | null;
  lastEventTime: string | null;
  wsMessageCount: number;
}

interface WebSocketState {
  eventClient: any;
  isConnecting: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  VOTING_CONTRACT_ID: string;
}

export default function createDebugRoutes(
  wsState: WebSocketState,
  debugInfo: DebugInfo
) {
  const debugRoutes = new Hono();

  debugRoutes.get("/websocket-status", (c) => {
    return c.json({
      connected: !!wsState.eventClient,
      isConnecting: wsState.isConnecting,
      reconnectAttempts: wsState.reconnectAttempts,
      votingContract: wsState.VOTING_CONTRACT_ID,
      maxReconnectAttempts: wsState.maxReconnectAttempts,
    });
  });

  debugRoutes.get("/websocket-activity", (c) => {
    return c.json({
      connected: !!wsState.eventClient,
      isConnecting: wsState.isConnecting,
      reconnectAttempts: wsState.reconnectAttempts,
      votingContract: wsState.VOTING_CONTRACT_ID,
      lastMessage: debugInfo.lastWebSocketMessage,
      lastEventTime: debugInfo.lastEventTime,
      messageCount: debugInfo.wsMessageCount,
    });
  });

  debugRoutes.get("/env", (c) => {
    const isDev = process.env.NODE_ENV === "development";

    return c.json({
      nodeEnv: process.env.NODE_ENV,
      hasNearAiKey: !!process.env.NEAR_AI_CLOUD_API_KEY,
      agentAccountId: process.env.AGENT_ACCOUNT_ID,
      votingContract: process.env.VOTING_CONTRACT_ID,
      venearContract: process.env.VENEAR_CONTRACT_ID,
      ...(isDev && {
        nearAiKeyLength: process.env.NEAR_AI_CLOUD_API_KEY?.length || 0,
        allNearAiKeys: Object.keys(process.env).filter((k) =>
          k.toLowerCase().includes("near_ai")
        ),
        envKeysCount: Object.keys(process.env).length,
      }),
    });
  });

  return debugRoutes;
}
