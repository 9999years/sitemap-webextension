function mapCompare(mapper) {
  return (a, b) => {
    a = mapper(a);
    b = mapper(b);
    if (a < b) { return -1; }
    if (a > b) { return 1; }
    return 0;
  };
}

function tiebreak(...tiebreakers) {
  return (a, b) => {
    for (const tiebreaker of tiebreakers) {
      const compareResult = tiebreaker(a, b);
      if (compareResult !== 0) {
        return compareResult;
      }
    }
    return 0;
  };
}

function changeFreqToNumber(changeFreq) {
  ["never",
    "yearly",
    "monthly",
    "weekly",
    "daily",
    "hourly",
    "always"].indexOf(changeFreq)
}

function getSitemapURL(text) {
  return getCurrentTabURL()
    .then(currentTabUrl => {
      const baseURL = new URL(text, currentTabUrl).origin;
      return `${baseURL}/sitemap.xml`
    })
}

function getCurrentTabURL() {
  return browser.tabs.query({
    active: true,
    currentWindow: true
  }).then(tabs => tabs[0].url)
}

function getSitemapURLs(response) {
  return response.text()
    .then(text => new DOMParser().parseFromString(text, "application/xml"))
    .then(sitemap => {
      const urlset = sitemap.children[0];
      return Array.from(urlset.children).map(deserializeSitemapURL);
    });
}

// url: a Node in a sitemap.xml
// See: https://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd
function deserializeSitemapURL(url) {
  const ret = {
    priority: 0.5
  };
  for (const el of url.children) {
    ret[el.nodeName] = el.textContent;
  }
  return ret;
}

function getDescription(sitemapUrl) {
  ret = []
  if (sitemapUrl.lastmod !== undefined) {
    ret.push(sitemapUrl.lastmod);
  }
  if (sitemapUrl.changefreq !== undefined) {
    ret.push(`changes ${sitemapUrl.changefreq}`);
  }
  ret.push(`priority ${sitemapUrl.priority}`);
  return ret.join(", ");
}

browser.omnibox.setDefaultSuggestion({
  description: "Search sitemap.xml",
});

function buildSuggestions(text) {
  if (!text.match(/^https?:\/\//)) {
    // If you don't support https in this day and age, type it out.
    text = "https://" + text;
  }

  return getSitemapURL(text)
    .then(url => fetch(url))
    .then(getSitemapURLs)
    .then(urls => urls.sort((a, b) => tiebreak(
      mapCompare(url => url.priority),
      mapCompare(url => url.loc.length),
      mapCompare(url => new Date(url.loc.lastmod)),
      mapCompare(url => changeFreqToNumber(url.changefreq))
    )).filter(
      url => url.loc.startsWith(text)
    ).map(
      url => ({ content: url.loc, description: getDescription(url) })
    ))
}

browser.omnibox.onInputChanged.addListener((text, addSuggestions) => {
  buildSuggestions(text).then(addSuggestions)
});

browser.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = text;
  ({
    currentTab: () => browser.tabs.update({ url }),
    newForegroundTab: () => browser.tabs.create({ url }),
    newBackgroundTab: () => browser.tabs.create({ url, active: false }),
  }[disposition]());
});