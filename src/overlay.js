// The "who are you?" dialog. It is real DOM rather than canvas art, so phones
// pop up their own keyboard and the field behaves the way people expect.
const NameDialog = (function () {
  const root = document.getElementById("dialog");
  const form = document.getElementById("nameForm");
  const input = document.getElementById("nameInput");
  const error = document.getElementById("nameError");
  const cancel = document.getElementById("nameCancel");
  const title = document.getElementById("nameTitle");

  let resolveOpen = null;
  let allowCancel = false;

  // Only characters the bitmap font can draw may end up on the scoreboard.
  function sanitize(value) {
    return value
      .toUpperCase()
      .split("")
      .filter((ch) => isPrintable(ch))
      .join("")
      .replace(/^\s+/, "")
      .slice(0, Scores.MAX_NAME);
  }

  input.addEventListener("input", () => {
    const start = input.selectionStart;
    const clean = sanitize(input.value);
    if (clean !== input.value) {
      input.value = clean;
      if (start !== null) input.setSelectionRange(Math.min(start, clean.length), Math.min(start, clean.length));
    }
    error.textContent = "";
  });

  function close(value) {
    root.classList.add("hidden");
    document.body.classList.remove("dialog-open");
    const done = resolveOpen;
    resolveOpen = null;
    if (done) done(value);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = sanitize(input.value).trim();
    if (!name) {
      error.textContent = "Введите имя";
      input.focus();
      return;
    }
    close(name);
  });

  cancel.addEventListener("click", () => { if (allowCancel) close(null); });

  window.addEventListener("keydown", (e) => {
    if (resolveOpen && e.key === "Escape" && allowCancel) { e.preventDefault(); close(null); }
  }, true);

  return {
    isOpen: () => !!resolveOpen,
    open(opts) {
      const o = opts || {};
      allowCancel = !!o.allowCancel;
      title.textContent = o.title || "Кто вы?";
      cancel.style.display = allowCancel ? "" : "none";
      input.value = sanitize(o.current || "");
      error.textContent = "";
      root.classList.remove("hidden");
      document.body.classList.add("dialog-open");
      // iOS only opens the keyboard from inside a user gesture chain, so focus
      // as soon as the dialog is painted.
      requestAnimationFrame(() => { input.focus(); input.select(); });
      return new Promise((resolve) => { resolveOpen = resolve; });
    },
  };
})();
