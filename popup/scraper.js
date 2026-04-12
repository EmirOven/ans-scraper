function setStatus(statusElement, message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

function setDownloadState(downloadElement, enabled) {
  downloadElement.classList.toggle("is-disabled", !enabled);
  downloadElement.setAttribute("aria-disabled", String(!enabled));
}

function resetDownloadLink(downloadElement) {
  downloadElement.removeAttribute("href");
  setDownloadState(downloadElement, false);
  downloadElement.textContent = "PDF not ready";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeViewUrl(href) {
  try {
    const url = new URL(href);
    url.pathname = url.pathname.replace("/grading/review/", "/grading/view/");
    return url.toString();
  } catch {
    return href;
  }
}

async function waitForTabComplete(tabId) {
  const tab = await browser.tabs.get(tabId);

  if (tab.status === "complete") {
    return;
  }

  await new Promise((resolve) => {
    const handleUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        browser.tabs.onUpdated.removeListener(handleUpdated);
        resolve();
      }
    };

    browser.tabs.onUpdated.addListener(handleUpdated);
  });
}

async function getNavLinkHrefs(tabId) {
  const response = await browser.tabs.sendMessage(tabId, {
    type: "collectNavLinkHrefs",
  });

  return response ?? { hrefs: [] };
}

function appendScreenshotToPdf(pdfDocument, screenshotDataUrl) {
  const imageProperties = pdfDocument.getImageProperties(screenshotDataUrl);
  const pageWidth = imageProperties.width;
  const pageHeight = imageProperties.height;
  const orientation = pageWidth >= pageHeight ? "landscape" : "portrait";

  if (pdfDocument.getNumberOfPages() === 1 && pdfDocument.__ansIsEmpty) {
    pdfDocument.deletePage(1);
    pdfDocument.__ansIsEmpty = false;
  }

  pdfDocument.addPage([pageWidth, pageHeight], orientation);
  pdfDocument.addImage(
    screenshotDataUrl,
    imageProperties.fileType || "PNG",
    0,
    0,
    pageWidth,
    pageHeight,
  );
}

function buildPdfFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `ans-capture-${timestamp}.pdf`;
}

function isAnsUrl(href) {
  try {
    return new URL(href).hostname === "ans.app";
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return activeTab;
}

function assertSupportedActiveTab(activeTab) {
  if (!activeTab?.id || typeof activeTab.windowId !== "number") {
    throw new Error("No active tab available.");
  }

  if (!isAnsUrl(activeTab.url)) {
    throw new Error("This extension only works on ans.app.");
  }
}

async function ensureCapturePermission() {
  if (typeof browser.tabs.captureTab === "function") {
    return;
  }

  if (typeof browser.tabs.captureVisibleTab !== "function") {
    throw new Error("This browser does not expose a supported tab capture API.");
  }

  if (!browser.permissions?.contains || !browser.permissions?.request) {
    throw new Error("This browser cannot request the capture permission needed for screenshots.");
  }

  const capturePermission = { origins: ["<all_urls>"] };
  const hasCapturePermission = await browser.permissions.contains(capturePermission);

  if (hasCapturePermission) {
    return;
  }

  const granted = await browser.permissions.request(capturePermission);

  if (!granted) {
    throw new Error("The all-websites permission is required to capture the temporary tabs.");
  }
}

async function openAndWaitForAuth(windowId, href) {
  const tab = await browser.tabs.create({
    url: href,
    active: false,
    windowId,
  });

  if (!tab?.id) {
    throw new Error(`Failed to open tab for ${href}`);
  }

  await waitForTabComplete(tab.id);
  return tab;
}

async function redirectToViewUrl(tab) {
  const loadedTab = await browser.tabs.get(tab.id);
  const viewUrl = normalizeViewUrl(loadedTab.url ?? "");

  if (viewUrl && viewUrl !== loadedTab.url) {
    await browser.tabs.update(tab.id, { url: viewUrl });
    await waitForTabComplete(tab.id);
  }

  return tab.id;
}

async function captureLoadedTab(tabId, windowId) {
  const options = {
    format: "jpeg",
    quality: 85,
  };

  if (typeof browser.tabs.captureTab === "function") {
    return browser.tabs.captureTab(tabId, options);
  }

  if (typeof browser.tabs.captureVisibleTab === "function") {
    await browser.tabs.update(tabId, { active: true });
    await delay(300);
    return browser.tabs.captureVisibleTab(windowId, options);
  }

  throw new Error(
    "Screenshot capture is unavailable. Reload the extension and allow the requested all-websites access.",
  );
}

async function processBatch(hrefs, windowId, pdfDocument, renderDelayMs) {
  const [previousActiveTab] = await browser.tabs.query({
    active: true,
    windowId,
  });
  const tabs = await Promise.all(
    hrefs.map((href) => openAndWaitForAuth(windowId, href)),
  );
  const createdTabIds = tabs.map((tab) => tab.id).filter(Boolean);

  try {
    const tabIds = await Promise.all(
      tabs.map((tab) => redirectToViewUrl(tab)),
    );

    await delay(renderDelayMs);

    for (const tabId of tabIds) {
      const screenshotDataUrl = await captureLoadedTab(tabId, windowId);
      appendScreenshotToPdf(pdfDocument, screenshotDataUrl);
    }
  } finally {
    await Promise.all(
      createdTabIds.map((id) => browser.tabs.remove(id).catch(() => {})),
    );

    if (previousActiveTab?.id) {
      await browser.tabs
        .update(previousActiveTab.id, { active: true })
        .catch(() => {});
    }
  }
}

async function runScrape(statusElement, downloadElement, scrapeButton) {
  const batchSize = 4;
  const renderDelayMs = 7000;
  const activeTab = await getActiveTab();
  assertSupportedActiveTab(activeTab);
  await ensureCapturePermission();

  const { error, hrefs } = await getNavLinkHrefs(activeTab.id);

  if (error) {
    throw new Error(error);
  }

  if (hrefs.length === 0) {
    throw new Error("No valid link URLs were collected from the nav.");
  }

  const pdfDocument = new window.jspdf.jsPDF({
    unit: "pt",
    format: "a4",
  });
  pdfDocument.__ansIsEmpty = true;

  const totalBatches = Math.ceil(hrefs.length / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const start = batchIndex * batchSize;
    const batch = hrefs.slice(start, start + batchSize);
    const batchNum = batchIndex + 1;

    setStatus(
      statusElement,
      `Batch ${batchNum}/${totalBatches}: loading ${batch.length} pages...`,
    );

    await processBatch(batch, activeTab.windowId, pdfDocument, renderDelayMs);

    setStatus(
      statusElement,
      `Captured ${Math.min(start + batch.length, hrefs.length)} of ${hrefs.length} pages`,
    );
  }

  const pdfBlob = pdfDocument.output("blob");
  const downloadUrl = URL.createObjectURL(pdfBlob);

  downloadElement.href = downloadUrl;
  downloadElement.download = buildPdfFilename();
  downloadElement.textContent = "Download PDF";
  setDownloadState(downloadElement, true);
  scrapeButton.disabled = false;
  scrapeButton.textContent = "Run again";
  setStatus(statusElement, "PDF ready to download");
}

document.addEventListener("DOMContentLoaded", () => {
  const scrapeButton = document.getElementById("scrape");
  const statusElement = document.getElementById("status");
  const downloadElement = document.getElementById("download");

  resetDownloadLink(downloadElement);

  const startRunnerJob = async () => {
    scrapeButton.textContent = "Running...";
    scrapeButton.disabled = true;
    resetDownloadLink(downloadElement);
    setStatus(statusElement, "Starting scrape...");

    try {
      const activeTab = await getActiveTab();
      assertSupportedActiveTab(activeTab);
      await runScrape(statusElement, downloadElement, scrapeButton);
    } catch (error) {
      console.error(error);
      scrapeButton.disabled = false;
      scrapeButton.textContent = "Retry";
      setStatus(statusElement, error.message, true);
    }
  };

  scrapeButton.addEventListener("click", startRunnerJob);

  void (async () => {
    try {
      const activeTab = await getActiveTab();
      assertSupportedActiveTab(activeTab);
      scrapeButton.disabled = false;
      scrapeButton.textContent = "Scrape it!";
      setStatus(statusElement, "Ready to scrape current tab");
    } catch (error) {
      scrapeButton.disabled = true;
      scrapeButton.textContent = "Unavailable";
      setStatus(statusElement, error.message, true);
    }
  })();
});
