const browserApi = globalThis.browser ?? globalThis.chrome;

function isAnsUrl(href) {
  try {
    return new URL(href).hostname === "ans.app";
  } catch {
    return false;
  }
}

function buildRunnerUrl(tab) {
  const runnerUrl = new URL(browserApi.runtime.getURL("popup/scraper.html"));

  if (tab?.id && typeof tab.windowId === "number" && isAnsUrl(tab.url)) {
    runnerUrl.searchParams.set("sourceTabId", String(tab.id));
    return runnerUrl.toString();
  }

  runnerUrl.searchParams.set(
    "error",
    "Open the extension from an ans.app tab.",
  );
  return runnerUrl.toString();
}

browserApi.action.onClicked.addListener((tab) => {
  return browserApi.tabs.create({
    url: buildRunnerUrl(tab),
  });
});
