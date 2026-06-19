import { describe, expect, it } from "vitest";
import {
  getFaviconHostVariants,
  getHostnameFromUrl,
  getSourceDomain,
  getSourceFaviconCandidates,
  getSourceLetter,
  normalizeSourceUrl,
} from "../sourceFavicon";

describe("sourceFavicon", () => {
  it("normalizes markdown and citation prefixes", () => {
    expect(normalizeSourceUrl("> https://example.com/page")).toBe(
      "https://example.com/page"
    );
    expect(normalizeSourceUrl("[Example](https://foo.com/a)")).toBe(
      "https://foo.com/a"
    );
  });

  it("prefers URL hostname over domain label", () => {
    expect(
      getSourceDomain(
        "https://us.ovhcloud.com/learn/what-is-dbms/",
        "ovhcloud.com"
      )
    ).toBe("us.ovhcloud.com");
  });

  it("uses domain label when URL is a Google grounding redirect", () => {
    expect(
      getSourceDomain(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/some-token",
        "ovh.com"
      )
    ).toBe("ovh.com");
  });

  it("extracts hostname from bare domains", () => {
    expect(getHostnameFromUrl("https://www.youtube.com/watch?v=1")).toBe(
      "youtube.com"
    );
  });

  it("never uses punctuation for letter avatars", () => {
    expect(getSourceLetter(">example.com")).toBe("E");
    expect(getSourceLetter("us.ovhcloud.com")).toBe("U");
  });

  it("includes subdomain and root host variants", () => {
    expect(
      getFaviconHostVariants("https://us.ovhcloud.com/learn/what-is-dbms/")
    ).toEqual(["us.ovhcloud.com", "ovhcloud.com"]);
  });

  it("builds favicon candidates with page url and subdomain host", () => {
    const candidates = getSourceFaviconCandidates(
      "https://us.ovhcloud.com/learn/what-is-dbms/",
      "ovhcloud.com"
    );
    const gstatic = candidates.find((url) => url.includes("gstatic.com/faviconV2"));
    expect(gstatic).toBeTruthy();
    expect(gstatic).toContain(encodeURIComponent("https://us.ovhcloud.com/learn/what-is-dbms/"));
    expect(candidates.some((url) => url.includes("icons.duckduckgo.com/ip3/us.ovhcloud.com.ico"))).toBe(
      true
    );
  });
});
