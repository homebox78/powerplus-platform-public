/* eslint-disable */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const devCerts = require("office-addin-dev-certs");

const urlDev = "https://localhost:3000/";

module.exports = async (env, options) => {
  const isProd = options.mode === "production";

  const config = {
    devtool: isProd ? false : "source-map",
    entry: {
      taskpane: "./src/taskpane/index.tsx",
      commands: "./src/commands/commands.ts",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      // 플랫폼 서버는 .js 를 1년 캐시(immutable)하므로 이름에 내용 해시를 붙인다
      filename: isProd ? "[name].[contenthash:8].js" : "[name].js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          // tsconfig 는 noEmit:true (에디터/`tsc --noEmit` 타입체크용).
          // 번들 생성을 위해 ts-loader 에서만 emit 을 켜준다.
          use: {
            loader: "ts-loader",
            options: { compilerOptions: { noEmit: false } },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
          type: "asset/resource",
          generator: { filename: "assets/[name][ext]" },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["taskpane"],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["commands"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "assets", to: "assets", noErrorOnMissing: true },
          { from: isProd ? "manifest.prod.xml" : "manifest.xml", to: "manifest.xml" },
          { from: "src/taskpane/unsupported.html", to: "unsupported.html" },
        ],
      }),
    ],
  };

  if (!isProd) {
    const httpsOptions = await devCerts.getHttpsServerOptions();
    config.devServer = {
      hot: true,
      headers: { "Access-Control-Allow-Origin": "*" },
      server: {
        type: "https",
        options: {
          key: httpsOptions.key,
          cert: httpsOptions.cert,
          ca: httpsOptions.ca,
        },
      },
      // /api 요청을 PHP 서버로 프록시.
      // 기본: 배포된 hom2box 서버 (로컬에 PHP가 없어도 실데이터 확인 가능)
      // 로컬 PHP로 테스트하려면 target 을 "http://localhost:8000" 으로 바꾸세요.
      proxy: [
        {
          context: ["/api"],
          target: "https://powerplus.hom2box.com",
          secure: true,
          changeOrigin: true,
        },
      ],
      port: 3000,
    };
  }

  return config;
};
