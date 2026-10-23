import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createContext, runInContext } from "node:vm";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo/package.json"));
const metroRequire = createRequire(expoRequire.resolve("@expo/metro-config"));
const { transformSync } = metroRequire("@babel/core");
const { importExportPlugin, addParamsToDefineCall } = metroRequire(
  "metro-transform-plugins",
);
const { wrapModuleString } = metroRequire(
  "metro/private/ModuleGraph/worker/JsFileWrapping",
);

it("loads native LegendList in Metro without reading unused React Native getters", () => {
  const packageDir = path.dirname(require.resolve("@legendapp/list/react-native"));
  const manifest = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8"),
  );
  const filename = path.join(
    packageDir,
    manifest.exports["./react-native"]["react-native"].import,
  );
  const transformed = transformSync(readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      [
        importExportPlugin,
        { importAll: "_importAll", importDefault: "_importDefault" },
      ],
    ],
  });

  const reactNative = {
    Animated: { View: "View", ScrollView: "ScrollView" },
    Platform: { OS: "ios" },
    View: "View",
    Text: "Text",
    PixelRatio: { get: () => 3 },
    StyleSheet: { flatten: (style: unknown) => style },
    RefreshControl: "RefreshControl",
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    I18nManager: { isRTL: false },
    unstable_batchedUpdates: (run: () => void) => run(),
  };
  let unusedGetterReads = 0;
  Object.defineProperty(reactNative, "PushNotificationIOS", {
    enumerable: true,
    get() {
      unusedGetterReads++;
      throw new Error(
        "PushNotificationIOS: NativeEventEmitter requires a non-null native module",
      );
    },
  });

  // Use Metro's real loader: its importAll reads enumerable export getters.
  const runtime = createContext({ __DEV__: false, __METRO_GLOBAL_PREFIX__: "" });
  runtime.global = runtime;
  runInContext(
    readFileSync(metroRequire.resolve("metro-runtime/polyfills/require"), "utf8"),
    runtime,
  );
  const dependencies = {
    react: require("react"),
    "react-native": reactNative,
    "use-sync-external-store/shim": require("use-sync-external-store/shim"),
  };
  for (const [name, exports] of Object.entries(dependencies)) {
    runtime.__d(
      (
        _global: unknown,
        _require: unknown,
        _default: unknown,
        _all: unknown,
        module: { exports: unknown },
      ) => {
        module.exports = exports;
      },
      name,
    );
  }
  runInContext(
    addParamsToDefineCall(
      wrapModuleString(transformed.code, "", {
        importDefaultName: "_importDefault",
        importAllName: "_importAll",
      }),
      "legend-list-native",
    ),
    runtime,
    { filename },
  );

  const loaded = runtime.__r("legend-list-native");
  expect(loaded.LegendList).toBeDefined();
  expect(unusedGetterReads).toBe(0);
});
