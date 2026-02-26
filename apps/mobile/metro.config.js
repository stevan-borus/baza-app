const { getDefaultConfig } = require("expo/metro-config");
const { withTamagui } = require("@tamagui/metro-plugin");

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

module.exports = withTamagui(config, {
  config: "./tamagui.config.ts",
  components: ["tamagui"],
});
