import { test, expect } from "bun:test";
import { loadDocument } from "../../../packages/core/src/dom";
import { snapshotForFigma } from "../src/figma-snapshot";
import { buildClipboardItemParts } from "../src/figma-copy";

function parseHtml(html: string): Document {
  return loadDocument(html, "https://example.com/");
}

function fakeStyle(props: Record<string, string>): CSSStyleDeclaration {
  const base: Record<string, string> = {
    display: "block",
    visibility: "visible",
    opacity: "1",
    backgroundColor: "transparent",
    backgroundImage: "none",
    color: "rgb(0, 0, 0)",
    fontFamily: "sans-serif",
    fontSize: "16px",
    fontWeight: "400",
    fontStyle: "normal",
    lineHeight: "normal",
    letterSpacing: "normal",
    textAlign: "start",
    textDecorationLine: "none",
    borderWidth: "0px",
    borderStyle: "none",
    borderColor: "rgb(0, 0, 0)",
    borderRadius: "0px",
    boxShadow: "none",
    transform: "none",
    overflow: "visible",
    ...props,
  };
  return base as unknown as CSSStyleDeclaration;
}

function geom(
  el: Element,
  map: Map<Element, { left: number; top: number; width: number; height: number }>,
) {
  return (node: Element) => map.get(node) ?? { left: 0, top: 0, width: 0, height: 0 };
}

test("nested boxes use coordinates relative to the snapshot root", () => {
  const document = parseHtml(
    `<div id="root"><div id="parent"><div id="child"></div></div></div>`,
  );
  const root = document.getElementById("root")!;
  const parent = document.getElementById("parent")!;
  const child = document.getElementById("child")!;
  const g = new Map([
    [root, { left: 0, top: 0, width: 200, height: 200 }],
    [parent, { left: 10, top: 10, width: 100, height: 100 }],
    [child, { left: 30, top: 40, width: 50, height: 50 }],
  ]);
  const styleOf = (el: Element) => fakeStyle({});
  const result = snapshotForFigma(root, undefined, {
    measure: geom(root, g),
    styleOf,
  });
  expect(result.html).toContain("left:30px");
  expect(result.html).toContain("top:40px");
  expect(result.html).not.toContain("left:20px");
});

test("display:none subtree is omitted from the snapshot", () => {
  const document = parseHtml(
    `<div id="root"><div id="visible"></div><div id="hidden"><span>secret</span></div></div>`,
  );
  const root = document.getElementById("root")!;
  const visible = document.getElementById("visible")!;
  const hidden = document.getElementById("hidden")!;
  const g = new Map([
    [root, { left: 0, top: 0, width: 100, height: 100 }],
    [visible, { left: 0, top: 0, width: 50, height: 50 }],
    [hidden, { left: 0, top: 0, width: 50, height: 50 }],
  ]);
  const styleOf = (el: Element) =>
    fakeStyle(
      el.id === "hidden" ? { display: "none" } : {},
    );
  const result = snapshotForFigma(root, undefined, {
    measure: geom(root, g),
    styleOf,
  });
  expect(result.html).not.toContain("secret");
  expect(result.html).not.toContain('data-mdz="span"');
});

test("gradient background-image is kept; url() backgrounds are dropped", () => {
  const document = parseHtml(
    `<div id="root"><div id="grad"></div><div id="photo"></div></div>`,
  );
  const root = document.getElementById("root")!;
  const grad = document.getElementById("grad")!;
  const photo = document.getElementById("photo")!;
  const g = new Map([
    [root, { left: 0, top: 0, width: 100, height: 100 }],
    [grad, { left: 0, top: 0, width: 40, height: 40 }],
    [photo, { left: 0, top: 50, width: 40, height: 40 }],
  ]);
  const styleOf = (el: Element) => {
    if (el.id === "grad") {
      return fakeStyle({
        backgroundImage: "linear-gradient(red, blue)",
      });
    }
    if (el.id === "photo") {
      return fakeStyle({
        backgroundImage: 'url("https://example.com/x.png")',
      });
    }
    return fakeStyle({});
  };
  const result = snapshotForFigma(root, undefined, {
    measure: geom(root, g),
    styleOf,
  });
  expect(result.html).toContain("linear-gradient(red, blue)");
  expect(result.html).not.toContain("example.com");
});

test("same-origin img uses toDataUrl; default hook keeps absolute URL", () => {
  const document = parseHtml(
    `<div id="root"><img id="pic" src="/local.png" /></div>`,
  );
  const root = document.getElementById("root")!;
  const pic = document.getElementById("pic")!;
  const g = new Map([
    [root, { left: 0, top: 0, width: 100, height: 100 }],
    [pic, { left: 5, top: 5, width: 20, height: 20 }],
  ]);
  const styleOf = () => fakeStyle({});
  const withHook = snapshotForFigma(root, undefined, {
    measure: geom(root, g),
    styleOf,
    toDataUrl: (url) =>
      url.endsWith("/local.png") ? "data:image/png;base64,AA==" : null,
  });
  expect(withHook.html).toContain("data:image/png;base64,AA==");

  const doc2 = parseHtml(
    `<div id="root2"><img id="pic2" src="https://cdn.example/x.png" /></div>`,
  );
  const root2 = doc2.getElementById("root2")!;
  const pic2 = doc2.getElementById("pic2")!;
  const g2 = new Map([
    [root2, { left: 0, top: 0, width: 100, height: 100 }],
    [pic2, { left: 0, top: 0, width: 20, height: 20 }],
  ]);
  const plain = snapshotForFigma(root2, undefined, {
    measure: geom(root2, g2),
    styleOf,
  });
  expect(plain.html).toContain("https://cdn.example/x.png");
});

test("maxNodes stops the walk with truncated result and exact node count", () => {
  const document = parseHtml(
    `<div id="n1"><div id="n2"><div id="n3"><div id="n4"><div id="n5"></div></div></div></div></div>`,
  );
  const nodes: Element[] = ["n1", "n2", "n3", "n4", "n5"].map((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing ${id}`);
    return el;
  });
  const g = new Map(
    nodes.map((el, i) => [
      el,
      { left: i * 10, top: 0, width: 80, height: 20 },
    ]),
  );
  const rootNode = nodes[0]!;
  const result = snapshotForFigma(rootNode, { maxNodes: 2 }, {
    measure: geom(rootNode, g),
    styleOf: () => fakeStyle({}),
  });
  expect(result.truncated).toBe(true);
  expect(result.reason.length).toBeGreaterThan(0);
  expect(result.nodes).toBe(2);
});

test("text and attribute values are escaped in output", () => {
  const document = parseHtml(`<div id="root"><p id="p"></p></div>`);
  const root = document.getElementById("root")!;
  const p = document.getElementById("p")!;
  p.appendChild(document.createTextNode('<b> & "q"'));
  const g = new Map([
    [root, { left: 0, top: 0, width: 200, height: 100 }],
    [p, { left: 0, top: 0, width: 200, height: 40 }],
  ]);
  const result = snapshotForFigma(root, undefined, {
    measure: geom(root, g),
    styleOf: () => fakeStyle({}),
  });
  expect(result.html).toContain("&lt;b&gt;");
  expect(result.html).toContain("&amp;");
  expect(result.html).toContain('"q"');
  expect(result.html).not.toMatch(/<b> & "q"/);
});

test("buildClipboardItemParts without PNG omits the image flavour flag", () => {
  const parts = buildClipboardItemParts({
    figmaHtml: "<div>fig</div>",
    markdown: "# hi",
  });
  expect(parts.png).toBe(false);
  expect(parts.html).toBe("<div>fig</div>");
  expect(parts.text).toBe("# hi");
});
