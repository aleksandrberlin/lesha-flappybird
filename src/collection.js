// "Коллекция Лёш": which checkpoint photos this player has found.
// The server is the only place this is kept; the set below is just what the
// current page knows, refilled from the server whenever the player changes.
const Collection = (function () {
  let player = "";
  let owned = new Set();
  let loaded = false;
  const pending = [];          // finds the server has not accepted yet

  function flush() {
    if (!pending.length || !player) return;
    const queue = pending.splice(0, pending.length);
    for (const slot of queue) {
      Scores.addFind(player, slot).then((ok) => {
        if (!ok) pending.push(slot);
      });
    }
  }

  return {
    // Every photo the build ships with, in the order they are listed.
    all() {
      return CHECKPOINTS.order.filter((slot) => CHECKPOINT_IMAGES[slot]);
    },

    owned() {
      return owned;
    },

    loaded() {
      return loaded;
    },

    has(slot) {
      return owned.has(slot);
    },

    count() {
      return owned.size;
    },

    missing() {
      return this.all().filter((slot) => !owned.has(slot));
    },

    // Switch to a player and pull their finds from the server.
    use(name) {
      const changed = name !== player;
      player = name || "";
      if (changed) {
        owned = new Set();
        loaded = false;
      }
      if (!player) return Promise.resolve(owned);
      return Scores.finds(player).then((rows) => {
        if (rows) {
          owned = new Set(rows);
          loaded = true;
          flush();
        }
        return owned;
      });
    },

    // Returns true when this photo had not been collected yet.
    add(slot) {
      if (!slot || owned.has(slot)) return false;
      owned.add(slot);
      Scores.addFind(player, slot).then((ok) => {
        if (!ok) pending.push(slot);      // retried the next time we sync
      });
      return true;
    },
  };
})();
