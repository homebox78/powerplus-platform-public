import fs from "node:fs";
import path from "node:path";
import { parse, compileScript, compileTemplate } from "vue/compiler-sfc";

// .vue 파일을 esbuild 가 읽게 하는 최소 플러그인 (script setup + template)
export const vuePlugin = {
  name: "vue",
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, (args) => {
      const src = fs.readFileSync(args.path, "utf8");
      const { descriptor } = parse(src, { filename: args.path });
      const id = path.basename(args.path).replace(/\W/g, "");
      // <script> 없이 <template> 만 있는 부품(제목·설명 같은 단순 감싸개)
      if (!descriptor.script && !descriptor.scriptSetup && descriptor.template) {
        const t = compileTemplate({ source: descriptor.template.content, filename: args.path, id });
        return { contents: `${t.code}\nexport default { render };`, loader: "ts", resolveDir: path.dirname(args.path) };
      }
      const script = compileScript(descriptor, { id, inlineTemplate: true });
      if (!descriptor.scriptSetup && descriptor.template) {
        const t = compileTemplate({ source: descriptor.template.content, filename: args.path, id });
        return { contents: `${t.code}\n${script.content}`, loader: "ts" };
      }
      return { contents: script.content, loader: "ts", resolveDir: path.dirname(args.path) };
    });
  },
};

