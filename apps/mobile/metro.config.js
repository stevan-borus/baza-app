const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

// tslib's package.json exports map routes the `node` import condition (which
// Expo CLI sets when bundling for SSR) to `./modules/index.js`, whose default
// import + destructure pattern blows up under Metro's CJS interop with
// "Cannot destructure property '__extends' of 'tslib.default' as it is undefined".
// Redirect every `tslib` resolution to the clean ESM file, which exposes the
// helpers as named exports and a default object.
const tslibEsmPath = require.resolve("tslib/tslib.es6.mjs");
const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib") {
    return { type: "sourceFile", filePath: tslibEsmPath };
  }
  if (baseResolveRequest) {
    return baseResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// markdown-it@10 (via react-native-markdown-display, used by the legal-document
// viewer) does a bare `require("punycode")`. That used to resolve to Node's
// built-in, but the React Native runtime ships no Node stdlib, and Metro's
// default package-exports resolution (on by default since RN 0.79, carried into
// SDK 56) no longer silently shims it — so the NATIVE bundle fails with "Unable
// to resolve module punycode" while the web export still tolerated it. Map the
// bare specifier to the userland `punycode` package; the trailing slash forces
// package resolution rather than the deprecated core builtin. (markdown-it 14
// dropped this bare import — deduping to it is a cleaner follow-up but a 10→14
// major jump, so deferred.)
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  punycode: require.resolve("punycode/"),
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
