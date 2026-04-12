# Ans Scraper

Sick of screenshotting every single question, rubric, and answer on your Ans results page? This browser extension does it for you with one click and every page is captured and turned into a downloadable PDF. Share it with friends, feed it to an AI, or just keep it for your own review.

It also restores the download button on Ans's embedded PDF viewer so you can grab the exam paper itself.

## Features
- **One-click PDF export:** captures all pages of your test results into a single file
- **Batch processing:**  opens 4 tabs at a time for faster capture
- **Smart orientation:** auto-detects portrait/landscape per page
- **Restores PDF controls:** unhides the download and print buttons on Ans's embedded PDF viewer
- **Cross-browser support:** — works on Firefox and Chrome/Chromium(approval phase) thanks to Manifest V3.

## Install

### Firefox

Install from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/ans-scraper/).

### Chrome

Not yet published on the Chrome Web Store. To install manually:

1. Download or clone this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder

## Usage

1. Open a graded test on [ans.app](https://ans.app/)
2. Click the **Ans Scraper** icon in the toolbar
3. A runner tab opens and starts capturing each answer page
4. Once done, click **Download PDF**

The generated file is named `ans-capture-<timestamp>.pdf`.

## How it works

When you click the extension icon, a background script opens a dedicated runner tab. The runner:

1. Sends a message to the content script on the Ans page to collect all navigation links
2. Opens pages in batches of 4, waits for them to render, and captures each as a JPEG screenshot
3. Assembles all screenshots into a PDF using [jsPDF](https://github.com/parallax/jsPDF)
4. Cleans up the temporary tabs and presents a download link

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Access the current Ans tab to read navigation links |
| `tabs` | Open, capture, and close temporary tabs during scraping |
| `<all_urls>` | Required by Firefox to use the tab screenshot API |

No data is collected or sent anywhere. Everything runs locally in your browser.
## Changelog

| Version   | Changes                                                                      |
| --------- | ---------------------------------------------------------------------------- |
| **1.3.6** | Background-launched runner tab — same flow for Firefox and Chrome            |
| **1.3.5** | Dedicated runner tab on Chrome so the UI stays open during capture           |
| **1.3.4** | Fixed permission issues with the add-on store version                        |
| **1.3.3** | Made broad website access required so Firefox capture works without prompts  |
| **1.3.2** | Request broad capture access at runtime for Firefox                          |
| **1.3.1** | Fixed Firefox screenshot capture permission handling, added capture fallback |
| **1.3**   | Restore download/print buttons on the PDF viewer                             |
| **1.2.1** | Bugfix, switched to non-minified jsPDF                                       |
| **1.2**   | Preparing for Mozilla packaging                                              |
| **1.1**   | Icons added                                                                  |
| **1.0**   | Initial release                                                              |

## Contributing

The extension is still in early stages there are missing features and the UI could use some love. Contributions of any size are welcome.

**Want to contribute code?**

1. Fork the repo
2. Create a branch for your change
3. Test the extension locally by loading it as a temporary add-on ([Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) / [Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked))
4. Open a pull request

**Don't know how to code?**

You can still help by [reporting bugs or suggesting features](https://github.com/EmirOven/ans-scraper/issues) on the Issues page.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
