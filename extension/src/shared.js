(function (root) {
  const API_URL = "https://steam-slop-votes.dangbinh4869.workers.dev";

  const DEFAULTS = {
    mode: "dim",
    minVotes: 3,
    slopRatio: 0.6,
    disclosureIsSlop: false,
  };

  function verdict(settings, myVote, game) {
    if (myVote === 1) return { slop: true, reason: "you voted slop" };
    if (myVote === -1) return { slop: false, reason: "you voted not slop" };
    if (game) {
      const total = game.slop + game.legit;
      if (game.slop >= settings.minVotes && game.slop / total >= settings.slopRatio) {
        return { slop: true, reason: `community: ${game.slop}/${total} slop` };
      }
      if (settings.disclosureIsSlop && game.ai) {
        return { slop: true, reason: "developer disclosed AI content" };
      }
    }
    return { slop: false, reason: "" };
  }

  function appIdFromHref(href) {
    const m = /\/app\/(\d+)/.exec(href || "");
    return m ? m[1] : null;
  }

  const api = { API_URL, DEFAULTS, verdict, appIdFromHref };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SSF = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
