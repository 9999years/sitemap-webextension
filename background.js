// Returns a comparison function (for use with Array.sort) that applies `mapper`
// to its inputs before comparing them with `<` and `>`.
function mapCompare(mapper) {
  return (a, b) => {
    a = mapper(a);
    b = mapper(b);
    if (a < b) { return -1; }
    if (a > b) { return 1; }
    return 0;
  };
}

// Returns a comparison function that sorts by the input comparison functions,
// using the 2nd comparison function as a "tiebreaker" in case the two inputs
// are equal according to the 1st comparison function, and so on.
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

// See: https://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd
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

// Gets the url of the current tab.
// The API for this is annoying.
// Returns a Promise<string>.
function getCurrentTabURL() {
  return browser.tabs.query({
    active: true,
    currentWindow: true
  }).then(tabs => tabs[0].url)
}

// Reads a sitemap from a Response and parses the urls into a
// Promise<Array<{
//   loc: string,
//   lastmod: string?,
//   changefreq: string?,
//   priority: float? }>
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

// Turns a sitemap object (see above.....) into a human-readable (kinda)
// description. For the omnibox suggestions.
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

// This is actually like. help text or something?
// Who cares. I hate this API.
browser.omnibox.setDefaultSuggestion({
  description: "Search sitemap.xml",
});

// Okay, so `text` here is the user input into the omnibox after the `sitemap `
// keyword and space(s).
// So we turn it into a better url, then sort and filter to get an array of
// suggestion objects.
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

// Gluing shit together.
browser.omnibox.onInputChanged.addListener((text, addSuggestions) => {
  buildSuggestions(text).then(addSuggestions)
});

// I can't believe they don't provide this by default. Meaningless boilerplate.
browser.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = text;
  ({
    currentTab: () => browser.tabs.update({ url }),
    newForegroundTab: () => browser.tabs.create({ url }),
    newBackgroundTab: () => browser.tabs.create({ url, active: false }),
  }[disposition]());
});