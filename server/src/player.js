export class Player {
  constructor(id, ws, name, vehicleType) {
    this.id = id;
    this.ws = ws;
    this.name = name;
    this.vehicleType = vehicleType;
    this.ready = false;
    this.connected = true;
    this.joinTime = Date.now();

    // Race state
    this.lap = 0;
    this.checkpointIndex = 0;
    this.rank = 1;
    this.totalTime = 0;
    this.finished = false;

    // Transform relay
    this.lastSnapshot = null;
    this.snapshotSeq = 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      vehicleType: this.vehicleType,
      ready: this.ready,
    };
  }
}
