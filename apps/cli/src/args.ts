export interface CliOptions {
  url: string; json: boolean; out: string; jsonOut: string;
  chunk: number; split: string; map: boolean; links: boolean;
  images: boolean; model: "o200k" | "cl100k" | "approx";
  selector: string; crawl: number; quiet: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const o: CliOptions = {
    url: "", json: false, out: "", jsonOut: "", chunk: 8000, split: "",
    map: true, links: true, images: false, model: "o200k",
    selector: "", crawl: 0, quiet: false
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--json": o.json = true; break;
      case "--out": o.out = next(); break;
      case "--json-out": o.jsonOut = next(); break;
      case "--chunk": o.chunk = Number(next()); break;
      case "--split": o.split = next(); break;
      case "--map": o.map = true; break;
      case "--no-map": o.map = false; break;
      case "--no-links": o.links = false; break;
      case "--images": o.images = true; break;
      case "--model": o.model = next() as CliOptions["model"]; break;
      case "--selector": o.selector = next(); break;
      case "--crawl": o.crawl = Number(next()); break;
      case "--quiet": o.quiet = true; break;
      case "-h": case "--help": positional.push("--help"); break;
      case "-v": case "--version": positional.push("--version"); break;
      default:
        if (a.startsWith("-")) throw new Error(`unknown flag: ${a}`);
        positional.push(a);
    }
  }
  if (positional.includes("--help")) return { ...o, url: "--help" };
  o.url = positional[0] ?? "";
  if (!o.url) throw new Error("url is required: mdz <url>");
  return o;
}
