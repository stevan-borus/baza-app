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

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
