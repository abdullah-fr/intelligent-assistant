// Session memory module — Task 4.1

const MAX_TURNS = 20;

class SessionMemory {
  constructor() {
    this._store = new Map();
  }

  getHistory(tabId) {
    return this._store.get(tabId) || [];
  }

  addTurn(tabId, turn) {
    if (!this._store.has(tabId)) {
      this._store.set(tabId, []);
    }
    const history = this._store.get(tabId);
    history.push(turn);
    while (history.length > MAX_TURNS) {
      history.shift();
    }
  }

  clearTab(tabId) {
    this._store.delete(tabId);
  }
}

export default SessionMemory;
