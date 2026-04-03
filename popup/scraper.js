function setStatus(statusElement, message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

function setDownloadState(downloadElement, enabled) {
  downloadElement.classList.toggle("is-disabled", !enabled);
  downloadElement.setAttribute("aria-disabled", String(!enabled));
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

async function ensureRequiredPermissions() {
  const requiredPermissions = {
    origins: ["https://ans.app/*", "<all_urls>"],
  };
  const granted = await browser.permissions.request(requiredPermissions);

  if (!granted) {
    throw new Error(
      "Required permissions were not granted. Allow access to ans.app and all sites.",
    );
  }
}

async function processHref(tabId, windowId, href, pdfDocument) {
  const renderDelayMs = 1000;
  const createdTab = await browser.tabs.create({
    url: href,
    active: true,
    windowId,
  });

  if (!createdTab?.id) {
    throw new Error(`Failed to open a tab for ${href}`);
  }

  try {
    await waitForTabComplete(createdTab.id);
    await delay(renderDelayMs);

    const loadedTab = await browser.tabs.get(createdTab.id);
    const viewUrl = normalizeViewUrl(loadedTab.url ?? href);

    if (viewUrl && viewUrl !== loadedTab.url) {
      await browser.tabs.update(createdTab.id, { url: viewUrl });
      await waitForTabComplete(createdTab.id);
      await delay(renderDelayMs);
    }

    const screenshotDataUrl = await browser.tabs.captureVisibleTab(windowId, {
      format: "png",
    });

    appendScreenshotToPdf(pdfDocument, screenshotDataUrl);
  } finally {
    await browser.tabs.remove(createdTab.id);
  }
}

async function runScrape(statusElement, downloadElement, scrapeButton) {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab?.id || typeof activeTab.windowId !== "number") {
    throw new Error("No active tab available.");
  }

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

  for (let index = 0; index < hrefs.length; index += 1) {
    setStatus(
      statusElement,
      `Processing ${index + 1} of ${hrefs.length}`,
    );
    await processHref(activeTab.id, activeTab.windowId, hrefs[index], pdfDocument);
    await delay(2000);
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

  downloadElement.removeAttribute("href");
  setDownloadState(downloadElement, false);
  downloadElement.textContent = "PDF not ready";
  setStatus(statusElement, "Ready to scrape current tab");

  const startRunnerJob = async () => {
    scrapeButton.textContent = "Running...";
    scrapeButton.disabled = true;
    setDownloadState(downloadElement, false);
    downloadElement.removeAttribute("href");
    downloadElement.textContent = "PDF not ready";
    setStatus(statusElement, "Starting scrape...");

    try {
      await ensureRequiredPermissions();
      await runScrape(statusElement, downloadElement, scrapeButton);
    } catch (error) {
      console.error(error);
      scrapeButton.disabled = false;
      scrapeButton.textContent = "Retry";
      setStatus(statusElement, error.message, true);
    }
  };

  scrapeButton.addEventListener("click", startRunnerJob);
});
