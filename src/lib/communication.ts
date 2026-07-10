import EventEmitter2 from "eventemitter2";

export default class Communication extends EventEmitter2 {
  constructor() {
    super({
      wildcard: true,
      maxListeners: 100,
      ignoreErrors: true,
    });
  }
}
