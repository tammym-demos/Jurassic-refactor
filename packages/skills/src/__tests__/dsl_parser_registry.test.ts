import { describe, it, expect, beforeEach } from "vitest";
import {
  DslParserRegistry,
  type DslParser,
  type ParseResult,
} from "../dsl_parser_registry.js";

describe("DslParserRegistry", () => {
  let registry: DslParserRegistry;

  beforeEach(() => {
    registry = new DslParserRegistry();
  });

  // --- C/C++ include parsing ---
  describe("C/C++ includes parser", () => {
    it('parses #include "header.h"', () => {
      const result = registry.parse('#include "header.h"\n', "main.c");
      expect(result.imports).toEqual([
        { source: "header.h", specifiers: [], isDefault: true },
      ]);
    });

    it("parses #include <stdio.h>", () => {
      const result = registry.parse("#include <stdio.h>\n", "main.c");
      expect(result.imports).toEqual([
        { source: "stdio.h", specifiers: [], isDefault: true },
      ]);
    });

    it("parses mixed includes", () => {
      const content = [
        '#include "mylib.h"',
        "#include <stdlib.h>",
        "",
        '#include "utils.h"',
      ].join("\n");
      const result = registry.parse(content, "app.cpp");
      expect(result.imports).toHaveLength(3);
      expect(result.imports[0].source).toBe("mylib.h");
      expect(result.imports[1].source).toBe("stdlib.h");
      expect(result.imports[2].source).toBe("utils.h");
    });
  });

  // --- Python import parsing ---
  describe("Python imports parser", () => {
    it("parses import os", () => {
      const result = registry.parse("import os\n", "script.py");
      expect(result.imports).toEqual([
        { source: "os", specifiers: [], isDefault: true },
      ]);
    });

    it("parses from os.path import join", () => {
      const result = registry.parse(
        "from os.path import join\n",
        "script.py",
      );
      expect(result.imports).toEqual([
        { source: "os.path", specifiers: ["join"], isDefault: false },
      ]);
    });

    it("parses from X import *", () => {
      const result = registry.parse("from utils import *\n", "app.py");
      expect(result.imports).toEqual([
        { source: "utils", specifiers: ["*"], isDefault: false },
      ]);
    });

    it("parses from X import a, b", () => {
      const result = registry.parse(
        "from os.path import join, exists\n",
        "app.py",
      );
      expect(result.imports[0].specifiers).toEqual(["join", "exists"]);
    });
  });

  // --- JS import parsing ---
  describe("JS/Vue imports parser", () => {
    it("parses import X from './x'", () => {
      const result = registry.parse(
        "import X from './x';\n",
        "app.ts",
      );
      expect(result.imports).toEqual([
        { source: "./x", specifiers: ["X"], isDefault: true },
      ]);
    });

    it("parses import { a, b } from './mod'", () => {
      const result = registry.parse(
        "import { a, b } from './mod';\n",
        "app.js",
      );
      expect(result.imports).toEqual([
        { source: "./mod", specifiers: ["a", "b"], isDefault: false },
      ]);
    });

    it("parses const x = require('./x')", () => {
      const result = registry.parse(
        "const x = require('./x');\n",
        "app.js",
      );
      expect(result.imports).toEqual([
        { source: "./x", specifiers: [], isDefault: true },
      ]);
    });

    it("parses export function and export const", () => {
      const content = [
        "export function greet() {}",
        "export const PI = 3.14;",
        "export class Foo {}",
        "export type Bar = string;",
      ].join("\n");
      const result = registry.parse(content, "lib.ts");
      expect(result.exports).toEqual([
        { name: "greet", type: "function" },
        { name: "PI", type: "variable" },
        { name: "Foo", type: "class" },
        { name: "Bar", type: "type" },
      ]);
    });

    it("handles .vue files", () => {
      const result = registry.parse("import App from './App.vue';\n", "main.vue");
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].source).toBe("./App.vue");
    });
  });

  // --- Registry lookup ---
  describe("registry lookup", () => {
    it("finds parser by .c extension", () => {
      const parser = registry.getParser("main.c");
      expect(parser).toBeDefined();
      expect(parser!.name).toBe("c-cpp-includes");
    });

    it("finds parser by .py extension", () => {
      const parser = registry.getParser("script.py");
      expect(parser).toBeDefined();
      expect(parser!.name).toBe("python-imports");
    });

    it("finds parser by .ts extension", () => {
      const parser = registry.getParser("index.ts");
      expect(parser).toBeDefined();
      expect(parser!.name).toBe("js-vue-imports");
    });

    it("returns undefined for unknown extension", () => {
      expect(registry.getParser("data.xml")).toBeUndefined();
    });
  });

  // --- Plugin registration ---
  describe("plugin registration", () => {
    it("registers and uses a custom plugin parser", () => {
      const customParser: DslParser = {
        name: "custom-dsl",
        fileExtensions: [".dsl"],
        parse(): ParseResult {
          return {
            imports: [{ source: "custom", specifiers: [], isDefault: true }],
            exports: [],
            symbols: [{ name: "main", type: "entry", line: 1 }],
          };
        },
      };
      registry.registerPlugin(customParser);
      const parser = registry.getParser("file.dsl");
      expect(parser).toBeDefined();
      expect(parser!.name).toBe("custom-dsl");

      const result = registry.parse("anything", "file.dsl");
      expect(result.imports).toHaveLength(1);
      expect(result.symbols).toHaveLength(1);
    });
  });

  // --- Parse delegation ---
  describe("parse delegation", () => {
    it("returns empty result for unknown extension", () => {
      const result = registry.parse("content", "file.xyz");
      expect(result).toEqual({ imports: [], exports: [], symbols: [] });
    });

    it("delegates to the correct parser based on extension", () => {
      const pyResult = registry.parse("import os\n", "test.py");
      expect(pyResult.imports[0].source).toBe("os");

      const cResult = registry.parse('#include "foo.h"\n', "test.c");
      expect(cResult.imports[0].source).toBe("foo.h");
    });
  });

  // --- listParsers ---
  describe("listParsers", () => {
    it("lists all registered default parsers", () => {
      const parsers = registry.listParsers();
      const names = parsers.map((p) => p.name).sort();
      expect(names).toEqual(["c-cpp-includes", "js-vue-imports", "python-imports"]);
    });
  });
});
