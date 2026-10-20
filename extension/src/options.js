(async () => {
  const { DEFAULTS } = SSF;
  const $ = (id) => document.getElementById(id);
  const s = await chrome.storage.sync.get(DEFAULTS);

  for (const r of document.querySelectorAll('input[name="mode"]')) {
    r.checked = r.value === s.mode;
    r.addEventListener("change", () => chrome.storage.sync.set({ mode: r.value }));
  }

  $("minVotes").value = s.minVotes;
  $("minVotes").addEventListener("change", (e) => {
    chrome.storage.sync.set({ minVotes: Math.max(1, parseInt(e.target.value, 10) || DEFAULTS.minVotes) });
  });

  $("slopRatio").value = Math.round(s.slopRatio * 100);
  $("slopRatio").addEventListener("change", (e) => {
    const pct = Math.min(100, Math.max(1, Number(e.target.value) || DEFAULTS.slopRatio * 100));
    chrome.storage.sync.set({ slopRatio: pct / 100 });
  });

  $("disclosureIsSlop").checked = s.disclosureIsSlop;
  $("disclosureIsSlop").addEventListener("change", (e) =>
    chrome.storage.sync.set({ disclosureIsSlop: e.target.checked })
  );
})();
