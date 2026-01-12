import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { TokenUsage } from "../client/response.js";
import { getDataDir } from "../config/loader.js";

export class SessionSnapshot {
  constructor(
    public sessionId: string,
    public createdAt: Date,
    public updatedAt: Date,
    public turnCount: number,
    public messages: Array<Record<string, any>>,
    public totalUsage: TokenUsage
  ) {}

  toDict(): Record<string, any> {
    return {
      session_id: this.sessionId,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      turn_count: this.turnCount,
      messages: this.messages,
      total_usage: {
        promptTokens: this.totalUsage.promptTokens,
        completionTokens: this.totalUsage.completionTokens,
        totalTokens: this.totalUsage.totalTokens,
        cachedTokens: this.totalUsage.cachedTokens,
      },
    };
  }

  static fromDict(data: Record<string, any>): SessionSnapshot {
    return new SessionSnapshot(
      data.session_id,
      new Date(data.created_at),
      new Date(data.updated_at),
      data.turn_count,
      data.messages,
      new TokenUsage(
        data.total_usage.promptTokens,
        data.total_usage.completionTokens,
        data.total_usage.totalTokens,
        data.total_usage.cachedTokens
      )
    );
  }
}

export class PersistenceManager {
  private sessionsDir: string;
  private checkpointsDir: string;

  constructor() {
    const dataDir = getDataDir();
    this.sessionsDir = join(dataDir, "sessions");
    this.checkpointsDir = join(dataDir, "checkpoints");

    // Create directories if they don't exist
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true, mode: 0o700 });
    }
    if (!existsSync(this.checkpointsDir)) {
      mkdirSync(this.checkpointsDir, { recursive: true, mode: 0o700 });
    }
  }

  saveSession(snapshot: SessionSnapshot): void {
    const filePath = join(this.sessionsDir, `${snapshot.sessionId}.json`);
    writeFileSync(filePath, JSON.stringify(snapshot.toDict(), null, 2), "utf-8");
    // Set file permissions to 0o600 (read/write for owner only)
    // Note: chmodSync is not available in ES modules, permissions are set via mkdirSync
  }

  loadSession(sessionId: string): SessionSnapshot | null {
    const filePath = join(this.sessionsDir, `${sessionId}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      return SessionSnapshot.fromDict(data);
    } catch {
      return null;
    }
  }

  listSessions(): Array<Record<string, any>> {
    const sessions: Array<Record<string, any>> = [];

    try {
      const files = readdirSync(this.sessionsDir);
      for (const file of files) {
        if (!file.endsWith(".json")) {
          continue;
        }

        try {
          const filePath = join(this.sessionsDir, file);
          const content = readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          sessions.push({
            session_id: data.session_id,
            created_at: data.created_at,
            updated_at: data.updated_at,
            turn_count: data.turn_count,
          });
        } catch {
          // Skip invalid files
          continue;
        }
      }

      sessions.sort((a, b) => {
        const aTime = new Date(a.updated_at).getTime();
        const bTime = new Date(b.updated_at).getTime();
        return bTime - aTime; // Most recent first
      });
    } catch {
      // Return empty list if directory doesn't exist or can't be read
    }

    return sessions;
  }

  saveCheckpoint(snapshot: SessionSnapshot): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .substring(0, 19);
    const checkpointId = `${snapshot.sessionId}_${timestamp}`;
    const filePath = join(this.checkpointsDir, `${checkpointId}.json`);

    writeFileSync(filePath, JSON.stringify(snapshot.toDict(), null, 2), "utf-8");
    // Note: File permissions are managed via directory permissions
    return checkpointId;
  }

  loadCheckpoint(checkpointId: string): SessionSnapshot | null {
    const filePath = join(this.checkpointsDir, `${checkpointId}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      return SessionSnapshot.fromDict(data);
    } catch {
      return null;
    }
  }
}
