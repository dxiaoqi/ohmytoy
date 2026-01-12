import { Config } from "../config/config.js";
import { ToolRegistry } from "./registry.js";
import { Tool } from "./base.js";
import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { getConfigDir } from "../config/loader.js";

export interface DiscoveryError {
  file: string;
  error: string;
  type: "load" | "parse" | "instantiate";
}

export class ToolDiscoveryManager {
  private config: Config;
  private registry: ToolRegistry;
  private errors: DiscoveryError[] = [];
  private discoveredFiles: Set<string> = new Set();

  constructor(config: Config, registry: ToolRegistry) {
    this.config = config;
    this.registry = registry;
  }

  get discoveryErrors(): DiscoveryError[] {
    return [...this.errors];
  }

  get discoveredToolFiles(): string[] {
    return Array.from(this.discoveredFiles);
  }

  private async loadToolModule(filePath: string): Promise<any> {
    try {
      // Dynamic import for ES modules
      const module = await import(`file://${filePath}`);
      return module;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      this.errors.push({
        file: filePath,
        error: errorMsg,
        type: "load",
      });
      if (this.config.debug) {
        console.error(`[debug]Failed to load tool module ${filePath}: ${errorMsg}`);
      }
      return null;
    }
  }

  private findToolClasses(module: any): Array<new (config: Config) => Tool> {
    const tools: Array<new (config: Config) => Tool> = [];

    if (!module || typeof module !== "object") {
      return tools;
    }

    for (const key of Object.keys(module)) {
      const obj = module[key];
      
      // Check if it's a class that extends Tool
      if (
        typeof obj === "function" &&
        obj.prototype &&
        obj.prototype instanceof Tool &&
        obj !== Tool
      ) {
        tools.push(obj);
      }
    }

    return tools;
  }

  private async discoverFromDirectory(directory: string): Promise<void> {
    const toolDir = join(directory, ".ai-agent", "tools");

    if (!existsSync(toolDir) || !statSync(toolDir).isDirectory()) {
      return;
    }

    try {
      const files = readdirSync(toolDir);
      
      for (const file of files) {
        if (file.startsWith("__") || !file.endsWith(".ts") && !file.endsWith(".js")) {
          continue;
        }

        const filePath = resolve(toolDir, file);

        try {
          const module = await this.loadToolModule(filePath);
          if (!module) {
            continue;
          }

          const toolClasses = this.findToolClasses(module);

          if (toolClasses.length === 0) {
            continue;
          }

          for (const ToolClass of toolClasses) {
            try {
              const tool = new ToolClass(this.config);
              this.registry.register(tool);
              this.discoveredFiles.add(filePath);
            } catch (error: any) {
              const errorMsg = error?.message || String(error);
              this.errors.push({
                file: filePath,
                error: errorMsg,
                type: "instantiate",
              });
              if (this.config.debug) {
                console.error(`[debug]Failed to instantiate tool from ${file}: ${errorMsg}`);
              }
            }
          }
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          this.errors.push({
            file: filePath,
            error: errorMsg,
            type: "parse",
          });
          if (this.config.debug) {
            console.error(`[debug]Failed to discover tools from ${file}: ${errorMsg}`);
          }
          // Continue with other files
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read, skip silently
    }
  }

  async discoverAll(): Promise<void> {
    this.errors = [];
    this.discoveredFiles.clear();
    
    await this.discoverFromDirectory(this.config.cwd);
    
    try {
      const configDir = getConfigDir();
      await this.discoverFromDirectory(configDir);
    } catch (error: any) {
      // Config dir might not exist, skip silently
      if (this.config.debug) {
        console.error(`[debug]Config directory not accessible: ${error?.message || String(error)}`);
      }
    }
  }

  async reload(): Promise<void> {
    // Clear previously discovered tools from registry
    for (const toolName of this.registry.getDiscoveredTools().map(t => t.name)) {
      this.registry.unregisterDiscovered(toolName);
    }
    
    // Re-discover all tools
    await this.discoverAll();
  }
}
