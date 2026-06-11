import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { rewriteHtml } from "../src/htmlRewriter";

const ORIGIN = "https://upstream.example.com";

async function rewrite(html: string, origin = ORIGIN): Promise<string> {
  const response = new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
  return rewriteHtml(response, origin).text();
}

describe("rewriteHtml", () => {
  it("rewrites href attributes containing the upstream origin", async () => {
    const html = `<a href="${ORIGIN}/foo/bar">link</a>`;
    const result = await rewrite(html);
    expect(result).toContain('href="/foo/bar"');
    expect(result).not.toContain(ORIGIN);
  });

  it("rewrites src attributes containing the upstream origin", async () => {
    const html = `<img src="${ORIGIN}/img/logo.png">`;
    const result = await rewrite(html);
    expect(result).toContain('src="/img/logo.png"');
    expect(result).not.toContain(ORIGIN);
  });

  it("rewrites form action attributes", async () => {
    const html = `<form action="${ORIGIN}/submit"></form>`;
    const result = await rewrite(html);
    expect(result).toContain('action="/submit"');
    expect(result).not.toContain(ORIGIN);
  });

  it("rewrites srcset attributes (single entry)", async () => {
    const html = `<img srcset="${ORIGIN}/img.jpg 2x">`;
    const result = await rewrite(html);
    expect(result).not.toContain(ORIGIN);
    expect(result).toContain("/img.jpg 2x");
  });

  it("rewrites srcset attributes (multiple entries)", async () => {
    const html = `<img srcset="${ORIGIN}/img.jpg 320w, ${ORIGIN}/img@2x.jpg 640w">`;
    const result = await rewrite(html);
    expect(result).not.toContain(ORIGIN);
    expect(result).toContain("/img.jpg 320w");
    expect(result).toContain("/img@2x.jpg 640w");
  });

  it("does not rewrite URLs from a different origin", async () => {
    const html = `<a href="https://other.com/page">link</a>`;
    const result = await rewrite(html);
    expect(result).toContain("https://other.com/page");
  });

  it("does not rewrite relative URLs", async () => {
    const html = `<a href="/relative/path">link</a>`;
    const result = await rewrite(html);
    expect(result).toContain('href="/relative/path"');
  });

  it("produces a root-relative path when the upstream URL has no path", async () => {
    const html = `<a href="${ORIGIN}">link</a>`;
    const result = await rewrite(html);
    expect(result).toContain('href="/"');
  });

  // Feature: subdomain-masker, Property 5: HTML Upstream URL rewriting
  it("P5 — no upstream origin remains in href attributes after rewriting", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .domain()
          .map((d) => `https://${d}`),
        fc.array(
          fc.stringMatching(/^\/[a-z0-9/_-]{1,30}$/),
          { minLength: 1, maxLength: 6 },
        ),
        async (origin, paths) => {
          const hrefs = paths
            .map((p) => `<a href="${origin}${p}">x</a>`)
            .join("");
          const html = `<html><body>${hrefs}</body></html>`;
          const result = await rewrite(html, origin);
          // No href should still begin with the upstream origin
          expect(result).not.toContain(`href="${origin}`);
        },
      ),
      { numRuns: 200 },
    );
  });
});
