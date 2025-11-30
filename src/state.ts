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
      this.state = JSON.parse(raw) as SeenState;
    } catch (err) {
      this.state = {};
    }
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

  private persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf-8");
  }
}
