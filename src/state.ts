import fs from "fs";
import path from "path";
import { SeenState } from "./types";

export class StateStore {
  private readonly filePath: string;
  private state: SeenState = {};

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    this.load();
  }

  private load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isSeenState(parsed)) {
        throw new Error("state must be an object whose values are arrays of strings");
      }
      this.state = parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`Ignoring invalid state file ${this.filePath}: ${reason}`);
      }
      this.state = {};
    }
  }

  isInitialized(link: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.state, link);
  }

  get(link: string): string[] {
    return this.state[link] || [];
  }

  has(link: string, id: string): boolean {
    return Boolean(this.state[link]?.includes(id));
  }

  remember(link: string, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    this.state[link] = uniqueIds;
    this.persist();
  }

  add(link: string, ids: string[], maxItems: number): void {
    const merged = Array.from(new Set([...ids, ...this.get(link)])).slice(0, maxItems);
    this.remember(link, merged);
  }

  private persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2), "utf-8");
    fs.renameSync(temporaryPath, this.filePath);
  }
}

function isSeenState(value: unknown): value is SeenState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string")
  );
}
