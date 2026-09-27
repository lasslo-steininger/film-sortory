const path = require("node:path");

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.join(__dirname, "assets", "icon.ico"),
    extraResource: [path.join(__dirname, ".next", "standalone")],
    prune: false,
    ignore(filePath) {
      const relative = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
      if (!relative) return false;
      return !["package.json", "electron"].includes(relative.split("/")[0]);
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "filmSortory",
        setupExe: "filmSortory-Setup.exe",
        setupIcon: path.join(__dirname, "assets", "icon.ico"),
      },
    },
    { name: "@electron-forge/maker-zip", platforms: ["win32"] },
  ],
};
