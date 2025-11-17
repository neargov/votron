import {
  agent,
  agentAccountId,
  agentCall,
  agentInfo,
} from "@neardefi/shade-agent-js";

interface QueueItem<T> {
  call: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timestamp: number;
  retryCount: number;
}

interface QueueStatus {
  isProcessing: boolean;
  queueLength: number;
}

class AgentCallQueue {
  private isProcessing: boolean = false;
  private queue: QueueItem<any>[] = [];
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly OPERATION_TIMEOUT_MS = 30000;

  async enqueue<T>(call: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(`Queue full (max ${this.MAX_QUEUE_SIZE} items)`);
    }

    return new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem<T> = {
        call,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0,
      };

      this.queue.push(queueItem);
      console.log(`🔄 Queued agent call. Queue length: ${this.queue.length}`);

      this.processQueue().catch((err) =>
        console.error("Queue processing error:", err)
      );
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const queueItem = this.queue.shift();
        if (!queueItem) continue;

        await this.processQueueItem(queueItem);

        if (this.queue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setImmediate(() => {
          this.processQueue().catch((err) =>
            console.error("Queue processing error:", err)
          );
        });
      }
    }
  }

  private async processQueueItem(queueItem: QueueItem<any>): Promise<void> {
    const { call, resolve, reject, retryCount } = queueItem;

    try {
      const result = await this.callWithTimeout(call, this.OPERATION_TIMEOUT_MS);
      console.log(`☑️ Queued call completed successfully`);
      resolve(result);
    } catch (error: any) {
      console.error(
        `❌ Queued call failed (attempt ${retryCount + 1}):`,
        error.message
      );

      if (retryCount < 2 && this.shouldRetry(error)) {
        console.log(`🔄 Retrying call (attempt ${retryCount + 2}/3)`);
        await new Promise((resolve) => setTimeout(resolve, 500));

        this.queue.unshift({
          ...queueItem,
          retryCount: retryCount + 1,
          timestamp: Date.now(),
        });
      } else {
        reject(error);
      }
    }
  }

  private async callWithTimeout<T>(
    call: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const callPromise = call();
    callPromise.catch(() => {}); // silence late rejections if timeout wins

    try {
      return await Promise.race<T>([
        callPromise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Operation timed out")),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private shouldRetry(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || "";
    return (
      errorMessage.includes("nonce") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("timed out")
    );
  }

  getStatus(): QueueStatus {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
    };
  }
}

const agentQueue = new AgentCallQueue();

export const queuedAgent = (method: string, args?: any): Promise<any> => {
  return agentQueue.enqueue(() => agent(method, args));
};

export const queuedAgentAccountId = (): Promise<{ accountId: string }> => {
  return agentQueue.enqueue(() => agentAccountId());
};

export const queuedAgentCall = (callArgs: {
  methodName: string;
  args: any;
  contractId?: string;
  gas?: string | number;
  deposit?: string | number;
}): Promise<any> => {
  return agentQueue.enqueue(() => agentCall(callArgs));
};

export const queuedAgentInfo = (): Promise<any> => {
  return agentQueue.enqueue(() => agentInfo());
};

export const getQueueStatus = (): QueueStatus => {
  return agentQueue.getStatus();
};
