function rewriteAbsoluteUrl(url: string, upstreamOrigin: string): string {
  if (url.startsWith(upstreamOrigin)) {
    const path = url.slice(upstreamOrigin.length);
    return path.startsWith("/") ? path : `/${path}`;
  }
  return url;
}

// srcset = comma-separated "url [descriptor]" pairs
function rewriteSrcset(srcset: string, upstreamOrigin: string): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.search(/\s/);
      if (spaceIdx === -1) {
        return rewriteAbsoluteUrl(trimmed, upstreamOrigin);
      }
      const url = trimmed.slice(0, spaceIdx);
      const descriptor = trimmed.slice(spaceIdx); // includes leading whitespace
      return rewriteAbsoluteUrl(url, upstreamOrigin) + descriptor;
    })
    .join(", ");
}

class UrlAttributeHandler implements HTMLRewriterElementContentHandlers {
  constructor(
    private readonly attr: string,
    private readonly upstreamOrigin: string,
  ) {}

  element(element: Element): void {
    const value = element.getAttribute(this.attr);
    if (!value) return;
    const rewritten =
      this.attr === "srcset"
        ? rewriteSrcset(value, this.upstreamOrigin)
        : rewriteAbsoluteUrl(value, this.upstreamOrigin);
    if (rewritten !== value) element.setAttribute(this.attr, rewritten);
  }
}

export function rewriteHtml(response: Response, upstreamOrigin: string): Response {
  return new HTMLRewriter()
    .on("a[href]", new UrlAttributeHandler("href", upstreamOrigin))
    .on("[src]", new UrlAttributeHandler("src", upstreamOrigin))
    .on("form[action]", new UrlAttributeHandler("action", upstreamOrigin))
    .on("[srcset]", new UrlAttributeHandler("srcset", upstreamOrigin))
    .transform(response);
}
