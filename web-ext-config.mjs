export default {
  sourceDir: "dist/firefox",
  artifactsDir: "dist/artifacts",
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ["about:addons"],
    firefox: "firefoxdeveloperedition"
  },
};
