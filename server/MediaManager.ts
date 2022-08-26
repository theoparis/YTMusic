import fs from "fs";
import { join } from "path";
import config from "./config";
import { Album, Artist, ArtistMeta, QueuedAction, Track } from "./struct";

export function sanitizeFileName(str: string) {
  return [...str]
    .map((c) => (config.disallowFilesystemCharacters.includes(c) ? "_" : c))
    .join("");
}

type QueueListener = () => any;
export default class MediaManager {
  private events: {
    id: QueuedAction["type"];
    run: (action: QueuedAction) => any;
  }[] = [];
  public dir: string;
  private _artists: ArtistMeta[] = [];
  public get artists() {
    return this._artists.sort((a1, a2) =>
      a1.name.toLowerCase() > a2.name.toLowerCase() ? 1 : -1
    );
  }
  public set artists(val: ArtistMeta[]) {
    this._artists = val;
  }
  public queue: QueuedAction[] = [];
  public createdir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    return dir;
  }
  public artistdir(a: Artist) {
    return this.createdir(join(this.dir, sanitizeFileName(a.name)));
  }
  public albumdir(a: Artist, l: Album) {
    return join(this.artistdir(a), sanitizeFileName(l.name));
  }
  public trackdir(a: Artist, l: Album, t: Track) {
    return join(
      this.albumdir(a, l),
      `${String(t.number).padStart(2, "0")} - ${sanitizeFileName(t.title)}.mp3`
    );
  }

  constructor() {
    this.dir = fs.readFileSync(join(process.cwd(), "dir")).toString().trim();
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir);
  }
  public init() {
    fs.readdirSync(process.cwd() + "/serverDist/queue").forEach((r) => {
      require("./queue/" + r);
    });
    this.queueAction({ type: "LibraryScan" });
  }
  public fireQueueUpdate() {
    this.listeners.forEach((l) => l.cb());
  }
  public addEvent<Q extends QueuedAction["type"]>(
    name: Q,
    cb: (action: Extract<QueuedAction, { type: Q }>) => any
  ) {
    this.events.push({ id: name, run: cb });
  }
  public queueAction(action: QueuedAction) {
    action.time = Date.now();
    this.queue.push(action);
    this.fireQueueUpdate();
    this.nextQueue();
  }
  private runningQueue = false;
  private async nextQueue() {
    if (this.runningQueue) return;
    const nextEvent = this.queue.shift();
    if (!nextEvent) return;
    this.runningQueue = true;
    try {
      await this.events.find((e) => e.id == nextEvent.type)?.run(nextEvent);
    } catch (err) {
      console.error(err);
    }
    this.runningQueue = false;
    this.fireQueueUpdate();
    this.nextQueue();
  }

  private listeners: { id: number; cb: QueueListener }[] = [];
  public onQueueUpdate(cb: QueueListener) {
    const id = Date.now();
    this.listeners.push({ id, cb });
    return id;
  }
  public offQueueUpdate(id: number) {
    const i = this.listeners.findIndex((q) => q.id == id);
    if (i >= 0) this.listeners.splice(i, 1);
  }

  public hasArtist(id: string) {
    return !!this.artists.find((a) => a.id == id);
  }
}
