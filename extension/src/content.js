(() => {
  const { API_URL, DEFAULTS, verdict, appIdFromHref } = SSF;

  let settings = { ...DEFAULTS };
  let myVotes = {};
  let voterId = null;

  const games = new Map();
  const hosts = new Map();
  const currentApp = location.pathname.startsWith("/app/")
    ? appIdFromHref(location.pathname)
    : null;

  init();

  async function init() {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get(DEFAULTS),
      chrome.storage.local.get({ myVotes: {}, voterId: null }),
    ]);
    settings = { ...DEFAULTS, ...sync };
    myVotes = local.myVotes;
    voterId = local.voterId;
    if (!voterId) {
      voterId = crypto.randomUUID();
      chrome.storage.local.set({ voterId });
    }

    applyModeClass();
    if (currentApp) injectAppPanel();
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener(onStorageChanged);
  }

  let scanTimer = 0;
  function scheduleScan() {
    if (!scanTimer) scanTimer = setTimeout(() => ((scanTimer = 0), scan()), 200);
  }

  function scan() {
    for (const a of document.querySelectorAll('a[href*="/app/"]:not([data-ssf])')) {
      const appid = appIdFromHref(a.getAttribute("href"));
      if (!appid || appid === currentApp) {
        a.dataset.ssf = "1";
        continue;
      }
      // Sale pages render links before their images, so retry until resolved.
      const host = findHost(a, appid);
      if (host) {
        a.dataset.ssf = "1";
        if (host !== true) decorate(host, appid);
      }
    }
    for (const [appid, set] of hosts) {
      for (const h of set) {
        if (!h.isConnected) set.delete(h);
        // React re-renders can drop our badge.
        else if (!h.querySelector(":scope > .ssf-badge")) h.appendChild(makeBadge(appid));
      }
      if (!set.size) hosts.delete(appid);
      else render(appid);
    }
    updateToggle();
  }

  // The capsule is the outermost ancestor that only links to this one game.
  function findHost(a, appid) {
    if (a.closest(".ssf-badge, .ssf-panel")) return true;
    let host = a;
    if (!a.classList.contains("search_result_row")) {
      for (let i = 0; i < 3; i++) {
        const p = host.parentElement;
        if (!p || p === document.body) break;
        const links = p.querySelectorAll('a[href*="/app/"]');
        if ([...links].some((l) => appIdFromHref(l.getAttribute("href")) !== appid)) break;
        host = p;
      }
      if (!host.querySelector("img")) return null;
    }
    if (host.dataset.ssfHost || host.closest("[data-ssf-host]")) return true;
    return host;
  }

  function decorate(host, appid) {
    host.dataset.ssfHost = appid;
    if (getComputedStyle(host).position === "static") host.classList.add("ssf-host-rel");
    host.appendChild(makeBadge(appid));
    if (!hosts.has(appid)) hosts.set(appid, new Set());
    hosts.get(appid).add(host);
    visibility.observe(host);
    render(appid);
  }

  const visibility = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        visibility.unobserve(e.target);
        queueLookup(e.target.dataset.ssfHost);
      }
    },
    { rootMargin: "600px" }
  );

  function makeBadge(appid) {
    const badge = document.createElement("div");
    badge.className = "ssf-badge";
    badge.innerHTML =
      '<button type="button" class="ssf-slop-btn" title="Mark as AI slop"></button>' +
      '<button type="button" class="ssf-legit-btn" title="Mark as not slop"></button>' +
      '<span class="ssf-ai" hidden>AI</span>';
    // The badge usually sits inside an <a>; don't let clicks navigate.
    for (const type of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
      badge.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === "click") e.preventDefault();
      });
    }
    badge.querySelector(".ssf-slop-btn").addEventListener("click", () => vote(appid, 1));
    badge.querySelector(".ssf-legit-btn").addEventListener("click", () => vote(appid, -1));
    return badge;
  }

  function render(appid) {
    const game = games.get(appid);
    const mine = myVotes[appid] || 0;
    const v = verdict(settings, mine, game);

    for (const host of hosts.get(appid) || []) {
      host.classList.toggle("ssf-slop", v.slop);
      const badge = host.querySelector(":scope > .ssf-badge");
      if (!badge) continue;
      badge.classList.toggle("ssf-flagged", v.slop);
      badge.title = v.reason;
      const slopBtn = badge.querySelector(".ssf-slop-btn");
      const legitBtn = badge.querySelector(".ssf-legit-btn");
      slopBtn.textContent = game ? `🤖 ${game.slop}` : "🤖";
      legitBtn.textContent = game ? `👍 ${game.legit}` : "👍";
      slopBtn.classList.toggle("ssf-on", mine === 1);
      legitBtn.classList.toggle("ssf-on", mine === -1);
      const ai = badge.querySelector(".ssf-ai");
      ai.hidden = !(game && game.ai);
      ai.title = game && game.ai ? "Developer AI disclosure: " + (game.aiText || "(no details)") : "";
    }
    if (appid === currentApp) renderAppPanel();
  }

  function renderAll() {
    for (const appid of hosts.keys()) render(appid);
    if (currentApp) renderAppPanel();
    updateToggle();
  }

  let toggle = null;
  function updateToggle() {
    if (settings.mode !== "hide") {
      if (toggle) toggle.hidden = true;
      return;
    }
    const n = document.querySelectorAll("[data-ssf-host].ssf-slop").length;
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.className = "ssf-toggle";
      toggle.addEventListener("click", () => {
        document.documentElement.classList.toggle("ssf-show-hidden");
        updateToggle();
      });
      document.body.appendChild(toggle);
    }
    const showing = document.documentElement.classList.contains("ssf-show-hidden");
    toggle.hidden = n === 0;
    toggle.textContent = showing ? `Hide ${n} slop games` : `${n} slop games hidden · show`;
  }

  function applyModeClass() {
    const cl = document.documentElement.classList;
    cl.remove("ssf-mode-dim", "ssf-mode-hide", "ssf-mode-badge");
    cl.add("ssf-mode-" + settings.mode);
  }

  const lookupQueue = new Set();
  let lookupTimer = 0;
  function queueLookup(appid) {
    if (games.has(appid)) return;
    lookupQueue.add(appid);
    if (!lookupTimer) lookupTimer = setTimeout(flushLookups, 250);
  }

  async function flushLookups() {
    lookupTimer = 0;
    const ids = [...lookupQueue];
    lookupQueue.clear();
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      try {
        const res = await fetch(API_URL + "/games?appids=" + chunk.join(","));
        const data = await res.json();
        for (const id of chunk) {
          if (data.games[id]) games.set(id, data.games[id]);
          render(id);
        }
        updateToggle();
      } catch (err) {
        console.warn("[Steam Slop Filter] lookup failed:", err);
      }
    }
  }

  async function vote(appid, value) {
    const old = myVotes[appid] || 0;
    const next = old === value ? 0 : value;
    if (next) myVotes[appid] = next;
    else delete myVotes[appid];
    chrome.storage.local.set({ myVotes });

    const game = games.get(appid);
    if (game) {
      game.slop += (next === 1) - (old === 1);
      game.legit += (next === -1) - (old === -1);
    }
    render(appid);
    updateToggle();

    try {
      const res = await fetch(API_URL + "/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid: Number(appid), vote: next, voter: voterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      if (game) Object.assign(game, data.score);
      render(appid);
    } catch (err) {
      console.warn("[Steam Slop Filter] vote failed:", err);
    }
  }

  let panel = null;
  function injectAppPanel() {
    const anchor =
      document.querySelector("#game_area_purchase") ||
      document.querySelector(".game_area_purchase_game_wrapper");
    if (!anchor) return;
    panel = document.createElement("div");
    panel.className = "ssf-panel";
    panel.innerHTML =
      "<strong>Is this AI slop?</strong>" +
      '<button type="button" class="ssf-slop-btn">🤖 Slop</button>' +
      '<button type="button" class="ssf-legit-btn">👍 Not slop</button>' +
      '<span class="ssf-meta ssf-community"></span>';
    panel.querySelector(".ssf-slop-btn").addEventListener("click", () => vote(currentApp, 1));
    panel.querySelector(".ssf-legit-btn").addEventListener("click", () => vote(currentApp, -1));
    anchor.parentNode.insertBefore(panel, anchor);
    queueLookup(currentApp);
    renderAppPanel();
  }

  function renderAppPanel() {
    if (!panel) return;
    const mine = myVotes[currentApp] || 0;
    const game = games.get(currentApp);
    panel.querySelector(".ssf-slop-btn").classList.toggle("ssf-on", mine === 1);
    panel.querySelector(".ssf-legit-btn").classList.toggle("ssf-on", mine === -1);
    panel.querySelector(".ssf-community").textContent = game
      ? `Community: ${game.slop} slop · ${game.legit} not slop`
      : "Loading…";
  }

  function onStorageChanged(changes, area) {
    if (area === "sync") {
      for (const [k, { newValue }] of Object.entries(changes)) {
        settings[k] = newValue === undefined ? DEFAULTS[k] : newValue;
      }
      applyModeClass();
      renderAll();
    } else if (area === "local" && changes.myVotes) {
      myVotes = changes.myVotes.newValue || {};
      renderAll();
    }
  }
})();
