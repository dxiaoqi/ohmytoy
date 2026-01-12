import { resolve, relative, dirname } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";

export function resolvePath(base: string, path: string): string {
  const pathObj = path.startsWith("/") ? path : resolve(base, path);
  return resolve(pathObj);
}

export function displayPathRelToCwd(
  path: string,
  cwd?: string
): string {
  try {
    if (cwd) {
      try {
        return relative(cwd, path);
      } catch {
        // Path is not relative to cwd
      }
    }
    return path;
  } catch {
    return path;
  }
}

export function ensureParentDirectory(path: string): string {
  const pathObj = resolve(path);
  const parent = dirname(pathObj);
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  return pathObj;
}

export function isBinaryFile(path: string): boolean {
  try {
    const buffer = readFileSync(path);
    const chunk = buffer.slice(0, 8192);
    return chunk.includes(0);
  } catch {
    return false;
  }
}
