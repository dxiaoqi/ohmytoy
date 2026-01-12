export class LoopDetector {
  private readonly maxExactRepeats = 3;
  private readonly maxCycleLength = 3;
  private readonly history: string[] = [];
  private readonly maxHistorySize = 20;

  recordAction(actionType: string, details: Record<string, any> = {}): void {
    const output: string[] = [actionType];

    if (actionType === "tool_call") {
      output.push(details.tool_name || "");
      const args = details.args || {};

      if (typeof args === "object" && args !== null) {
        const sortedKeys = Object.keys(args).sort();
        for (const k of sortedKeys) {
          output.push(`${k}=${String(args[k])}`);
        }
      }
    } else if (actionType === "response") {
      output.push(details.text || "");
    }

    const signature = output.join("|");
    this.history.push(signature);

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  checkForLoop(): string | null {
    if (this.history.length < 2) {
      return null;
    }

    if (this.history.length >= this.maxExactRepeats) {
      const recent = this.history.slice(-this.maxExactRepeats);
      if (new Set(recent).size === 1) {
        return `Same action repeated ${this.maxExactRepeats} times`;
      }
    }

    if (this.history.length >= this.maxCycleLength * 2) {
      const history = [...this.history];

      for (
        let cycleLen = 2;
        cycleLen <= Math.min(this.maxCycleLength, Math.floor(history.length / 2));
        cycleLen++
      ) {
        const recent = history.slice(-cycleLen * 2);
        const firstHalf = recent.slice(0, cycleLen);
        const secondHalf = recent.slice(cycleLen);

        if (JSON.stringify(firstHalf) === JSON.stringify(secondHalf)) {
          return `Detected repeating cycle of length ${cycleLen}`;
        }
      }
    }

    return null;
  }

  clear(): void {
    this.history.length = 0;
  }
}
