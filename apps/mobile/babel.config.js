module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          "react-compiler": {
            sources: (filename) =>
              /\.[jt]sx?$/.test(filename) && !filename.includes("node_modules"),
          },
        },
      ],
    ],
    plugins: [
      [
        "@tamagui/babel-plugin",
        {
          components: ["tamagui"],
          config: "./tamagui.config.ts",
        },
      ],
      "react-native-worklets/plugin",
    ],
  };
};

