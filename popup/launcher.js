const browserApi = globalThis.browser ?? globalThis.chrome;

function setStatus(statusElement, message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

function isAnsUrl(href) {
  try {
    return new URL(href).hostname === "ans.app";
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const [activeTab] = await browserApi.tabs.query({
    active: true,
    currentWindow: true,
  });

  return activeTab;
}

async function openRunner() {
  const activeTab = await getActiveTab();

  if (!activeTab?.id || typeof activeTab.windowId !== "number") {
    throw new Error("No active tab available.");
  }

  if (!isAnsUrl(activeTab.url)) {
    throw new Error("Open the extension from an ans.app tab.");
  }

  const runnerUrl = new URL(browserApi.runtime.getURL("popup/scraper.html"));
  runnerUrl.searchParams.set("sourceTabId", String(activeTab.id));

  await browserApi.tabs.create({
    url: runnerUrl.toString(),
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const statusElement = document.getElementById("status");
  const openButton = document.getElementById("open");

  const startOpen = async () => {
    openButton.hidden = true;
    setStatus(statusElement, "Opening runner...");

    try {
      await openRunner();
      window.close();
    } catch (error) {
      console.error(error);
      setStatus(statusElement, error.message, true);
      openButton.hidden = false;
    }
  };

  openButton.addEventListener("click", startOpen);
  void startOpen();
});
