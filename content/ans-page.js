function collectNavLinkHrefs() {
  const navElement = document.querySelector("div.split-screen nav");

  if (!navElement) {
    return {
      error: "No nav found inside div.split-screen.",
      hrefs: [],
    };
  }

  const navLinks = Array.from(navElement.querySelectorAll("div a"));

  if (navLinks.length === 0) {
    return {
      error: "No links found inside nav div elements.",
      hrefs: [],
    };
  }

  return {
    hrefs: navLinks
      .map((navLink) => navLink.href)
      .filter((href) => typeof href === "string" && href.length > 0),
  };
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "collectNavLinkHrefs") {
    return Promise.resolve(collectNavLinkHrefs());
  }

  return undefined;
});
