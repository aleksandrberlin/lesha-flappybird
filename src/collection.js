// "Коллекция Лёш": which checkpoint photos this player has found.
// Stored locally per player name and mirrored into Supabase, where finds are
// append only - the same rules as the score board.
const Collection = (function () {
  const KEY = "flappyLesha.finds.";

  let player = "";
  let owned = new Set();

  function storageKey(name) {
    return KEY + String(name || "").trim().toUpperCase();
  }

  function readLocal(name) {
    try {
      const raw = localStorage.getItem(storageKey(name));
      const list = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(list) ? list : []);
    } catch (e) {
      return new Set();
    }
  }

  function writeLocal(name, set) {
    try {
      localStorage.setItem(storageKey(name), JSON.stringify(Array.from(set)));
    } catch (e) { /* private mode */ }
  }

  return {
    // Every photo the build ships with, in the order they are listed.
    all() {
      return CHECKPOINTS.order.filter((slot) => CHECKPOINT_IMAGES[slot]);
    },

    owned() {
      return owned;
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

    // Switch to a player: local finds first, then whatever the cloud knows.
    use(name) {
      player = name || "";
      owned = readLocal(player);
      if (!player) return Promise.resolve(owned);
      return Scores.finds(player)
        .then((rows) => {
          let changed = false;
          for (const slot of rows) {
            if (!owned.has(slot)) { owned.add(slot); changed = true; }
          }
          if (changed) writeLocal(player, owned);
          return owned;
        })
        .catch(() => owned);
    },

    // Returns true when this photo had not been collected yet.
    add(slot) {
      if (!slot || owned.has(slot)) return false;
      owned.add(slot);
      writeLocal(player, owned);
      Scores.addFind(player, slot);
      return true;
    },
  };
})();
