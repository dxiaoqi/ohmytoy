import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { parse } from "toml";
import { createConfig, Config } from "./config.js";
import { ConfigError } from "../utils/errors.js";
import * as os from "os";

const CONFIG_FILE_NAME = "config.toml";
const AGENT_MD_FILE = "AGENT.MD";

export function getConfigDir(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  if (platform === "win32") {
    return join(homeDir, "AppData", "Roaming", "ai-agent");
  } else if (platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "ai-agent");
  } else {
    return join(homeDir, ".config", "ai-agent");
  }
}

function getDataDir(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  if (platform === "win32") {
    return join(homeDir, "AppData", "Local", "ai-agent");
  } else if (platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "ai-agent");
  } else {
    return join(homeDir, ".local", "share", "ai-agent");
  }
}

export function getSystemConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE_NAME);
}

function parseTomlFile(path: string): any {
  try {
    const content = readFileSync(path, "utf-8");
    return parse(content);
  } catch (error: any) {
    if (error.name === "SyntaxError") {
      throw new ConfigError(`Invalid TOML in ${path}: ${error.message}`, {
        configFile: path,
      });
    }
    throw new ConfigError(`Failed to read config file ${path}: ${error.message}`, {
      configFile: path,
    });
  }
}

function getProjectConfig(cwd: string): string | null {
  const current = resolve(cwd);
  const agentDir = join(current, ".ai-agent");

  if (existsSync(agentDir)) {
    const configFile = join(agentDir, CONFIG_FILE_NAME);
    if (existsSync(configFile)) {
      return configFile;
    }
  }

  return null;
}

function getAgentMdFiles(cwd: string): string | null {
  const current = resolve(cwd);

  if (existsSync(current)) {
    const agentMdFile = join(current, AGENT_MD_FILE);
    if (existsSync(agentMdFile)) {
      return readFileSync(agentMdFile, "utf-8");
    }
  }

  return null;
}

function mergeDicts(
  base: Record<string, any>,
  override: Record<string, any>
): Record<string, any> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      key in result &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key]) &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = mergeDicts(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Convert snake_case to camelCase for compatibility
function normalizeConfigKeys(config: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(config)) {
    // Convert snake_case to camelCase
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    // Recursively normalize nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      normalized[camelKey] = normalizeConfigKeys(value);
    } else {
      normalized[camelKey] = value;
    }
  }
  
  return normalized;
}

export function loadConfig(cwd?: string): Config {
  cwd = cwd || process.cwd();

  const systemPath = getSystemConfigPath();

  let configDict: Record<string, any> = {};

  if (existsSync(systemPath)) {
    try {
      const rawConfig = parseTomlFile(systemPath);
      configDict = normalizeConfigKeys(rawConfig);
    } catch (error: any) {
      if (error instanceof ConfigError) {
        console.warn(`Skipping invalid system config: ${systemPath}`);
      }
    }
  }

  const projectPath = getProjectConfig(cwd);
  if (projectPath) {
    try {
      const rawProjectConfig = parseTomlFile(projectPath);
      const normalizedProjectConfig = normalizeConfigKeys(rawProjectConfig);
      configDict = mergeDicts(configDict, normalizedProjectConfig);
    } catch (error: any) {
      if (error instanceof ConfigError) {
        console.warn(`Skipping invalid project config: ${projectPath}`);
      }
    }
  }

  if (!configDict.cwd) {
    configDict.cwd = cwd;
  }

  if (!configDict.developerInstructions) {
    const agentMdContent = getAgentMdFiles(cwd);
    if (agentMdContent) {
      configDict.developerInstructions = agentMdContent;
    }
  }

  try {
    return createConfig(configDict);
  } catch (error: any) {
    throw new ConfigError(`Invalid configuration: ${error.message}`, {
      cause: error,
    });
  }
}

export { getDataDir };
